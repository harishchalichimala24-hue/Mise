"""Stateless readiness API and reusable Python entry point for restaurant applications."""

from math import ceil
from typing import Annotated, Callable, Literal

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from . import dataset as ds
from . import models as ml
from .responses import ScheduledTask
from .scheduler import (
    ACTIVE,
    NEW,
    POLICY,
    STATION,
    InputModel,
    Name,
    Scenario,
    Station,
    simulate,
)

ModelKey = Literal["linear", "knn", "svr", "forest", "xgb"]
DishName = Literal["Burger", "Pizza", "Sandwich", "Coffee", "Smoothie"]
Period = Literal["Morning", "Lunch", "Afternoon", "Dinner"]
Day = Literal[
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
]
COMPLEXITY = {"Burger": 3, "Pizza": 4, "Sandwich": 2, "Coffee": 1, "Smoothie": 2}
CAPACITIES = {"Grill": 1, "Oven": 1, "Prep": 1, "Beverage": 1}


class OrderItem(InputModel):
    id: Name | None = None
    dish: DishName
    quantity: int = Field(default=1, ge=1, le=30)
    complexity: int | None = Field(default=None, ge=1, le=5)
    depends_on: list[Name] = Field(default_factory=list, max_length=40)


class Kitchen(InputModel):
    staff: int = Field(default=3, ge=1, le=25)
    capacities: dict[Station, Annotated[int, Field(ge=0, le=16)]] = Field(
        default_factory=lambda: CAPACITIES.copy()
    )
    workload: float = Field(default=45, ge=0, le=100)
    period: Period = "Lunch"
    day: Day = "Tuesday"

    @model_validator(mode="after")
    def fill_station_capacities(self):
        self.capacities = {**CAPACITIES, **self.capacities}
        return self


class PendingOrder(InputModel):
    id: Name
    accepted_minutes_ago: float = Field(default=0, ge=0, le=1440)
    items: list[OrderItem] = Field(min_length=1, max_length=40)


class ActiveTask(InputModel):
    station: Station
    remaining_minutes: float = Field(gt=0, le=1440)


def normalize_items(items):
    return [
        dict(
            id=item.id or f"item-{index + 1}",
            dish=item.dish,
            quantity=item.quantity,
            complexity=item.complexity
            if item.complexity is not None
            else COMPLEXITY[item.dish],
            depends_on=item.depends_on,
        )
        for index, item in enumerate(items)
    ]


class EstimateRequest(InputModel):
    order_id: Name
    items: list[OrderItem] = Field(min_length=1, max_length=40)
    kitchen: Kitchen = Field(default_factory=Kitchen)
    pending_orders: list[PendingOrder] = Field(default_factory=list, max_length=40)
    active_tasks: list[ActiveTask] = Field(default_factory=list, max_length=25)
    model: Literal["recommended", "linear", "knn", "svr", "forest", "xgb"] = (
        "recommended"
    )
    include_schedule: bool = False

    def scenario(self):
        return Scenario(
            id="integration",
            name="Application order",
            description="Stateless estimate from a caller-supplied kitchen snapshot.",
            order=normalize_items(self.items),
            pending=[
                dict(
                    id=order.id,
                    accepted=-order.accepted_minutes_ago,
                    items=normalize_items(order.items),
                )
                for order in self.pending_orders
            ],
            active=[
                dict(station=task.station, remaining=task.remaining_minutes)
                for task in self.active_tasks
            ],
            **self.kitchen.model_dump(),
        )

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.order_id in [o.id for o in self.pending_orders]:
            raise ValueError("The new order_id already appears in pending_orders")
        self.scenario()
        return self


class ModelReference(BaseModel):
    id: ModelKey
    dataset_version: str
    trained_at: str


class IntegrationTask(ScheduledTask):
    customer_order_id: str | None = None


class EstimateResponse(BaseModel):
    order_id: str
    estimated_ready_in_minutes: int
    readiness_minutes: float
    waiting_minutes: float
    model: ModelReference
    data_source: Literal["synthetic"]
    message: str
    warnings: list[str]
    schedule: list[IntegrationTask] | None = None
    assumptions: list[str]


class EstimateUnavailable(ValueError):
    """The selected dataset has no suitable trained model."""


