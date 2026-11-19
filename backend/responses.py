"""Public response contracts for the experiment and service endpoints."""

from typing import Any
from pydantic import BaseModel, ConfigDict


class ApiRecord(BaseModel):
    model_config = ConfigDict(extra="allow")


class MetricSet(BaseModel):
    mae: float
    mse: float
    rmse: float
    r2: float


class Run(ApiRecord):
    model: str
    config: dict[str, Any]
    version: str
    validation: MetricSet
    test: MetricSet
    seconds: float
    trained: str


class DataVersion(ApiRecord):
    version: str
    rows: int
    seed: int
    noise: float


class Dataset(DataVersion):
    splits: dict[str, int]
    features: list[str]
    labels: dict[str, str]


class Job(BaseModel):
    running: bool
    message: str
    completed: int
    total: int
    error: str | None


class WorkspaceState(ApiRecord):
    dataset: Dataset
    versions: list[DataVersion]
    names: dict[str, str]
    results: dict[str, Run]
    recommended: str | None
    job: Job
    history: list[Run]


class Contribution(BaseModel):
    method: str
    base: float
    values: dict[str, float]


class Prediction(BaseModel):
    version: str
    model: str
    predictions: dict[str, float]
    warnings: list[str]
    explanation: Contribution


class ScheduledTask(ApiRecord):
    id: str
    order: str
    dish: str
    station: str
    start: float
    end: float
    duration: float
    wait: float
    accepted: float
    slot: int
    staff: int
    quantity: int
    depends_on: list[str]
    active: bool


class TraceStep(BaseModel):
    title: str
    operation: str
    input: str
    output: str


class Schedule(BaseModel):
    model: str
    version: str
    ready: float
    prep: float
    wait: float
    tasks: list[ScheduledTask]
    trace: list[TraceStep]
    position: int
    critical: str
    policy: str
