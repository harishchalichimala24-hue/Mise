from time import perf_counter
from datetime import datetime, timezone
from functools import lru_cache
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.neighbors import KNeighborsRegressor
from sklearn.svm import SVR
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor, DMatrix
from .dataset import CAT, NUM, FEATURES, TARGET, bins

NAMES = dict(
    linear="Linear Regression",
    knn="K-Nearest Neighbors",
    svr="Support Vector Regression",
    forest="Random Forest",
    xgb="XGBoost",
)
DEFAULT = dict(
    linear=dict(fit_intercept=True),
    knn=dict(n_neighbors=9, weights="distance", metric="euclidean"),
    svr=dict(C=16.0, gamma="scale", epsilon=0.2),
    forest=dict(n_estimators=90, max_depth=13, min_samples_leaf=2),
    xgb=dict(n_estimators=125, max_depth=4, learning_rate=0.09, subsample=0.9),
)
LIMITS = dict(
    n_neighbors=(1, 100),
    n_estimators=(5, 350),
    max_depth=(1, 30),
    min_samples_leaf=(1, 50),
    C=(0.01, 1000),
    epsilon=(0, 10),
    learning_rate=(0.001, 1),
    subsample=(0.05, 1),
)
OPTIONS = dict(
    weights=["uniform", "distance"],
    metric=["euclidean", "manhattan"],
    gamma=["scale", "auto"],
)
TREE = {"forest", "xgb"}


def parameters(key, edits):
    config = DEFAULT[key].copy()
    for name, val in edits.items():
        if name not in config:
            raise ValueError(f"Unknown parameter: {name}")
        if name in OPTIONS:
            if val not in OPTIONS[name]:
                raise ValueError(f"Invalid {name}")
        elif name == "fit_intercept":
            if type(val) is not bool:
                raise ValueError("fit_intercept requires a boolean")
        else:
            lo, hi = LIMITS[name]
            if type(val) not in (int, float) or not lo <= val <= hi:
                raise ValueError(f"{name} must be {lo} to {hi}")
            if type(config[name]) is int and type(val) is not int:
                raise ValueError(f"{name} requires an integer")
        config[name] = val
    return config


def pipeline(key, config, seed):
    numbers = [("impute", SimpleImputer(strategy="median"))]
    if key not in TREE:
        numbers.append(("scale", StandardScaler()))
    cats = Pipeline(
        [
            ("impute", SimpleImputer(strategy="most_frequent")),
            (
                "encode",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False,
                    drop="first" if key == "linear" else None,
                ),
            ),
        ]
    )
    prep = ColumnTransformer([("num", Pipeline(numbers), NUM), ("cat", cats, CAT)])
    params = config.copy()
    if key in TREE:
        params.update(random_state=seed, n_jobs=2)
    cls = dict(
        linear=LinearRegression,
        knn=KNeighborsRegressor,
        svr=SVR,
        forest=RandomForestRegressor,
        xgb=XGBRegressor,
    )[key]
    return Pipeline([("prep", prep), ("model", cls(**params))])


def scores(y, pred):
    mse = float(mean_squared_error(y, pred))
    return dict(
        mae=float(mean_absolute_error(y, pred)),
        mse=mse,
        rmse=float(np.sqrt(mse)),
        r2=float(r2_score(y, pred)),
    )


def fit(key, df, splits, seed, config, dataset):
    started = perf_counter()
    pipe = pipeline(key, config, seed)
    x, y = df[FEATURES], df[TARGET]
    train, val, test = (splits[k] for k in ("train", "validation", "test"))
    fit_started = perf_counter()
    pipe.fit(x.iloc[train], y.iloc[train])
    fit_seconds = perf_counter() - fit_started
    valid = scores(y.iloc[val], pipe.predict(x.iloc[val]))
    pred = pipe.predict(x.iloc[test])
    actual = y.iloc[test].to_numpy()
    resid = actual - pred
    sample = x.iloc[val[: min(128, len(val))]]
    perm = permutation_importance(
        pipe,
        sample,
        y.loc[sample.index],
        scoring="neg_mean_absolute_error",
        n_repeats=3,
        random_state=seed,
    )
    importance = [
        {"feature": f, "value": float(v)}
        for f, v in zip(FEATURES, perm.importances_mean)
    ]
    summary = dict(
        model=key,
        config=config,
        version=dataset,
        validation=valid,
        test=scores(actual, pred),
        seconds=perf_counter() - started,
        fit_seconds=fit_seconds,
        trained=datetime.now(timezone.utc).isoformat(),
        residual=dict(
            mean=float(resid.mean()),
            std=float(resid.std()),
            p05=float(np.quantile(resid, 0.05)),
            median=float(np.median(resid)),
            p95=float(np.quantile(resid, 0.95)),
        ),
        points=[
            dict(id=int(i), actual=float(a), pred=float(p), residual=float(r))
            for i, a, p, r in zip(test, actual, pred, resid)
        ],
        histogram=bins(resid),
        importance=sorted(importance, key=lambda d: -d["value"]),
    )
    if key in TREE:
        indices = feature_indices(pipe)
        vals = np.bincount(
            indices, weights=pipe[-1].feature_importances_, minlength=len(FEATURES)
        )
        summary["native"] = [
            {"feature": f, "value": float(v)}
            for f, v in sorted(zip(FEATURES, vals), key=lambda pair: -pair[1])
        ]
    return pipe, summary


def feature_indices(pipe):
    enc = pipe[0].named_transformers_["cat"][-1]
    return np.array(
        [FEATURES.index(f) for f in NUM]
        + [FEATURES.index(f) for f, c in zip(CAT, enc.categories_) for _ in c]
    )


@lru_cache(maxsize=3)
def forest_explainer(model):
    import shap

    return shap.TreeExplainer(model)


def contributions(key, pipe, x, reference):
    if key in TREE:
        arr = pipe[0].transform(x)
        model = pipe[-1]
        if key == "xgb":
            matrix = model.get_booster().predict(DMatrix(arr), pred_contribs=True)
            raw, base = matrix[:, :-1], float(matrix[0, -1])
        else:
            exp = forest_explainer(model)
            raw = exp.shap_values(arr, check_additivity=False)
            base = float(np.asarray(exp.expected_value).reshape(-1)[0])
        indices = feature_indices(pipe)
        vals = np.column_stack(
            [raw[:, indices == i].sum(axis=1) for i in range(len(FEATURES))]
        )
        return base, vals, "Tree SHAP"
    # Exact additive path from one training reference in two opposing feature orders.
    baseline = reference.to_dict()
    chains = []
    for row in x.to_dict("records"):
        for order in (FEATURES, FEATURES[::-1]):
            curr = baseline.copy()
            chains.append(curr.copy())
            for f in order:
                curr[f] = row[f]
                chains.append(curr.copy())
    all_pred = pipe.predict(pd.DataFrame(chains)[FEATURES]).reshape(
        len(x), 2, len(FEATURES) + 1
    )
    diffs = np.diff(all_pred, axis=2)
    return (
        float(all_pred[0, 0, 0]),
        (diffs[:, 0] + diffs[:, 1, ::-1]) / 2,
        "Two-order reference decomposition",
    )