def estimate_order(workspace, request: EstimateRequest | dict) -> dict:
    """Calculate from one consistent fitted-model snapshot without changing stored data."""
    request = EstimateRequest.model_validate(request)
    meta, df, splits, bundle = workspace.snapshot()
    if not bundle:
        raise EstimateUnavailable(
            "Train at least one regression model on the active dataset before requesting an estimate."
        )
    key = request.model
    if key == "recommended":
        key = min(
            bundle, key=lambda model: (bundle[model][1]["validation"]["mae"], model)
        )
    if key not in bundle:
        raise EstimateUnavailable(
            f"Train {ml.NAMES[key]} on the active dataset before requesting this model."
        )
    pipe, run = bundle[key]
    train = df.iloc[splits["train"]]
    bounds = {
        feature: (float(train[feature].min()), float(train[feature].max()))
        for feature in ds.NUM
    }
    beyond = set()
    clamped = False

    def predict(features):
        nonlocal clamped
        beyond.update(
            feature
            for feature, (lo, hi) in bounds.items()
            if not lo <= features[feature] <= hi
        )
        duration = float(pipe.predict(pd.DataFrame([features])[ds.FEATURES])[0])
        clamped = clamped or duration < 0.1
        return duration

    result = simulate(request.scenario(), key, predict)
    rounded = ceil(result["ready"])
    warnings = [
        "This estimate uses models trained on synthetic restaurant data. It is a demonstration estimate."
    ]
    if beyond:
        warnings.append(
            "Some scheduled batches exceed the model's observed training ranges for "
            + ", ".join(ds.LABEL[f] for f in ds.NUM if f in beyond)
            + "."
        )
    if clamped:
        warnings.append(
            "A predicted duration below 0.1 minute was raised to 0.1 minute for scheduling."
        )
    out = dict(
        order_id=request.order_id,
        estimated_ready_in_minutes=rounded,
        readiness_minutes=result["ready"],
        waiting_minutes=result["wait"],
        model=dict(id=key, dataset_version=meta["version"], trained_at=run["trained"]),
        data_source="synthetic",
        message=f"Your order will be ready in approximately {rounded} {'minute' if rounded == 1 else 'minutes'}.",
        warnings=warnings,
        assumptions=[
            POLICY,
            "All times are minutes from this request's kitchen snapshot. waiting_minutes ends when the first new-order task starts.",
            "Each item is one batch occupying one station slot and one cook for its full duration.",
            "Existing active tasks occupy a station and a cook until their supplied remaining duration elapses.",
            "The prior average is a fixed synthetic dish baseline plus one minute. Queue workload is estimated from active remaining work and older batch sizes.",
            f"Kitchen snapshot uses {request.kitchen.staff} cooks, {request.kitchen.workload:g}% utilization, "
            f"{request.kitchen.period} on {request.kitchen.day}. Unspecified station capacities default to one.",
            "Recommendation uses minimum validation MAE among fitted models on this dataset."
            if request.model == "recommended"
            else "The caller selected the regression model.",
        ],
    )
    if request.include_schedule:
        out["schedule"] = [
            dict(
                **task,
                customer_order_id=request.order_id
                if task["order"] == NEW
                else None
                if task["order"] == ACTIVE
                else task["order"],
            )
            for task in result["tasks"]
        ]
    return out


def menu():
    return dict(
        data_source="synthetic",
        dishes=[
            dict(
                dish=dish,
                station=STATION[dish],
                default_complexity=COMPLEXITY[dish],
                default_quantity=1,
                prior_average_minutes=ds.DISH[dish] + 1,
            )
            for dish in ds.DISH
        ],
        kitchen_defaults=Kitchen().model_dump(),
        model_default="recommended",
        models=ml.NAMES,
        include_schedule_default=False,
        limits=dict(
            quantity=[1, 30],
            complexity=[1, 5],
            staff=[1, 25],
            station_capacity=[0, 16],
            workload=[0, 100],
            items_per_order=40,
            pending_orders=40,
            total_waiting_items=150,
            active_tasks=25,
            remaining_minutes=[0, 1440],
            accepted_minutes_ago=[0, 1440],
        ),
        periods=ds.PERIOD,
        days=ds.DAYS,
        notes=[
            "remaining_minutes must be greater than zero.",
            "A station used by any submitted dish needs a positive capacity.",
            "Active tasks reserve one cook and one station slot each.",
            "Items with omitted IDs receive item-1, item-2 and so on within their order.",
            "Dependency IDs reference items within the same order.",
            "Pending order IDs must be unique and cannot be New order or In progress.",
            "Each request calculates from the supplied snapshot and creates no persistent queue records.",
        ],
    )


def create_router(workspace_dependency: Callable):
    """Mount with app.include_router(create_router(lambda: workspace))."""
    router = APIRouter(prefix="/api/v1", tags=["Application integration"])

    @router.get("/menu")
    def get_menu():
        return menu()

    @router.post(
        "/estimate",
        response_model=EstimateResponse,
        response_model_exclude_none=True,
        responses={
            409: {"description": "A fitted regression model is required"},
            422: {"description": "Invalid order or kitchen snapshot"},
        },
    )
    def estimate(body: EstimateRequest, workspace=Depends(workspace_dependency)):
        try:
            return estimate_order(workspace, body)
        except EstimateUnavailable as exc:
            raise HTTPException(409, str(exc)) from exc

    return router
