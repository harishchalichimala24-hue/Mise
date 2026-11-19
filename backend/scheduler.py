"""Deterministic, event-driven parallel kitchen scheduler. Minute zero is order acceptance."""

import json
from collections import Counter
from math import isfinite
from pathlib import Path
from typing import Annotated, Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .dataset import DAYS, DISH, PERIOD

STATION = {
    "Burger": "Grill",
    "Pizza": "Oven",
    "Sandwich": "Prep",
    "Smoothie": "Beverage",
    "Coffee": "Beverage",
}
NEW = "New order"
ACTIVE = "In progress"
POLICY = (
    "At each completion, dispatch the oldest accepted ticket with a ready task, "
    "an available station slot and a cook. Ties follow ticket and item entry order. "
    "Tasks run to completion with one cook and one station slot. Independent tasks may overlap."
)
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
Station = Literal["Grill", "Oven", "Prep", "Beverage"]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Item(InputModel):
    id: Name
    dish: Literal["Burger", "Pizza", "Sandwich", "Smoothie", "Coffee"]
    quantity: int = Field(ge=1, le=30)
    complexity: int = Field(ge=1, le=5)
    depends_on: list[Name] = Field(default_factory=list, max_length=40)


class Ticket(InputModel):
    id: Name
    accepted: float = Field(ge=-1440, le=0)
    items: list[Item] = Field(min_length=1, max_length=40)


class Active(InputModel):
    station: Station
    remaining: float = Field(gt=0, le=1440)


class Scenario(InputModel):
    id: Name
    name: Name
    description: str = Field(max_length=1000)
    order: list[Item] = Field(min_length=1, max_length=40)
    pending: list[Ticket] = Field(default_factory=list, max_length=40)
    active: list[Active] = Field(default_factory=list, max_length=25)
    capacities: dict[Station, Annotated[int, Field(ge=0, le=16)]]
    staff: int = Field(ge=1, le=25)
    workload: float = Field(ge=0, le=100)
    period: str
    day: str

    @model_validator(mode="after")
    def check_plan(self):
        if set(self.capacities) != set(STATION.values()):
            raise ValueError("Supply capacities for Grill, Oven, Prep and Beverage")
        if self.period not in PERIOD or self.day not in DAYS:
            raise ValueError("Choose a valid service period and day of week")
        if len(self.active) > self.staff:
            raise ValueError("Active tasks exceed available cooks")
        for station, count in Counter(a.station for a in self.active).items():
            if count > self.capacities[station]:
                raise ValueError(f"Active tasks exceed {station} capacity")
        order_ids = [o.id for o in self.pending] + [NEW, ACTIVE]
        if len(set(order_ids)) != len(order_ids):
            raise ValueError(
                "Pending ticket names must be unique and avoid reserved ticket names"
            )
        groups = [o.items for o in self.pending] + [self.order]
        if sum(map(len, groups)) > 150:
            raise ValueError("Use up to 150 waiting tasks per simulation")
        for items in groups:
            ids = {item.id for item in items}
            if len(ids) != len(items):
                raise ValueError("Each task needs a unique ID within its ticket")
            resolved = set()
            for item in items:
                if not self.capacities[STATION[item.dish]]:
                    raise ValueError(
                        f"{STATION[item.dish]} needs at least one slot for {item.dish}"
                    )
                if not set(item.depends_on) <= ids:
                    raise ValueError(f"Unknown dependency for task {item.id}")
                if len(item.depends_on) != len(set(item.depends_on)):
                    raise ValueError(f"Duplicate dependency for task {item.id}")
            while len(resolved) < len(ids):
                ready = {item.id for item in items if set(item.depends_on) <= resolved}
                if ready == resolved:
                    raise ValueError("Circular preparation dependencies")
                resolved = ready
        return self


SCENARIOS = [
    Scenario.model_validate(row).model_dump()
    for row in json.loads(
        Path(__file__).with_name("scenarios.json").read_text(encoding="utf-8-sig")
    )
]


