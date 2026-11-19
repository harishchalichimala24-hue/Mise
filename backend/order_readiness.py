"""Model-based estimates against immutable customer-order resource reservations."""

from datetime import datetime, timezone
from math import ceil, isfinite
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

import pandas as pd
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from . import dataset as ds
from .scheduler import STATION, allocate_reserved_tasks

CAPACITIES = {"Grill": 1, "Oven": 1, "Prep": 1, "Beverage": 1}
Station = Literal["Grill", "Oven", "Prep", "Beverage"]
Capacity = Annotated[int, Field(strict=True, ge=0, le=16)]


class KitchenSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    staff: int = Field(default=3, strict=True, ge=1, le=25)
    capacities: dict[Station, Capacity] = Field(
        default_factory=lambda: CAPACITIES.copy()
    )
    workload: float = Field(default=45, ge=0, le=100)
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"

    @model_validator(mode="after")
    def complete_capacities(self):
        self.capacities = {**CAPACITIES, **self.capacities}
        return self


class KitchenUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    staff: int | None = Field(default=None, strict=True, ge=1, le=25)
    capacities: dict[Station, Capacity] | None = None
    workload: float | None = Field(default=None, ge=0, le=100)


class ReadinessItem(BaseModel):
    id: str
    dish: str
    quantity: int
    station: str
    starts_at: str
    finishes_at: str
    prep_minutes: float
    wait_minutes: float


class ReadinessModel(BaseModel):
    id: str
    dataset_version: str
    trained_at: str


class Readiness(BaseModel):
    estimated_ready_at: str
    estimated_ready_in_minutes: int
    readiness_minutes: float
    waiting_minutes: float
    orders_ahead: int
    kitchen: KitchenSettings
    model: ReadinessModel
    data_source: Literal["synthetic"]
    warnings: list[str]
    items: list[ReadinessItem]


def iso(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat()


def estimate_booking(workspace, preparation, settings, reservations, now):
    """Return a readiness snapshot and new reservations without persistence side effects."""
    if workspace is None:
        raise HTTPException(
            409, "Train a regression model before confirming this order."
        )
    meta, frame, splits, models = workspace.snapshot()
    if not models:
        raise HTTPException(
            409,
            "Train a regression model on the active dataset before confirming this order.",
        )
    key = min(models, key=lambda k: (models[k][1]["validation"]["mae"], k))
    pipeline, run = models[key]
    train = frame.iloc[splits["train"]]
    bounds = {f: (float(train[f].min()), float(train[f].max())) for f in ds.NUM}
    ahead = len({row["order_id"] for row in reservations})
    work = sum(
        (row["finishes_at"] - max(now, row["starts_at"])) / 60 for row in reservations
    )
    local = datetime.fromtimestamp(now, ZoneInfo(settings.timezone))
    period = (
        "Morning"
        if local.hour < 11
        else "Lunch"
        if local.hour < 15
        else "Afternoon"
        if local.hour < 18
        else "Dinner"
    )
    beyond = set()
    clamped = False
    jobs = []
    for item in preparation:
        station = STATION[item["dish"]]
        capacity = settings.capacities[station]
        if capacity == 0:
            raise HTTPException(
                409,
                f"The {station} station is unavailable. Update kitchen availability before confirming this order.",
            )
        features = dict(
            dish=item["dish"],
            quantity=item["quantity"],
            complexity=item["complexity"],
            pending=ahead,
            queue_work=work,
            workload=settings.workload,
            staff=settings.staff,
            capacity=capacity,
            period=period,
            day=ds.DAYS[local.weekday()],
            recent_avg=ds.DISH[item["dish"]] + 1,
        )
        beyond.update(
            f for f, (lo, hi) in bounds.items() if not lo <= features[f] <= hi
        )
        try:
            predicted = float(
                pipeline.predict(pd.DataFrame([features])[ds.FEATURES])[0]
            )
        except Exception as exc:
            raise HTTPException(
                503,
                "The fitted model could not estimate this order. Train a model and try again.",
            ) from exc
        if not isfinite(predicted):
            raise HTTPException(
                503,
                "The fitted model could not produce a finite duration. Train a model and try again.",
            )
        clamped = clamped or predicted < 0.1
        jobs.append(
            {
                **item,
                "station": station,
                "duration": max(0.1, round(predicted, 3)),
                "depends_on": item.get("depends_on", []),
            }
        )
    occupied = [
        dict(
            station=r["station"],
            slot=r["slot"],
            staff=r["cook"],
            start=max(0.0, (r["starts_at"] - now) / 60),
            end=(r["finishes_at"] - now) / 60,
        )
        for r in reservations
    ]
    scheduled = allocate_reserved_tasks(
        jobs, settings.capacities, settings.staff, occupied
    )
    bookings = [
        dict(
            task_id=t["id"],
            station=t["station"],
            slot=t["slot"],
            cook=t["staff"],
            starts_at=now + t["start"] * 60,
            finishes_at=now + t["end"] * 60,
            prep_minutes=t["duration"],
        )
        for t in scheduled
    ]
    ready = max(t["end"] for t in scheduled)
    warnings = [
        "Preparation predictions use synthetic restaurant data. This is a demonstration estimate."
    ]
    if beyond:
        warnings.append(
            "This order exceeds observed training ranges for "
            + ", ".join(ds.LABEL[f] for f in ds.NUM if f in beyond)
            + "."
        )
    if clamped:
        warnings.append(
            "A predicted duration below 0.1 minute was raised to 0.1 minute for scheduling."
        )
    readiness = dict(
        estimated_ready_at=iso(now + ready * 60),
        estimated_ready_in_minutes=ceil(ready),
        readiness_minutes=ready,
        waiting_minutes=min(t["start"] for t in scheduled),
        orders_ahead=ahead,
        kitchen=settings.model_dump(),
        model=dict(id=key, dataset_version=meta["version"], trained_at=run["trained"]),
        data_source="synthetic",
        warnings=warnings,
        items=[
            dict(
                id=t["id"],
                dish=t["dish"],
                quantity=t["quantity"],
                station=t["station"],
                starts_at=iso(now + t["start"] * 60),
                finishes_at=iso(now + t["end"] * 60),
                prep_minutes=t["duration"],
                wait_minutes=t["start"],
            )
            for t in scheduled
        ],
    )
    return Readiness.model_validate(readiness).model_dump(), bookings
