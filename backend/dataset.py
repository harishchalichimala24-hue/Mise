"""Independent synthetic dish batches. Duration excludes time waiting to start."""

from pathlib import Path
import hashlib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "runtime" / "data"
DATA.mkdir(exist_ok=True, parents=True)
DISH = {"Burger": 7.5, "Pizza": 11.5, "Sandwich": 4.5, "Coffee": 2.5, "Smoothie": 3.8}
PERIOD = ["Morning", "Lunch", "Afternoon", "Dinner"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
CAT = ["dish", "period", "day"]
NUM = [
    "quantity",
    "complexity",
    "pending",
    "queue_work",
    "workload",
    "staff",
    "capacity",
    "recent_avg",
]
FEATURES = CAT + NUM
TARGET = "prep_minutes"
LABEL = dict(
    dish="Dish type",
    period="Service period",
    day="Day of week",
    quantity="Batch quantity",
    complexity="Dish complexity",
    pending="Pending orders",
    queue_work="Queued work (min)",
    workload="Kitchen utilization (%)",
    staff="Available staff",
    capacity="Station capacity",
    recent_avg="Prior dish average (min)",
    prep_minutes="Preparation duration (min)",
)


def generate(size=6000, seed=42, noise=1.35):
    rng = np.random.default_rng(seed)
    dish = rng.choice(list(DISH), size, p=[0.28, 0.21, 0.21, 0.18, 0.12])
    base = np.array([DISH[d] for d in dish])
    period = rng.choice(PERIOD, size, p=[0.2, 0.36, 0.14, 0.3])
    day = rng.choice(DAYS, size)
    peak = np.isin(period, ["Lunch", "Dinner"]).astype(int)
    weekend = np.isin(day, DAYS[-2:]).astype(int)
    workload = np.round(
        np.clip(rng.normal(32 + peak * 31 + weekend * 8, 16), 5, 100)
    ).astype(int)
    pending = rng.poisson(1 + workload / 11)
    queue_work = np.round(pending * rng.uniform(2, 8, size), 1)
    complexity = np.clip(np.rint(base / 3 + rng.normal(0.5, 1, size)), 1, 5).astype(int)
    qty = rng.choice(range(1, 7), size, p=[0.42, 0.25, 0.15, 0.1, 0.05, 0.03])
    staff = rng.integers(1, 8, size)
    cap = rng.integers(1, 4, size)
    recent = np.round(np.maximum(1, base + rng.normal(1, 1.2, size)), 2)
    y = (
        base
        + 1.1 * complexity
        + (qty - 1) ** 0.85 * (0.45 + base * 0.15)
        + (workload / 100) ** 2 * 4.3
        + np.maximum(workload - 65, 0) / 24 * (qty / 2)
        + 0.04 * pending
        + 0.007 * queue_work
        - 0.7 * np.log(staff)
        - 0.5 * np.log(cap)
        + 0.32 * (recent - base)
        + rng.normal(0, noise, size)
    )
    return pd.DataFrame(
        dict(
            dish=dish,
            period=period,
            day=day,
            quantity=qty,
            complexity=complexity,
            pending=pending,
            queue_work=queue_work,
            workload=workload,
            staff=staff,
            capacity=cap,
            recent_avg=recent,
            prep_minutes=np.round(np.maximum(0.5, y), 2),
        )
    )


def split(df, seed):
    train, rest = train_test_split(
        np.arange(len(df)), test_size=0.30, random_state=seed
    )
    val, test = train_test_split(rest, test_size=0.5, random_state=seed)
    return {"train": train, "validation": val, "test": test}


def bins(values, count=18):
    heights, edges = np.histogram(values, bins=count)
    return [
        {"x": float((a + b) / 2), "lo": float(a), "hi": float(b), "count": int(n)}
        for a, b, n in zip(edges, edges[1:], heights)
    ]


def version(size, seed, noise):
    token = hashlib.sha256(f"mise-1/{size}/{seed}/{noise:.4f}".encode()).hexdigest()[:8]
    return "KS-" + token.upper()


def explore(df, feature):
    counts = df[feature].value_counts().to_dict() if feature in CAT else None
    groups = df.groupby("dish")[[TARGET]].mean().round(3)
    corr = df[NUM + [TARGET]].corr().round(3)
    return dict(
        distribution=[{"x": k, "count": int(v)} for k, v in counts.items()]
        if counts
        else bins(df[feature]),
        dishes=[
            {"dish": k, "mean": float(row[TARGET])} for k, row in groups.iterrows()
        ],
        correlations=corr[TARGET].drop(TARGET).to_dict(),
    )