def simulate(scenario: Scenario, model: str, predict: Callable[[dict], float]) -> dict:
    scenario = Scenario.model_validate(scenario)
    tickets = sorted(scenario.pending, key=lambda ticket: ticket.accepted)
    tickets.append(Ticket(id=NEW, accepted=0, items=scenario.order))
    trace = []

    def log(title, operation, before, after):
        trace.append(
            dict(title=title, operation=operation, input=str(before), output=str(after))
        )

    log(
        "Accept ticket",
        "Register the customer's batches at minute zero.",
        ", ".join(f"{i.quantity} × {i.dish}" for i in scenario.order),
        f"{len(scenario.order)} tasks in the new order",
    )

    # Queue features are an ex-ante snapshot. Historical service averages proxy queued work.
    # This avoids reusing a prediction as its own input or counting queue delay as service.
    work = sum(a.remaining for a in scenario.active)
    pending = []
    clamped = []
    for pos, ticket in enumerate(tickets):
        for item in ticket.items:
            station = STATION[item.dish]
            features = dict(
                dish=item.dish,
                quantity=item.quantity,
                complexity=item.complexity,
                pending=pos,
                queue_work=round(work, 2),
                workload=scenario.workload,
                staff=scenario.staff,
                capacity=scenario.capacities[station],
                period=scenario.period,
                day=scenario.day,
                recent_avg=DISH[item.dish] + 1,
            )
            raw = float(predict(features))
            if not isfinite(raw):
                raise ValueError("The model produced a non-finite duration")
            duration = max(0.1, round(raw, 3))
            if raw < 0.1:
                clamped.append(f"{ticket.id}/{item.id} ({raw:.2f} → 0.10 min)")
            pending.append(
                dict(
                    id=item.id,
                    order=ticket.id,
                    dish=item.dish,
                    quantity=item.quantity,
                    station=station,
                    duration=duration,
                    accepted=ticket.accepted,
                    depends_on=item.depends_on,
                    active=False,
                    features=features,
                    predicted=float(raw),
                )
            )
        work += sum((DISH[i.dish] + 1) * i.quantity for i in ticket.items)
    target = [t for t in pending if t["order"] == NEW]
    log(
        "Prepare features",
        "Use acceptance-time features and a fixed historical service prior per dish.",
        f"{scenario.period}, {scenario.day}; utilization {scenario.workload:g}%",
        f"{target[0]['features']['pending']} older tickets; estimated queued work {target[0]['features']['queue_work']:.2f} min",
    )
    log(
        "Select model",
        "Use the fitted regression pipeline selected for this simulation.",
        model,
        f"{len(pending)} dish batches submitted",
    )
    log(
        "Predict service times",
        "Predict active preparation minutes per batch. Reserve at least 0.1 min per task.",
        ", ".join(f"{t['dish']} × {t['quantity']}" for t in target),
        ", ".join(f"{t['id']} {t['duration']:.2f} min" for t in target)
        + (". Clamped: " + ", ".join(clamped) if clamped else ""),
    )
    log(
        "Inspect queue",
        "Sort pending tickets by their acceptance offsets.",
        ", ".join(f"{o.id} ({o.accepted:g} min)" for o in tickets),
        f"New ticket position {len(tickets)} of {len(tickets)}",
    )
    log(
        "Inspect resources",
        "Identify available slots and staff. Active work reserves one of each.",
        ", ".join(f"{s} × {n}" for s, n in scenario.capacities.items()),
        f"{scenario.staff} cooks, {len(scenario.active)} already assigned",
    )
    log(
        "Apply dispatch policy",
        POLICY,
        f"{sum(len(i.depends_on) for o in tickets for i in o.items)} task dependencies",
        "Only eligible work can begin",
    )

    cooks = [0.0] * scenario.staff
    slots = {s: [0.0] * n for s, n in scenario.capacities.items()}
    used = Counter()
    tasks = []
    ends = {}
    for idx, a in enumerate(scenario.active):
        lane = used[a.station]
        used[a.station] += 1
        slots[a.station][lane] = cooks[idx] = a.remaining
        tasks.append(
            dict(
                id=f"active-{idx + 1}",
                order=ACTIVE,
                dish="Active service",
                quantity=1,
                station=a.station,
                start=0.0,
                end=a.remaining,
                duration=a.remaining,
                wait=0.0,
                accepted=0.0,
                slot=lane + 1,
                staff=idx + 1,
                depends_on=[],
                active=True,
            )
        )
    now = 0.0
    while pending:
        # Process all dispatchable tasks at this event before advancing the clock.
        remaining = []
        for task in pending:
            station = task["station"]
            cook = next((i for i, t in enumerate(cooks) if t <= now), None)
            lane = next((i for i, t in enumerate(slots[station]) if t <= now), None)
            deps_done = all(
                ends.get((task["order"], dep), float("inf")) <= now
                for dep in task["depends_on"]
            )
            if cook is None or lane is None or not deps_done:
                remaining.append(task)
                continue
            # Use a common endpoint for the timeline, dependent tasks, and both resources.
            end = round(now + task["duration"], 6)
            slots[station][lane] = cooks[cook] = end
            ends[(task["order"], task["id"])] = end
            tasks.append(
                dict(
                    **task,
                    start=now,
                    end=end,
                    wait=round(now - task["accepted"], 6),
                    slot=lane + 1,
                    staff=cook + 1,
                )
            )
        pending = remaining
        if pending:
            future = [t for t in cooks if t > now]
            if not future:
                raise RuntimeError(
                    "No schedulable task after dependency and capacity validation"
                )
            now = min(future)

    new_tasks = [t for t in tasks if t["order"] == NEW]
    first = min(t["start"] for t in new_tasks)
    last = max(new_tasks, key=lambda t: t["end"])
    ready, critical = last["end"], last["id"]
    prep = round(sum(t["duration"] for t in new_tasks), 6)
    occupied_intervals = sorted((t["start"], t["end"]) for t in new_tasks)
    overlap = any(
        a[1] > b[0] for a, b in zip(occupied_intervals, occupied_intervals[1:])
    )
    log(
        "Allocate tasks",
        "Assign the first available compatible slot and cook at each dispatch event.",
        f"{len(tasks)} scheduled or already-active tasks",
        ", ".join(
            f"{t['id']} → {t['station']} {t['slot']}, cook {t['staff']}"
            for t in new_tasks
        ),
    )
    log(
        "Inspect parallel service",
        "Intersect the new ticket's scheduled intervals.",
        ", ".join(f"{t['id']} [{t['start']:.2f}, {t['end']:.2f})" for t in new_tasks),
        "Parallel preparation occurs"
        if overlap
        else "New order tasks run sequentially",
    )
    log(
        "Find the last completion",
        "Take the maximum completion time across the new order's tasks.",
        ", ".join(f"{t['end']:.2f} min" for t in new_tasks),
        f"{critical} finishes at {ready:.2f} min",
    )
    log(
        "Calculate readiness",
        "Subtract the new ticket's acceptance time from its final completion time.",
        f"{ready:.2f} − 0.00 min",
        f"{first:.2f} min before first start; {ready:.2f} min to readiness",
    )
    log(
        "Ready for pickup",
        "Every required batch is scheduled to finish by this time.",
        f"{len(new_tasks)} completed batches; {prep:.2f} total active batch-minutes",
        f"Estimated ready in {ready:.2f} min",
    )
    return dict(
        model=model,
        ready=ready,
        prep=prep,
        wait=first,
        tasks=tasks,
        trace=trace,
        position=len(tickets),
        critical=critical,
        policy=POLICY,
    )


