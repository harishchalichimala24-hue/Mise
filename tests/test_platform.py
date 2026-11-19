"""End-to-end tests using a loopback ASGI server and an isolated dataset directory."""

import importlib
import json
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
import uvicorn
from backend import dataset as ds
from backend import models as ml
from backend import ordering
from backend.store import Workspace, explanation_sample


def api(port, path, body=None):
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        f"http://127.0.0.1:{port}/api/{path}",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        response = urlopen(request, timeout=90)
    except HTTPError as exc:
        response = exc
    with response:
        return response.status, json.load(response)


class PlatformTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = ds.ROOT / "runtime" / "tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        directory = tempfile.TemporaryDirectory(prefix="platform-test-", dir=scratch)
        cls.addClassCleanup(directory.cleanup)
        # Patch the workspace location before importing the API: even bootstrap metadata
        # and the active pointer then stay in this test's unique temporary directory.
        data = patch.object(ds, "DATA", Path(directory.name))
        data.start()
        cls.addClassCleanup(data.stop)
        shop_factory = ordering.create_router
        with patch.object(
            ordering,
            "create_router",
            side_effect=lambda *args, **kwargs: shop_factory(
                Path(directory.name) / "orders.sqlite",
                workspace_dependency=kwargs.get("workspace_dependency"),
            ),
        ):
            main = importlib.import_module("backend.main")
        cls.workspace = Workspace()
        server_workspace = patch.object(main, "workspace", cls.workspace)
        server_workspace.start()
        cls.addClassCleanup(server_workspace.stop)
        cls.addClassCleanup(explanation_sample.cache_clear)
        cls.addClassCleanup(ml.forest_explainer.cache_clear)
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        cls.port = sock.getsockname()[1]
        server = uvicorn.Server(
            uvicorn.Config(main.app, log_level="error", lifespan="off")
        )
        thread = threading.Thread(
            target=server.run, kwargs={"sockets": [sock]}, daemon=True
        )
        thread.start()

        def shutdown():
            server.should_exit = True
            thread.join(10)
            sock.close()

        cls.addClassCleanup(shutdown)
        deadline = time.monotonic() + 15
        while not server.started:
            if time.monotonic() > deadline or not thread.is_alive():
                raise RuntimeError("The isolated test server failed to start")
            time.sleep(0.02)
        status, created = api(
            cls.port, "dataset/generate", {"size": 480, "seed": 104, "noise": 1.25}
        )
        if status != 200:
            raise RuntimeError(f"Dataset generation failed: {created}")
        cls.version = created["dataset"]["version"]
        cls.training(
            {
                "model": "all",
                "params": {"forest": {"n_estimators": 12}, "xgb": {"n_estimators": 15}},
            }
        )

    @classmethod
    def training(cls, payload):
        status, started = api(cls.port, "models/train", payload)
        if status != 202:
            raise AssertionError(f"Training request rejected: {started}")
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            _, state = api(cls.port, "models/status")
            if not state["job"]["running"]:
                if state["job"]["error"]:
                    raise AssertionError(state["job"]["error"])
                return state
            time.sleep(0.08)
        raise AssertionError("Training job timed out")

    def request(self, path, body=None, expected=200):
        status, result = api(self.port, path, body)
        self.assertEqual(status, expected, result)
        return result

    def test_record_partitions_and_independent_metric_calculations(self):
        actual_state = self.request("models/evaluation")
        meta, df, splits, bundle = self.workspace.snapshot()
        train, val, test = [set(splits[k]) for k in ("train", "validation", "test")]
        self.assertFalse(train & val or train & test or val & test)
        self.assertEqual(train | val | test, set(range(len(df))))
        self.assertEqual(set(bundle), set(ml.NAMES))
        for k in ml.NAMES:
            plots = self.request("models/plots?model=" + k)
            self.assertEqual(plots["version"], meta["version"])
            ids = [r["id"] for r in plots["points"]]
            self.assertEqual(ids, list(splits["test"]))
            self.assertEqual(sum(b["count"] for b in plots["histogram"]), len(test))
            for split in ("validation", "test"):
                indices = splits[split]
                y = df.iloc[indices][ds.TARGET].to_numpy()
                preds = bundle[k][0].predict(df.iloc[indices][ds.FEATURES])
                err = y - preds
                expected = {
                    "mae": abs(err).mean(),
                    "mse": np.mean(err**2),
                    "rmse": np.sqrt(np.mean(err**2)),
                    "r2": 1 - np.sum(err**2) / np.sum((y - y.mean()) ** 2),
                }
                for metric, value in expected.items():
                    self.assertAlmostEqual(
                        actual_state["results"][k][split][metric], value, places=6
                    )
                if split == "test":
                    np.testing.assert_allclose(
                        [p["actual"] for p in plots["points"]], y
                    )
                    np.testing.assert_allclose(
                        [p["pred"] for p in plots["points"]], preds
                    )
                    np.testing.assert_allclose(
                        [p["residual"] for p in plots["points"]], err
                    )
                    self.assertAlmostEqual(plots["residual"]["mean"], np.mean(err))
        best = min(
            bundle,
            key=lambda key: (actual_state["results"][key]["validation"]["mae"], key),
        )
        self.assertEqual(actual_state["recommended"], best)

    def test_preprocessing_learns_training_only(self):
        _, df, part, bundle = self.workspace.snapshot()
        train = df.iloc[part["train"]]
        for k, (pipeline, _) in bundle.items():
            with self.subTest(model=k):
                prep = pipeline[0].named_transformers_
                n = prep["num"].named_steps
                np.testing.assert_allclose(
                    n["impute"].statistics_, train[ds.NUM].median()
                )
                if k in ml.TREE:
                    self.assertNotIn("scale", n)
                else:
                    np.testing.assert_allclose(n["scale"].mean_, train[ds.NUM].mean())
                for f, values in zip(
                    ds.CAT, prep["cat"].named_steps["encode"].categories_
                ):
                    self.assertEqual(set(values), set(train[f]))
        # Deliberately perturb held-out response and numeric inputs. A training-only fit
        # must keep its learned coefficients and predictions on the original rows.
        original = df.copy()
        perturbed = df.copy()
        held = np.r_[part["validation"], part["test"]]
        perturbed.loc[held, ds.TARGET] += 1000
        perturbed.loc[held, "recent_avg"] += 1000
        models = [
            ml.fit("linear", frame, part, 104, ml.DEFAULT["linear"], "isolated")[0]
            for frame in (original, perturbed)
        ]
        np.testing.assert_allclose(models[0][-1].coef_, models[1][-1].coef_)
        np.testing.assert_allclose(
            models[0].predict(train[ds.FEATURES]), models[1].predict(train[ds.FEATURES])
        )

    def test_explanations_reconstruct_actual_predictions_for_all_models(self):
        _, df, sets, _ = self.workspace.snapshot()
        order = df.iloc[sets["test"][0]][ds.FEATURES].to_dict()
        for k in ml.NAMES:
            with self.subTest(model=k):
                out = self.request(
                    "predict/compare", {"order": order, "model": k, "compare": True}
                )
                self.assertEqual(set(out["predictions"]), set(ml.NAMES))
                self.assertEqual(out["version"], self.version)
                exp = out["explanation"]
                self.assertEqual(set(exp["values"]), set(ds.FEATURES))
                self.assertAlmostEqual(
                    exp["base"] + sum(exp["values"].values()),
                    out["predictions"][k],
                    delta=2e-4,
                )
                global_exp = self.request("models/explainability?model=" + k)
                self.assertTrue(global_exp["records"])
                self.assertEqual(len(global_exp["importance"]), len(ds.FEATURES))
                if k in ml.TREE:
                    self.assertEqual(exp["method"], "Tree SHAP")
                    self.assertAlmostEqual(
                        sum(i["value"] for i in global_exp["native"]), 1.0, places=5
                    )
                for r in global_exp["records"]:
                    self.assertAlmostEqual(
                        global_exp["base"] + sum(r["values"].values()),
                        r["prediction"],
                        delta=2e-4,
                    )
                self.assertEqual(
                    global_exp["records"][0]["input"],
                    df.iloc[sets["validation"][0]][ds.FEATURES].to_dict(),
                )
        order["quantity"] = 75
        out = self.request(
            "predict", {"order": order, "model": "linear", "compare": False}
        )
        self.assertEqual(list(out["predictions"]), ["linear"])
        self.assertTrue(any("quantity" in s.lower() for s in out["warnings"]))

    def test_scheduling_uses_fitted_predictions(self):
        cases = self.request("scenarios")
        scenario = next(s for s in cases if s["id"] == "conflict")
        _, _, _, bundle = self.workspace.snapshot()
        import pandas as pd

        for k in ml.NAMES:
            with self.subTest(model=k):
                result = self.request("simulate", {"scenario": scenario, "model": k})
                self.assertEqual(result["version"], self.version)
                target = [t for t in result["tasks"] if t["order"] == "New order"]
                self.assertEqual(result["ready"], max(t["end"] for t in target))
                for t in result["tasks"]:
                    if t["active"]:
                        continue
                    raw = bundle[k][0].predict(
                        pd.DataFrame([t["features"]])[ds.FEATURES]
                    )[0]
                    self.assertAlmostEqual(
                        t["duration"], max(0.1, round(float(raw), 3)), places=5
                    )

    def test_archiving_retraining_and_restart(self):
        before = self.request("state")
        first = before["dataset"]["version"]
        try:
            regen = self.request(
                "dataset/generate", {"size": 360, "seed": 33, "noise": 1.0}
            )
            second = regen["dataset"]["version"]
            self.assertNotEqual(first, second)
            self.assertIn(first, {v["version"] for v in regen["versions"]})
            self.assertEqual(regen["results"], {})
            self.request("models/plots?model=knn", expected=409)
            trained = self.training(
                {"model": "knn", "params": {"knn": {"n_neighbors": 3}}}
            )
            self.assertEqual(list(trained["results"]), ["knn"])
            previous = trained["results"]["knn"]
            retrained = self.training(
                {"model": "knn", "params": {"knn": {"n_neighbors": 8}}}
            )
            run = retrained["results"]["knn"]
            self.assertEqual(run["config"]["n_neighbors"], 8)
            self.assertNotEqual(run["trained"], previous["trained"])
            restarted = Workspace().state()
            self.assertEqual(restarted["dataset"]["version"], second)
            self.assertEqual(
                [r["config"]["n_neighbors"] for r in restarted["history"]], [8, 3]
            )
            self.assertEqual(restarted["history"], retrained["history"])
            self.assertEqual(restarted["results"], retrained["results"])
            reopened = self.request("dataset/select", {"version": first})
            self.assertEqual(reopened["results"], before["results"])
            back = self.request("dataset/select", {"version": second})
            self.assertEqual(back["results"]["knn"], run)
        finally:
            self.request("dataset/select", {"version": first})

    def test_concurrent_training_and_failure_leave_last_complete_bundle_usable(self):
        before = self.request("state")
        arrived, resume = threading.Event(), threading.Event()

        def controlled_failure(*args, **kwargs):
            arrived.set()
            if not resume.wait(10):
                raise RuntimeError("Timeout waiting for concurrency assertions")
            raise RuntimeError("Injected fit failure")

        with (
            patch.object(ml, "fit", side_effect=controlled_failure),
            patch("traceback.print_exc"),
        ):
            self.request("models/train", {"model": "all"}, 202)
            try:
                self.assertTrue(arrived.wait(10))
                self.request("models/train", {"model": "linear"}, 409)
                self.request(
                    "dataset/generate", {"size": 450, "seed": 4, "noise": 1.2}, 409
                )
                self.request("dataset/select", {"version": self.version}, 409)
                self.assertEqual(
                    self.request("models/evaluation")["results"], before["results"]
                )
            finally:
                resume.set()
            deadline = time.monotonic() + 10
            while self.request("models/status")["job"]["running"]:
                self.assertLess(time.monotonic(), deadline)
                time.sleep(0.02)
        state = self.request("state")
        self.assertIn("Injected fit failure", state["job"]["error"])
        self.assertEqual(state["results"], before["results"])
        self.assertEqual(state["results"], Workspace().state()["results"])
        self.request("dataset/select", {"version": self.version})

    def test_validation_and_exploration(self):
        self.request("dataset/generate", {"size": 2, "seed": -1}, 422)
        self.request("dataset/select", {"version": "../elsewhere"}, 422)
        self.request("dataset/select", {"version": "KS-00000000"}, 404)
        self.request("models/train", {"model": "classifier"}, 422)
        self.request(
            "models/train",
            {"model": "forest", "params": {"forest": {"max_depth": 0}}},
            422,
        )
        self.request("models/train", {"model": "svr", "params": {"bad-name": {}}}, 422)
        self.request("predict", {"order": {}, "model": "knn"}, 422)
        self.request("dataset/explore?feature=wrong", expected=422)
        self.request("dataset/explore?page=999", expected=422)
        summary = self.request("dataset/summary")
        for f in ("dish", ds.TARGET):
            page = self.request("dataset/explore?feature=" + f)
            self.assertEqual(
                sum(b["count"] for b in page["distribution"]), summary["rows"]
            )
            self.assertEqual(len(page["preview"]), 20)
            second = self.request("dataset/explore?feature=" + f + "&page=2")
            self.assertNotEqual(second["preview"], page["preview"])
            self.assertEqual(
                {v["feature"] for v in page["stats"]}, set(ds.FEATURES + [ds.TARGET])
            )
        s = self.request("scenarios")[0]
        s["order"][0]["depends_on"] = [s["order"][0]["id"]]
        self.request("simulate", {"model": "svr", "scenario": s}, 422)
