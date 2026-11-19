"""Regression checks for the stateless application-facing readiness interface."""

from contextlib import closing
from datetime import datetime
from zoneinfo import ZoneInfo
import json
import math
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pandas as pd
import uvicorn
from fastapi import FastAPI
from pydantic import ValidationError

from backend import dataset as ds
from backend.integration import (
    EstimateRequest,
    EstimateUnavailable,
    create_router,
    estimate_order,
)
from backend.scheduler import simulate
from backend.store import Workspace
from backend.ordering import ConfirmOrder, OrderStore


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = ds.ROOT / "runtime" / "tmp"
        scratch.mkdir(exist_ok=True, parents=True)
        temp = tempfile.TemporaryDirectory(prefix="integration-test-", dir=scratch)
        cls.addClassCleanup(temp.cleanup)
        data = patch.object(ds, "DATA", Path(temp.name))
        data.start()
        cls.addClassCleanup(data.stop)
        cls.workspace = Workspace()
        cls.workspace.generate(360, 717, 1.1)
        cls.workspace.start(
            "all", {"forest": {"n_estimators": 7}, "xgb": {"n_estimators": 8}}
        )
        deadline = time.monotonic() + 60
        while cls.workspace.state()["job"]["running"]:
            if time.monotonic() > deadline:
                raise RuntimeError("Test model training timed out")
            time.sleep(0.05)
        if cls.workspace.state()["job"]["error"]:
            raise RuntimeError(cls.workspace.state()["job"]["error"])
        cls.version = cls.workspace.meta["version"]
        app = FastAPI()
        app.include_router(create_router(lambda: cls.workspace))
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        cls.port = sock.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, log_level="error", lifespan="off"))
        thread = threading.Thread(
            target=server.run, kwargs={"sockets": [sock]}, daemon=True
        )
        thread.start()

        def stop():
            server.should_exit = True
            thread.join(10)
            sock.close()

        cls.addClassCleanup(stop)
        deadline = time.monotonic() + 10
        while not server.started:
            if not thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError("Test API startup failed")
            time.sleep(0.02)

    def request(self, path, body=None, expected=200):
        req = Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            response = urlopen(req, timeout=30)
        except HTTPError as exc:
            response = exc
        with response:
            data = json.load(response)
            self.assertEqual(response.status, expected, data)
            return data

    def minimal(self):
        return {"order_id": "WEB-123", "items": [{"dish": "Burger"}]}

    def test_confirmed_order_and_stateless_estimator_share_fitted_predictions(self):
        store = OrderStore(ds.DATA / "checkout-seam.sqlite", lambda: self.workspace)
        confirmed, created = store.confirm(
            "test-demo",
            ConfirmOrder(
                items=[
                    {"product_id": "burger", "quantity": 2},
                    {"product_id": "coffee", "quantity": 1},
                ],
                idempotency_key="checkout-estimator-seam",
            ),
        )
        self.assertTrue(created)
        readiness = confirmed["readiness"]
        self.assertEqual(readiness["model"]["dataset_version"], self.version)
        meta, _, _, bundle = self.workspace.snapshot()
        fitted = bundle[readiness["model"]["id"]][0]
        kitchen = readiness["kitchen"]
        for task in readiness["items"]:
            product = next(
                item
                for item in confirmed["preparation_items"]
                if item["id"] == task["id"]
            )
            local_time = datetime.fromisoformat(confirmed["created_at"]).astimezone(
                ZoneInfo(kitchen["timezone"])
            )
            expected_inputs = dict(
                dish=product["dish"],
                quantity=product["quantity"],
                complexity=product["complexity"],
                pending=0,
                queue_work=0,
                workload=kitchen["workload"],
                staff=kitchen["staff"],
                capacity=kitchen["capacities"][task["station"]],
                recent_avg=ds.DISH[product["dish"]] + 1,
                day=ds.DAYS[local_time.weekday()],
                period=(
                    "Morning"
                    if local_time.hour < 11
                    else (
                        "Lunch"
                        if local_time.hour < 15
                        else "Afternoon" if local_time.hour < 18 else "Dinner"
                    )
                ),
            )
            predicted = float(
                fitted.predict(pd.DataFrame([expected_inputs])[ds.FEATURES])[0]
            )
            self.assertAlmostEqual(
                task["prep_minutes"], max(0.1, round(predicted, 3)), places=6
            )
        with closing(store.connect()) as db:
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM reservations WHERE order_id = ?",
                    (confirmed["id"],),
                ).fetchone()[0],
                len(confirmed["preparation_items"]),
            )
        request = EstimateRequest(
            order_id=confirmed["id"],
            items=confirmed["preparation_items"],
            include_schedule=True,
        )
        before_workspace = self.workspace.state()
        with closing(store.connect()) as db:
            before_database = list(db.iterdump())
        first = estimate_order(self.workspace, request)
        second = estimate_order(self.workspace, request)
        self.assertEqual(first, second)
        self.assertEqual(first["order_id"], confirmed["id"])
        tasks = [task for task in first["schedule"] if task["order"] == "New order"]
        self.assertEqual(
            {(task["id"], task["dish"], task["quantity"]) for task in tasks},
            {
                (item["id"], item["dish"], item["quantity"])
                for item in confirmed["preparation_items"]
            },
        )
        self.assertEqual(first["readiness_minutes"], max(task["end"] for task in tasks))
        self.assertEqual(first["waiting_minutes"], 0)
        self.assertEqual(request.pending_orders, [])
        self.assertEqual(request.active_tasks, [])
        self.assertEqual(store.order("test-demo", confirmed["id"]), confirmed)
        with closing(store.connect()) as db:
            self.assertEqual(list(db.iterdump()), before_database)
        self.assertEqual(self.workspace.state(), before_workspace)

    def test_minimal_request_and_menu_defaults(self):
        before = self.workspace.state()
        metadata = self.request("/api/v1/menu")
        self.assertEqual({d["dish"] for d in metadata["dishes"]}, set(ds.DISH))
        result = self.request("/api/v1/estimate", self.minimal())
        self.assertEqual(result["order_id"], "WEB-123")
        self.assertEqual(
            result["estimated_ready_in_minutes"], math.ceil(result["readiness_minutes"])
        )
        self.assertGreater(result["readiness_minutes"], 0)
        self.assertEqual(result["waiting_minutes"], 0)
        self.assertEqual(result["model"]["dataset_version"], self.version)
        self.assertEqual(result["model"]["id"], before["recommended"])
        self.assertEqual(
            result["model"]["trained_at"],
            before["results"][before["recommended"]]["trained"],
        )
        self.assertEqual(result["data_source"], "synthetic")
        self.assertTrue(any("synthetic" in warning for warning in result["warnings"]))
        self.assertIn(str(result["estimated_ready_in_minutes"]), result["message"])
        self.assertNotIn("schedule", result)
        self.assertEqual(self.workspace.state(), before)

    def test_all_models_match_canonical_scheduler_with_queue_and_active_work(self):
        request = self.minimal()
        request.update(
            items=[
                {"id": "main", "dish": "Burger", "quantity": 2},
                {"id": "coffee", "dish": "Coffee", "depends_on": ["main"]},
            ],
            kitchen={
                "staff": 2,
                "capacities": {"Grill": 1},
                "period": "Dinner",
                "day": "Saturday",
                "workload": 70,
            },
            pending_orders=[
                {
                    "id": "older",
                    "accepted_minutes_ago": 6,
                    "items": [{"dish": "Burger", "quantity": 3, "complexity": 4}],
                }
            ],
            active_tasks=[{"station": "Grill", "remaining_minutes": 7}],
            include_schedule=True,
        )
        meta, _, _, bundle = self.workspace.snapshot()
        for key, (pipe, _) in bundle.items():
            with self.subTest(model=key):
                request["model"] = key
                parsed = EstimateRequest.model_validate(request)
                canon = simulate(
                    parsed.scenario(),
                    key,
                    lambda inputs: float(
                        pipe.predict(pd.DataFrame([inputs])[ds.FEATURES])[0]
                    ),
                )
                actual = self.request("/api/v1/estimate", request)
                direct = estimate_order(self.workspace, parsed)
                self.assertEqual(actual["readiness_minutes"], canon["ready"])
                self.assertEqual(actual["waiting_minutes"], canon["wait"])
                self.assertEqual(
                    actual["readiness_minutes"], direct["readiness_minutes"]
                )
                self.assertEqual(actual["model"]["id"], key)
                new = [
                    t
                    for t in actual["schedule"]
                    if t.get("customer_order_id") == "WEB-123"
                ]
                self.assertEqual(len(new), 2)
                self.assertGreater(new[0]["start"], 7)
                self.assertEqual(new[1]["start"], new[0]["end"])
                self.assertEqual(actual["readiness_minutes"], new[-1]["end"])

    def test_validation_is_readable_and_does_not_create_queue(self):
        invalid = []
        s = self.minimal()
        s["items"] = []
        invalid.append(s)
        s = self.minimal()
        s["items"][0]["dish"] = "Taco"
        invalid.append(s)
        s = self.minimal()
        s["items"][0]["quantity"] = 0
        invalid.append(s)
        s = self.minimal()
        s["items"][0].update(id="a", depends_on=["a"])
        invalid.append(s)
        s = self.minimal()
        s["items"].append({"id": "item-1", "dish": "Coffee"})
        invalid.append(s)
        s = self.minimal()
        s["kitchen"] = {"capacities": {"Grill": 0}}
        invalid.append(s)
        s = self.minimal()
        s["kitchen"] = {"staff": 1}
        s["active_tasks"] = [
            {"station": "Grill", "remaining_minutes": 3},
            {"station": "Prep", "remaining_minutes": 4},
        ]
        invalid.append(s)
        s = self.minimal()
        s["pending_orders"] = [{"id": "WEB-123", "items": [{"dish": "Coffee"}]}]
        invalid.append(s)
        s = self.minimal()
        s["active_tasks"] = [{"station": "Grill", "remaining_minutes": -3}]
        invalid.append(s)
        s = self.minimal()
        s["model"] = "unsupported"
        invalid.append(s)
        s = self.minimal()
        s["unknown"] = 1
        invalid.append(s)
        for i, req in enumerate(invalid):
            with self.subTest(case=i):
                out = self.request("/api/v1/estimate", req, 422)
                self.assertIsInstance(out["detail"], list)
                self.assertIn("msg", out["detail"][0])
                with self.assertRaises(ValidationError):
                    estimate_order(self.workspace, req)
        self.assertEqual(self.workspace.meta["version"], self.version)

    def test_untrained_dataset_has_explicit_409(self):
        try:
            self.workspace.generate(300, 892, 1.1)
            response = self.request("/api/v1/estimate", self.minimal(), 409)
            self.assertIn("Train", response["detail"])
            with self.assertRaises(EstimateUnavailable):
                estimate_order(self.workspace, self.minimal())
        finally:
            self.workspace.open(self.version)

    def test_large_valid_batch_reports_training_range_warning(self):
        req = self.minimal()
        req["items"][0]["quantity"] = 30
        out = self.request("/api/v1/estimate", req)
        self.assertTrue(
            any(
                "training ranges" in w and "quantity" in w.lower()
                for w in out["warnings"]
            )
        )

    def test_snapshot_stays_consistent_if_active_dataset_changes(self):
        original = self.workspace.snapshot()

        class SwitchingWorkspace:
            def snapshot(inner):
                self.workspace.generate(300, 291, 1.2)
                return original

        try:
            result = estimate_order(SwitchingWorkspace(), self.minimal())
            self.assertEqual(result["model"]["dataset_version"], self.version)
            self.assertNotEqual(self.workspace.meta["version"], self.version)
            expected = min(
                original[3], key=lambda k: (original[3][k][1]["validation"]["mae"], k)
            )
            self.assertEqual(result["model"]["id"], expected)
        finally:
            self.workspace.open(self.version)
