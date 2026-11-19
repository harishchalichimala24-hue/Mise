from typing import Literal
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict
from . import dataset as ds
from . import models as ml
from . import responses as out
from .integration import create_router
from .ordering import create_router as create_shop_router
from .store import Workspace, Busy, explanation_sample
from .scheduler import SCENARIOS, Scenario, simulate as schedule

workspace = Workspace()
app = FastAPI(title="Mise Kitchen Intelligence", version="1.1.0")
app.include_router(create_router(lambda: workspace))
app.include_router(create_shop_router(workspace_dependency=lambda: workspace))
Model = Literal["linear", "knn", "svr", "forest", "xgb"]


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Generate(Body):
    size: int = Field(default=6000, ge=300, le=25000)
    seed: int = Field(default=42, ge=0, le=2147483647)
    noise: float = Field(default=1.35, ge=0.05, le=8, multiple_of=0.0001)


class Select(Body):
    version: str = Field(pattern=r"^KS-[0-9A-F]{8}$")


class Train(Body):
    model: Literal["all", "linear", "knn", "svr", "forest", "xgb"] = "all"
    params: dict[str, dict] = {}


class Input(Body):
    dish: Literal["Burger", "Pizza", "Sandwich", "Coffee", "Smoothie"]
    period: Literal["Morning", "Lunch", "Afternoon", "Dinner"]
    day: Literal[
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
    ]
    quantity: int = Field(ge=1, le=100)
    complexity: int = Field(ge=1, le=5)
    pending: int = Field(ge=0, le=300)
    queue_work: float = Field(ge=0, le=5000)
    workload: float = Field(ge=0, le=100)
    staff: int = Field(ge=1, le=60)
    capacity: int = Field(ge=1, le=30)
    recent_avg: float = Field(gt=0, le=300)


class Predict(Body):
    order: Input
    model: Model
    compare: bool = True


class Simulation(Body):
    scenario: Scenario
    model: Model


@app.exception_handler(Busy)
def busy(request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.get("/api/health")
def health():
    return {"status": "online", "service": "Mise"}


@app.get("/api/state", response_model=out.WorkspaceState)
@app.get("/api/models/status", response_model=out.WorkspaceState)
def state():
    return workspace.state()


@app.get("/api/dataset/summary")
def summary():
    return workspace.snapshot()[0]


@app.post("/api/dataset/generate", response_model=out.WorkspaceState)
def generate(body: Generate):
    workspace.generate(body.size, body.seed, body.noise)
    return workspace.state()


@app.post("/api/dataset/select", response_model=out.WorkspaceState)
def select(body: Select):
    try:
        workspace.open(body.version)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    return workspace.state()


@app.get("/api/dataset/explore")
@app.get("/api/dataset/preview")
def explore(feature: str = ds.TARGET, page: int = Query(1, ge=1)):
    meta, df, splits, _ = workspace.snapshot()
    if feature not in ds.FEATURES + [ds.TARGET]:
        raise HTTPException(422, "Unknown feature")
    pages = (len(df) + 19) // 20
    if page > pages:
        raise HTTPException(422, "Page exceeds dataset size")
    stats = []
    for f in df:
        field = dict(feature=f, dtype=str(df[f].dtype), missing=int(df[f].isna().sum()))
        if f not in ds.CAT:
            field.update(
                {
                    k: float(v)
                    for k, v in df[f].describe()[["mean", "min", "max", "std"]].items()
                }
            )
        stats.append(field)
    sample = df.sample(min(350, len(df)), random_state=meta["seed"])
    return dict(
        **ds.explore(df, feature),
        version=meta["version"],
        pages=pages,
        preview=df.iloc[(page - 1) * 20 : page * 20].to_dict("records"),
        stats=stats,
        matrix=df[ds.NUM + [ds.TARGET]].corr().round(4).to_dict(),
        scatter=[
            {"x": v, "y": float(y)} for v, y in zip(sample[feature], sample[ds.TARGET])
        ],
    )


@app.post("/api/models/train", status_code=202, response_model=out.Job)
def train(body: Train):
    try:
        return workspace.start(body.model, body.params)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


def fitted(bundle, key):
    if key not in bundle:
        raise HTTPException(409, f"Train {ml.NAMES[key]} on this dataset first.")
    return bundle[key]


@app.get("/api/models/evaluation")
@app.get("/api/models/comparison")
def evaluation():
    s = workspace.state()
    return {k: s[k] for k in ["dataset", "results", "recommended"]}


@app.get("/api/models/plots")
def plots(model: Model):
    return fitted(workspace.snapshot()[3], model)[1]


@app.get("/api/models/explainability")
def explanations(model: Model):
    meta, _, _, bundle = workspace.snapshot()
    pipe, s = fitted(bundle, model)
    return dict(
        **explanation_sample(pipe, model, meta["version"], s["trained"]),
        importance=s["importance"],
        native=s.get("native", []),
    )


@app.post("/api/predict", response_model=out.Prediction)
@app.post("/api/predict/compare", response_model=out.Prediction)
def predict(body: Predict):
    meta, df, splits, bundle = workspace.snapshot()
    pipe, _ = fitted(bundle, body.model)
    x = pd.DataFrame([body.order.model_dump()])[ds.FEATURES]
    compare = bundle if body.compare else {body.model: bundle[body.model]}
    predictions = {k: float(p.predict(x)[0]) for k, (p, _) in compare.items()}
    base, values, method = ml.contributions(
        body.model, pipe, x, df.iloc[splits["train"][0]][ds.FEATURES]
    )
    train_df = df.iloc[splits["train"]]
    warnings = []
    for key in ds.NUM:
        lo, hi = train_df[key].min(), train_df[key].max()
        if not lo <= x[key].iloc[0] <= hi:
            warnings.append(
                f"{ds.LABEL[key]} is outside the training range ({lo:g}–{hi:g})."
            )
    return dict(
        version=meta["version"],
        model=body.model,
        predictions=predictions,
        warnings=warnings,
        explanation=dict(
            method=method,
            base=base,
            values=dict(zip(ds.FEATURES, map(float, values[0]))),
        ),
    )


@app.get("/api/scenarios")
def scenarios():
    return SCENARIOS


@app.post("/api/simulate", response_model=out.Schedule)
def simulate(body: Simulation):
    meta, _, _, bundle = workspace.snapshot()
    pipe, _ = fitted(bundle, body.model)
    result = schedule(
        body.scenario,
        body.model,
        lambda inputs: float(pipe.predict(pd.DataFrame([inputs])[ds.FEATURES])[0]),
    )
    return dict(**result, version=meta["version"])


dist = ds.ROOT / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
