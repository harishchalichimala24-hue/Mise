"""Regression tests for checkout estimates and durable kitchen resource reservations."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import numpy as np
from fastapi import HTTPException

from backend import dataset as ds
from backend import ordering

NOW = 1_900_000_000.0


class FixedModel:
    """Duration double isolates resource scheduling from model accuracy."""

    def __init__(self):
        self.durations = dict(
            Burger=10.0, Pizza=12.0, Sandwich=4.0, Coffee=3.0, Smoothie=5.0
        )
        self.calls = []

    def predict(self, frame):
        records = frame.to_dict("records")
        self.calls.extend(records)
        return np.array(
            [self.durations[row["dish"]] * row["quantity"] for row in records]
        )


class FixedWorkspace:
    def __init__(self):
        self.model = FixedModel()
        self.frame = ds.generate(100, 405, 1.0)
        self.bundle = {
            "linear": (
                self.model,
                dict(
                    validation=dict(mae=1.0),
                    trained="2026-01-01T00:00:00+00:00",
                    config={},
                ),
            )
        }

    def snapshot(self):
        return (
            {"version": "KS-TEST0001"},
            self.frame,
            {"train": np.arange(len(self.frame))},
            self.bundle,
        )


class OrderReadinessTests(unittest.TestCase):
    def setUp(self):
        scratch = ds.ROOT / "runtime" / "tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        directory = tempfile.TemporaryDirectory(prefix="readiness-test-", dir=scratch)
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "orders.sqlite"
        self.workspace = FixedWorkspace()
        self.store = ordering.OrderStore(self.path, lambda: self.workspace)
        self.clock = patch.object(ordering.time, "time", return_value=NOW)
        self.now = self.clock.start()
        self.addCleanup(self.clock.stop)

    def confirm(self, *products, key=None, store=None):
        cart = [
            {"product_id": product, "quantity": quantity}
            for product, quantity in products
        ]
        return (store or self.store).confirm(
            "test-demo",
            ordering.ConfirmOrder(items=cart, idempotency_key=key or uuid4().hex),
        )

    def bookings(self):
        with closing(self.store.connect()) as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT * FROM reservations ORDER BY starts_at, task_id"
                )
            ]

    def count_orders(self):
        with closing(self.store.connect()) as db:
            return db.execute("SELECT COUNT(*) FROM orders").fetchone()[0]

    def configure(self, **values):
        return self.store.configure_kitchen(ordering.KitchenUpdate(**values))

    def assert_no_conflicts(self):
        bookings = self.bookings()
        for index, first in enumerate(bookings):
            for other in bookings[index + 1 :]:
                overlaps = (
                    first["starts_at"] < other["finishes_at"]
                    and other["starts_at"] < first["finishes_at"]
                )
                shared_station = (
                    first["station"] == other["station"]
                    and first["slot"] == other["slot"]
                )
                shared_cook = first["cook"] == other["cook"]
                self.assertFalse(
                    overlaps and (shared_station or shared_cook), (first, other)
                )

    def test_same_station_waits_and_saved_first_estimate_is_immutable(self):
        first, _ = self.confirm(("burger", 1))
        second, _ = self.confirm(("burger", 1))
        self.assertEqual(first["readiness"]["readiness_minutes"], 10)
        self.assertEqual(second["readiness"]["waiting_minutes"], 10)
        self.assertEqual(second["readiness"]["readiness_minutes"], 20)
        self.assertEqual(second["readiness"]["orders_ahead"], 1)
        self.assertEqual(self.store.order("test-demo", first["id"]), first)
        self.assertEqual(self.bookings()[0]["starts_at"], NOW)
        self.assertEqual(self.bookings()[1]["starts_at"], NOW + 600)
        self.assert_no_conflicts()

    def test_independent_stations_start_in_parallel_and_order_finishes_last(self):
        order, _ = self.confirm(("burger", 1), ("coffee", 1), ("pizza", 1))
        tasks = order["readiness"]["items"]
        self.assertEqual(
            {datetime.fromisoformat(t["starts_at"]).timestamp() for t in tasks}, {NOW}
        )
        self.assertEqual(order["readiness"]["readiness_minutes"], 12)
        self.assertEqual(
            datetime.fromisoformat(
                order["readiness"]["estimated_ready_at"]
            ).timestamp(),
            max(datetime.fromisoformat(t["finishes_at"]).timestamp() for t in tasks),
        )
        self.assert_no_conflicts()

    def test_one_cook_serializes_independent_stations(self):
        self.configure(staff=1)
        order, _ = self.confirm(("burger", 1), ("coffee", 1))
        self.assertEqual(order["readiness"]["readiness_minutes"], 13)
        bookings = self.bookings()
        self.assertEqual(bookings[1]["starts_at"], bookings[0]["finishes_at"])
        self.assert_no_conflicts()

    def test_added_station_slot_shortens_wait_without_moving_existing_work(self):
        first, _ = self.confirm(("burger", 1))
        self.configure(capacities={"Grill": 2})
        second, _ = self.confirm(("burger", 1))
        third, _ = self.confirm(("burger", 1))
        self.assertEqual(second["readiness"]["waiting_minutes"], 0)
        self.assertEqual(third["readiness"]["waiting_minutes"], 10)
        self.assertEqual(self.store.order("test-demo", first["id"]), first)
        self.assertEqual(
            len({row["slot"] for row in self.bookings() if row["station"] == "Grill"}),
            2,
        )
        self.assert_no_conflicts()

    def test_free_gap_is_used_and_longer_task_skips_future_reservation(self):
        self.configure(staff=1)
        original, _ = self.confirm(("burger", 1), ("coffee", 1))
        original_coffee = next(
            row for row in self.bookings() if row["task_id"] == "coffee"
        )
        self.assertEqual(original_coffee["starts_at"], NOW + 600)
        self.configure(staff=2)
        short, _ = self.confirm(("coffee", 1))
        self.assertEqual(short["readiness"]["waiting_minutes"], 0)
        self.assertEqual(short["readiness"]["readiness_minutes"], 3)
        long, _ = self.confirm(("coffee", 4))
        self.assertEqual(long["readiness"]["waiting_minutes"], 13)
        self.assertEqual(long["readiness"]["readiness_minutes"], 25)
        self.assertEqual(self.store.order("test-demo", original["id"]), original)
        self.assert_no_conflicts()

    def test_elapsed_time_only_keeps_remaining_active_work(self):
        first, _ = self.confirm(("burger", 1))
        self.now.return_value = NOW + 240
        second, _ = self.confirm(("burger", 1))
        self.assertEqual(second["readiness"]["waiting_minutes"], 6)
        self.assertEqual(second["readiness"]["readiness_minutes"], 16)
        self.assertEqual(self.workspace.model.calls[-1]["pending"], 1)
        self.assertAlmostEqual(self.workspace.model.calls[-1]["queue_work"], 6)
        self.assertEqual(self.store.order("test-demo", first["id"]), first)
        self.assert_no_conflicts()

    def test_completed_bookings_release_resources_after_restart(self):
        first, _ = self.confirm(("burger", 1))
        restarted = ordering.OrderStore(self.path, lambda: self.workspace)
        self.now.return_value = NOW + 60
        second, _ = self.confirm(("burger", 1), store=restarted)
        self.assertEqual(second["readiness"]["waiting_minutes"], 9)
        self.now.return_value = NOW + 1200
        third, _ = self.confirm(("burger", 1), store=restarted)
        self.assertEqual(third["readiness"]["waiting_minutes"], 0)
        self.assertEqual(third["readiness"]["orders_ahead"], 0)
        self.assertEqual(restarted.order("test-demo", first["id"]), first)
        self.assert_no_conflicts()

    def test_retries_do_not_predict_or_reserve_twice(self):
        key = uuid4().hex
        first, created = self.confirm(("burger", 1), key=key)
        self.assertTrue(created)
        before = self.bookings()
        calls = len(self.workspace.model.calls)
        self.workspace.bundle = {}
        self.now.return_value = NOW + 120
        second, created = self.confirm(("burger", 1), key=key)
        self.assertFalse(created)
        self.assertEqual(first, second)
        restarted = ordering.OrderStore(self.path, lambda: self.workspace)
        self.assertEqual(restarted.order("test-demo", first["id"]), first)
        self.assertEqual(
            second["readiness"]["estimated_ready_at"],
            first["readiness"]["estimated_ready_at"],
        )
        self.assertEqual(self.bookings(), before)
        self.assertEqual(len(self.workspace.model.calls), calls)

    def test_different_concurrent_orders_reserve_nonoverlapping_intervals(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.confirm(("burger", 1)), range(8)))
        self.assertEqual(len({order["id"] for order, _ in results}), 8)
        self.assertEqual(
            sorted(order["readiness"]["waiting_minutes"] for order, _ in results),
            list(range(0, 80, 10)),
        )
        self.assertEqual(self.count_orders(), 8)
        self.assertEqual(len(self.bookings()), 8)
        self.assert_no_conflicts()

    def test_unavailable_model_rolls_back_and_same_confirmation_can_be_retried(self):
        key = uuid4().hex
        bundle = self.workspace.bundle
        self.workspace.bundle = {}
        with self.assertRaises(HTTPException) as failure:
            self.confirm(("burger", 1), key=key)
        self.assertEqual(failure.exception.status_code, 409)
        self.assertIsInstance(failure.exception.detail, str)
        self.assertEqual(self.count_orders(), 0)
        self.assertEqual(self.bookings(), [])
        self.workspace.bundle = bundle
        recovered, created = self.confirm(("burger", 1), key=key)
        self.assertTrue(created)
        self.assertEqual(recovered["readiness"]["readiness_minutes"], 10)

    def test_prediction_failure_and_nonfinite_output_leave_no_partial_order(self):
        for failure in (RuntimeError("Model failure"), np.array([float("nan")])):
            with self.subTest(failure=str(failure)):
                with patch.object(
                    self.workspace.model,
                    "predict",
                    side_effect=[np.array([10.0]), failure],
                ):
                    with self.assertRaises(HTTPException) as raised:
                        self.confirm(("burger", 1), ("coffee", 1))
                self.assertEqual(raised.exception.status_code, 503)
                self.assertIsInstance(raised.exception.detail, str)
                self.assertEqual(self.count_orders(), 0)
                self.assertEqual(self.bookings(), [])

    def test_legacy_order_stays_without_fabricated_readiness(self):
        order, _ = self.confirm(("burger", 1))
        order.pop("readiness")
        with closing(self.store.connect()) as db, db:
            db.execute("DELETE FROM reservations WHERE order_id = ?", (order["id"],))
            db.execute(
                "UPDATE orders SET order_json = ? WHERE id = ?",
                (json.dumps(order), order["id"]),
            )
        restarted = ordering.OrderStore(self.path, lambda: self.workspace)
        legacy = restarted.order("test-demo", order["id"])
        self.assertIsNone(legacy.get("readiness"))
        self.assertEqual(legacy["items"], order["items"])
        self.assertEqual(self.bookings(), [])

    def test_settings_preserve_reserved_slots_and_cooks(self):
        order, _ = self.confirm(("burger", 1), ("coffee", 1), ("pizza", 1))
        before = self.bookings()
        for update in ({"staff": 1}, {"capacities": {"Grill": 0}}):
            with self.subTest(update=update):
                with self.assertRaises(HTTPException) as failure:
                    self.configure(**update)
                self.assertEqual(failure.exception.status_code, 409)
                self.assertEqual(self.bookings(), before)
        self.configure(staff=4, capacities={"Grill": 2}, workload=70)
        self.assertEqual(self.store.order("test-demo", order["id"]), order)
        self.assertEqual(self.bookings(), before)
        self.now.return_value = NOW + 12 * 60
        self.configure(staff=1, capacities={"Grill": 0})
        with self.assertRaises(HTTPException) as failure:
            self.confirm(("burger", 1))
        self.assertEqual(failure.exception.status_code, 409)
        self.assertEqual(self.count_orders(), 1)

    def test_confirmation_shape_has_calendar_times_and_prediction_metadata(self):
        order, _ = self.confirm(("burger", 1), ("coffee", 1))
        validated = ordering.Order.model_validate(order).model_dump()
        self.assertEqual(validated["readiness"], order["readiness"])
        result = validated["readiness"]
        self.assertEqual(result["estimated_ready_in_minutes"], 10)
        self.assertEqual(result["model"]["id"], "linear")
        self.assertEqual(result["model"]["dataset_version"], "KS-TEST0001")
        self.assertEqual(result["data_source"], "synthetic")
        self.assertTrue(result["warnings"])
        self.assertEqual(result["kitchen"]["timezone"], "Asia/Kolkata")
        self.assertEqual({item["id"] for item in result["items"]}, {"burger", "coffee"})
        for item in result["items"]:
            start = datetime.fromisoformat(item["starts_at"]).timestamp()
            end = datetime.fromisoformat(item["finishes_at"]).timestamp()
            self.assertAlmostEqual((end - start) / 60, item["prep_minutes"])
            self.assertAlmostEqual((start - NOW) / 60, item["wait_minutes"])


if __name__ == "__main__":
    unittest.main()