def allocate_reserved_tasks(tasks, capacities, staff, reservations):
    """Place new tasks into common cook/station gaps while preserving every prior interval."""
    station_calendars = {
        (station, slot): []
        for station, capacity in capacities.items()
        for slot in range(1, capacity + 1)
    }
    cook_calendars = {cook: [] for cook in range(1, staff + 1)}
    for reservation in reservations:
        interval = (reservation["start"], reservation["end"])
        station_calendars[reservation["station"], reservation["slot"]].append(interval)
        cook_calendars[reservation["staff"]].append(interval)

    def first_gap(intervals, release, duration):
        candidate = release
        for start, end in sorted(intervals):
            if end <= candidate:
                continue
            if candidate + duration <= start:
                break
            candidate = end
        return candidate

    remaining = list(enumerate(tasks))
    scheduled, finished = [], {}
    while remaining:
        candidates = []
        for index, task in remaining:
            dependencies = task.get("depends_on", [])
            if not all(dep in finished for dep in dependencies):
                continue
            release = max((finished[dep] for dep in dependencies), default=0.0)
            for slot in range(1, capacities[task["station"]] + 1):
                for cook in cook_calendars:
                    intervals = (
                        station_calendars[task["station"], slot] + cook_calendars[cook]
                    )
                    start = first_gap(intervals, release, task["duration"])
                    candidates.append((start, index, slot, cook, task))
        if not candidates:
            raise ValueError(
                "New tasks have invalid dependencies or no compatible resources"
            )
        start, index, slot, cook, task = min(candidates, key=lambda c: c[:4])
        end = start + task["duration"]
        interval = (start, end)
        station_calendars[task["station"], slot].append(interval)
        cook_calendars[cook].append(interval)
        finished[task["id"]] = end
        scheduled.append(dict(**task, start=start, end=end, slot=slot, staff=cook))
        remaining = [(i, t) for i, t in remaining if i != index]
    return scheduled
