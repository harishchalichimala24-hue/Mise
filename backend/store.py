"""One local workspace, with atomic dataset switches and all-or-nothing training batches."""

import json
import os
from threading import RLock, Thread
from uuid import uuid4
from functools import lru_cache
import joblib
import pandas as pd
from . import dataset as ds
from . import models as ml


class Busy(Exception):
    pass


def replace_file(path, writer):
    temp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        writer(temp)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def write_json(path, value):
    replace_file(path, lambda tmp: tmp.write_text(json.dumps(value), encoding="utf-8"))


def run_record(summary):
    fields = (
        "model",
        "config",
        "version",
        "validation",
        "test",
        "seconds",
        "fit_seconds",
        "trained",
    )
    return {field: summary[field] for field in fields if field in summary}


class Workspace:
    def __init__(self):
        self.lock = RLock()
        self.job = dict(
            running=False, message="Ready", completed=0, total=0, error=None
        )
        self.pointer = ds.DATA / "active.json"
        if self.pointer.exists():
            self.open(json.loads(self.pointer.read_text())["version"])
        else:
            self.generate(6000, 42, 1.35)

    def generate(self, size, seed, noise):
        with self.lock:
            if self.job["running"]:
                raise Busy("Wait for the current training run to finish.")
            version = ds.version(size, seed, noise)
            folder = ds.DATA / version
            folder.mkdir(exist_ok=True)
            if not (folder / "meta.json").exists():
                df = ds.generate(size, seed, noise)
                replace_file(
                    folder / "records.csv", lambda p: df.to_csv(p, index=False)
                )
                write_json(
                    folder / "meta.json",
                    dict(version=version, rows=size, seed=seed, noise=noise),
                )
            self.open(version)

    def open(self, version):
        with self.lock:
            if self.job["running"]:
                raise Busy("A training run is using this dataset.")
            folder = ds.DATA / version
            if not (folder / "meta.json").is_file():
                raise ValueError("Unknown dataset version")
            meta = json.loads((folder / "meta.json").read_text())
            df = pd.read_csv(folder / "records.csv")
            splits = ds.split(df, meta["seed"])
            saved = (
                joblib.load(folder / "models.joblib")
                if (folder / "models.joblib").exists()
                else {}
            )
            if saved.get("format") == 2:
                bundle, history = saved["models"], saved["history"]
            else:
                bundle = saved
                history = sorted(
                    (run_record(s) for _, s in bundle.values()),
                    key=lambda r: r["trained"],
                    reverse=True,
                )
            write_json(self.pointer, {"version": version})
            self.folder, self.df, self.splits, self.bundle, self.history = (
                folder,
                df,
                splits,
                bundle,
                history,
            )
            self.meta = dict(
                **meta,
                splits={k: len(v) for k, v in splits.items()},
                features=ds.FEATURES,
                labels=ds.LABEL,
            )
            self.job = dict(
                running=False,
                message="Models ready" if bundle else "Awaiting training",
                completed=0,
                total=0,
                error=None,
            )

    def snapshot(self):
        with self.lock:
            return self.meta, self.df, self.splits, self.bundle

    def state(self):
        with self.lock:
            results = {
                k: {f: v for f, v in s.items() if f not in ("points", "histogram")}
                for k, (_, s) in self.bundle.items()
            }
            recommendation = (
                min(results, key=lambda k: (results[k]["validation"]["mae"], k))
                if results
                else None
            )
            versions = [
                json.loads(p.read_text())
                for p in sorted(
                    ds.DATA.glob("KS-*/meta.json"),
                    key=lambda p: p.stat().st_mtime,
                    reverse=True,
                )
            ]
            return dict(
                dataset=self.meta,
                versions=versions,
                history=self.history,
                names=ml.NAMES,
                defaults=ml.DEFAULT,
                limits=ml.LIMITS,
                options=ml.OPTIONS,
                results=results,
                recommended=recommendation,
                job=self.job.copy(),
            )

    def start(self, key, edits):
        with self.lock:
            if self.job["running"]:
                raise Busy("A training run is already active.")
            keys = list(ml.NAMES) if key == "all" else [key]
            if any(k not in ml.NAMES for k in keys) or set(edits) - set(ml.NAMES):
                raise ValueError("Unknown model")
            configs = {k: ml.parameters(k, edits.get(k, {})) for k in keys}
            self.job = dict(
                running=True,
                message="Starting training",
                completed=0,
                total=len(keys),
                error=None,
            )
            Thread(
                target=self.train, args=(configs,), daemon=True, name="model-training"
            ).start()
            return self.job.copy()

    def train(self, configs):
        try:
            meta, df, splits, old = self.snapshot()
            fresh = old.copy()
            for n, (key, config) in enumerate(configs.items()):
                with self.lock:
                    self.job["message"] = "Training " + ml.NAMES[key]
                fresh[key] = ml.fit(
                    key, df, splits, meta["seed"], config, meta["version"]
                )
                with self.lock:
                    self.job["completed"] = n + 1
            history = [
                run_record(fresh[k][1]) for k in reversed(configs)
            ] + self.history
            snapshot = {"format": 2, "models": fresh, "history": history}
            replace_file(
                self.folder / "models.joblib",
                lambda p: joblib.dump(snapshot, p, compress=3),
            )
            with self.lock:
                self.bundle, self.history = fresh, history
                self.job.update(running=False, message="Training complete")
                explanation_sample.cache_clear()
        except Exception as exc:
            import traceback

            traceback.print_exc()
            with self.lock:
                self.job.update(
                    running=False, error=str(exc), message="Training failed"
                )


@lru_cache(maxsize=10)
def explanation_sample(pipe, key, version, stamp):
    # Matrices always come from the same version as the fitted model.
    folder = ds.DATA / version
    df = pd.read_csv(folder / "records.csv")
    seed = json.loads((folder / "meta.json").read_text())["seed"]
    sets = ds.split(df, seed)
    x = df.iloc[sets["validation"][:72]][ds.FEATURES]
    reference = df.iloc[sets["train"][0]][ds.FEATURES]
    base, values, method = ml.contributions(key, pipe, x, reference)
    records = [
        dict(
            input=row, prediction=float(p), values=dict(zip(ds.FEATURES, map(float, v)))
        )
        for row, p, v in zip(x.to_dict("records"), pipe.predict(x), values)
    ]
    return dict(method=method, base=base, records=records)
