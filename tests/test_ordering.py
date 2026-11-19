"""Customer checkout tests use a temporary SQLite database and a local HTTP server."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import FastAPI
import uvicorn

from backend.ordering import OrderStore, create_router, digest
from tests.test_order_readiness import FixedWorkspace


class OrderingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = Path(__file__).resolve().parents[1] / "runtime" / "tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        directory = tempfile.TemporaryDirectory(prefix="ordering-test-", dir=scratch)
        cls.addClassCleanup(directory.cleanup)
        cls.path = Path(directory.name) / "orders.sqlite"
        cls.workspace = FixedWorkspace()
        cls.store = OrderStore(cls.path, lambda: cls.workspace)
        app = FastAPI()
        app.include_router(create_router(cls.path, lambda: cls.workspace))
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
                raise RuntimeError("Isolated ordering API failed to start")
            time.sleep(0.02)

    def call(self, path, body=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(
            f"http://127.0.0.1:{self.port}/api/shop{path}",
            data=None if body is None else json.dumps(body).encode(),
            headers=headers,
        )
        try:
            response = urlopen(request, timeout=20)
        except HTTPError as exc:
            response = exc
        with response:
            return response.status, json.load(response)

    def request(self, path, body=None, token=None, expected=200):
        status, data = self.call(path, body, token)
        self.assertEqual(status, expected, data)
        return data

    def login(self, guest=False):
        credentials = (
            {"email": "guest@mise.test", "password": "Welcome123!"}
            if guest
            else {"email": "demo@mise.test", "password": "Kitchen123!"}
        )
        return self.request("/login", credentials)

    def cart(self):
        return {
            "items": [
                {"product_id": "burger", "quantity": 2},
                {"product_id": "coffee", "quantity": 1},
            ],
            "idempotency_key": str(uuid4()),
        }

    def test_login_me_and_hashed_revocable_sessions(self):
        auth = self.login()
        user = self.request("/me", token=auth["token"])
        self.assertEqual(user, auth["user"])
        self.assertNotIn("password", user)
        self.assertEqual(user["email"], "demo@mise.test")
        with closing(self.store.connect()) as db:
            row = db.execute(
                "SELECT * FROM sessions WHERE token_hash = ?", (digest(auth["token"]),)
            ).fetchone()
        self.assertIsNotNone(row)
        self.assertNotEqual(row["token_hash"], auth["token"])
        self.assertGreater(row["expires_at"], time.time() + 7 * 3600)
        self.request("/logout", {}, auth["token"])
        self.request("/me", token=auth["token"], expected=401)
        self.request("/orders", self.cart(), auth["token"], expected=401)
        self.request(
            "/login", {"email": "demo@mise.test", "password": "wrong"}, expected=401
        )
        self.request(
            "/login",
            {"email": "unknown@mise.test", "password": "Kitchen123!"},
            expected=401,
        )
        self.request("/me", expected=401)
        self.request("/me", token="not-a-session", expected=401)

    def test_expired_session_is_rejected(self):
        auth = self.login()
        with closing(self.store.connect()) as db, db:
            db.execute(
                "UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
                (time.time() - 1, digest(auth["token"])),
            )
        self.request("/me", token=auth["token"], expected=401)

    def test_catalog_and_checkout_totals_persist_with_snapshot(self):
        catalog = self.request("/products")
        self.assertEqual(len(catalog), 6)
        products = {p["id"]: p for p in catalog}
        self.assertFalse(products["chef-burger"]["available"])
        auth = self.login()
        body = self.cart()
        order = self.request("/orders", body, auth["token"], expected=201)
        expected_total = (
            2 * products["burger"]["price_cents"] + products["coffee"]["price_cents"]
        )
        self.assertEqual(order["total_cents"], expected_total)
        self.assertEqual(
            order["total_cents"], sum(i["line_total_cents"] for i in order["items"])
        )
        self.assertEqual(order["currency"], "INR")
        self.assertEqual(order["payment_status"], "simulated")
        self.assertEqual(order["status"], "confirmed")
        readiness = order["readiness"]
        self.assertGreater(readiness["estimated_ready_in_minutes"], 0)
        self.assertIsInstance(readiness["estimated_ready_at"], str)
        self.assertEqual(readiness["model"]["id"], "linear")
        self.assertEqual(readiness["data_source"], "synthetic")
        self.assertEqual(
            {task["id"] for task in readiness["items"]}, {"burger", "coffee"}
        )
        self.assertEqual(
            order["preparation_items"],
            [
                {"id": "burger", "dish": "Burger", "quantity": 2, "complexity": 3},
                {"id": "coffee", "dish": "Coffee", "quantity": 1, "complexity": 1},
            ],
        )
        self.assertEqual(
            self.request("/orders/" + order["id"], token=auth["token"]), order
        )
        restarted = OrderStore(self.path)
        self.assertEqual(restarted.order(auth["user"]["id"], order["id"]), order)
        with closing(self.store.connect()) as db, db:
            changed = dict(
                products["burger"],
                price_cents=123,
                name="Changed after confirmation",
                available=False,
            )
            db.execute(
                "UPDATE products SET catalog_json = ? WHERE id = ?",
                (json.dumps(changed), "burger"),
            )
        try:
            self.assertEqual(restarted.order(auth["user"]["id"], order["id"]), order)
            self.assertEqual(self.request("/orders", body, auth["token"]), order)
        finally:
            with closing(self.store.connect()) as db, db:
                db.execute(
                    "UPDATE products SET catalog_json = ? WHERE id = ?",
                    (json.dumps(products["burger"]), "burger"),
                )

    def test_checkout_validation_and_owner_access(self):
        token = self.login()["token"]
        cases = []
        for product in ("unknown", "chef-burger"):
            body = self.cart()
            body["items"] = [{"product_id": product, "quantity": 1}]
            cases.append((body, 409 if product == "chef-burger" else 422))
        for qty in (0, 31, True, 1.2, "2"):
            body = self.cart()
            body["items"][0]["quantity"] = qty
            cases.append((body, 422))
        body = self.cart()
        body["items"] *= 2
        cases.append((body, 422))
        body = self.cart()
        body["items"] = []
        cases.append((body, 422))
        body = self.cart()
        body["items"][0]["price_cents"] = 1
        cases.append((body, 422))
        body = self.cart()
        body["total_cents"] = 1
        cases.append((body, 422))
        body = self.cart()
        body["idempotency_key"] = "bad"
        cases.append((body, 422))
        for body, status in cases:
            self.request("/orders", body, token, expected=status)
            with closing(self.store.connect()) as db:
                n = db.execute(
                    "SELECT COUNT(*) FROM orders WHERE idempotency_key = ?",
                    (body["idempotency_key"],),
                ).fetchone()[0]
            self.assertEqual(n, 0)
        order = self.request("/orders", self.cart(), token, expected=201)
        guest = self.login(guest=True)
        self.request("/orders/" + order["id"], token=guest["token"], expected=404)
        self.request("/orders/not-found", token=token, expected=404)

    def test_idempotency_is_atomic_under_concurrent_retries(self):
        token = self.login()["token"]
        body = self.cart()
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(
                pool.map(lambda _: self.call("/orders", body, token), range(8))
            )
        self.assertEqual(sum(status == 201 for status, _ in results), 1)
        self.assertEqual(sum(status == 200 for status, _ in results), 7)
        ids = {order["id"] for _, order in results}
        self.assertEqual(len(ids), 1)
        with closing(self.store.connect()) as db:
            count = db.execute(
                "SELECT COUNT(*) FROM orders WHERE user_id = ? AND idempotency_key = ?",
                ("test-demo", body["idempotency_key"]),
            ).fetchone()[0]
        self.assertEqual(count, 1)
        with closing(self.store.connect()) as db:
            reservations = db.execute(
                "SELECT COUNT(*) FROM reservations WHERE order_id = ?",
                (next(iter(ids)),),
            ).fetchone()[0]
        self.assertEqual(reservations, 2)
        body["items"].reverse()
        same = self.request("/orders", body, token)
        self.assertEqual(same["id"], next(iter(ids)))
        body["items"][0]["quantity"] = 3
        self.request("/orders", body, token, expected=409)

    def test_idempotency_keys_are_scoped_to_user(self):
        first = self.login()
        second = self.login(guest=True)
        body = self.cart()
        a = self.request("/orders", body, first["token"], expected=201)
        b = self.request("/orders", body, second["token"], expected=201)
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(a["total_cents"], b["total_cents"])

    def test_model_unavailable_api_preserves_existing_receipt_and_reservations(self):
        token = self.login()["token"]
        body = self.cart()
        confirmed = self.request("/orders", body, token, expected=201)
        with closing(self.store.connect()) as db:
            before_orders = db.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
            before_reservations = db.execute(
                "SELECT COUNT(*) FROM reservations"
            ).fetchone()[0]
        bundle = self.workspace.bundle
        self.workspace.bundle = {}
        try:
            error = self.request("/orders", self.cart(), token, expected=409)
            self.assertIsInstance(error["detail"], str)
            self.assertIn("Train", error["detail"])
            self.assertEqual(self.request("/orders", body, token), confirmed)
            self.assertEqual(
                self.request("/orders/" + confirmed["id"], token=token), confirmed
            )
        finally:
            self.workspace.bundle = bundle
        with closing(self.store.connect()) as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM orders").fetchone()[0], before_orders
            )
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM reservations").fetchone()[0],
                before_reservations,
            )

    def test_kitchen_status_and_validation_are_usable_by_checkout(self):
        snapshot = self.request("/kitchen")
        self.assertEqual(
            set(snapshot["settings"]["capacities"]),
            {"Grill", "Oven", "Prep", "Beverage"},
        )
        self.assertGreaterEqual(snapshot["active_tasks"], 0)
        self.assertGreaterEqual(snapshot["waiting_tasks"], 0)
        self.assertIsInstance(snapshot["stations"], list)
        for invalid in (
            {"staff": 0},
            {"staff": True},
            {"capacities": {"Grill": -1}},
            {"workload": 101},
        ):
            error = self.request("/kitchen", invalid, expected=422)
            self.assertIsInstance(error["detail"], list)
            self.assertIn("msg", error["detail"][0])
        self.assertEqual(self.request("/kitchen")["settings"], snapshot["settings"])
