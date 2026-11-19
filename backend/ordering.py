"""Persistent customer-order demonstrations with revocable local test sessions."""

from contextlib import closing
from datetime import datetime, timezone
from hashlib import sha256
from hmac import compare_digest
import json
from pathlib import Path
import secrets
import sqlite3
import time
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .order_readiness import KitchenSettings, KitchenUpdate, Readiness, estimate_booking

SESSION_SECONDS = 8 * 60 * 60
DEFAULT_PATH = Path(__file__).resolve().parents[1] / "runtime" / "orders.sqlite"
ACCOUNTS = {
    "demo@mise.test": {
        "id": "test-demo",
        "name": "Demo Customer",
        "email": "demo@mise.test",
        "password": "Kitchen123!",
    },
    "guest@mise.test": {
        "id": "test-guest",
        "name": "Guest Customer",
        "email": "guest@mise.test",
        "password": "Welcome123!",
    },
}
CATALOG = [
    dict(
        id="burger",
        name="House Burger",
        description="Grilled patty, cheddar, crisp lettuce and house sauce in a toasted bun.",
        price_cents=24900,
        image="/food/burger.webp",
        available=True,
        dish="Burger",
        complexity=3,
        max_quantity=30,
    ),
    dict(
        id="pizza",
        name="Margherita Pizza",
        description="Stone-baked crust with tomato, mozzarella and fresh basil.",
        price_cents=39900,
        image="/food/pizza.webp",
        available=True,
        dish="Pizza",
        complexity=4,
        max_quantity=30,
    ),
    dict(
        id="sandwich",
        name="Garden Sandwich",
        description="Toasted sourdough layered with greens, tomato and herb dressing.",
        price_cents=18900,
        image="/food/sandwich.webp",
        available=True,
        dish="Sandwich",
        complexity=2,
        max_quantity=30,
    ),
    dict(
        id="coffee",
        name="House Coffee",
        description="A freshly pulled espresso with silky steamed milk.",
        price_cents=12900,
        image="/food/coffee.webp",
        available=True,
        dish="Coffee",
        complexity=1,
        max_quantity=30,
    ),
    dict(
        id="smoothie",
        name="Berry Smoothie",
        description="A chilled blend of berries, banana and creamy yogurt.",
        price_cents=19900,
        image="/food/smoothie.webp",
        available=True,
        dish="Smoothie",
        complexity=2,
        max_quantity=30,
    ),
    dict(
        id="chef-burger",
        name="Chef's Special Burger",
        description="Our limited special with caramelized onions and smoky relish.",
        price_cents=32900,
        image="/food/burger-special.webp",
        available=False,
        dish="Burger",
        complexity=5,
        max_quantity=30,
    ),
]


class RequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class LoginRequest(RequestBody):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class User(BaseModel):
    id: str
    name: str
    email: str


class LoginResponse(BaseModel):
    token: str
    user: User
    expires_at: str


class Product(BaseModel):
    id: str
    name: str
    description: str
    price_cents: int
    image: str
    available: bool
    dish: str
    complexity: int
    max_quantity: int


class CartItem(RequestBody):
    product_id: Annotated[
        str, StringConstraints(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$")
    ]
    quantity: int = Field(strict=True, ge=1, le=30)


class ConfirmOrder(RequestBody):
    items: list[CartItem] = Field(min_length=1, max_length=40)
    idempotency_key: Annotated[
        str,
        StringConstraints(
            min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
        ),
    ]

    @model_validator(mode="after")
    def unique_products(self):
        if len({item.product_id for item in self.items}) != len(self.items):
            raise ValueError("Combine each product's quantity into a single cart item")
        return self


class OrderLine(BaseModel):
    product_id: str
    name: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int


class PreparationItem(BaseModel):
    id: str
    dish: str
    quantity: int
    complexity: int


class Order(BaseModel):
    id: str
    created_at: str
    status: Literal["confirmed"]
    payment_status: Literal["simulated"]
    currency: Literal["INR"]
    items: list[OrderLine]
    total_cents: int
    preparation_items: list[PreparationItem]
    readiness: Readiness | None = None


def timestamp(seconds=None):
    return datetime.fromtimestamp(
        seconds if seconds is not None else time.time(), timezone.utc
    ).isoformat()


def digest(token):
    return sha256(token.encode()).hexdigest()


def public_user(account):
    return {key: account[key] for key in ("id", "name", "email")}


class OrderStore:
    """SQLite transactions make price snapshots and idempotent confirmation atomic."""

    def __init__(self, path=DEFAULT_PATH, workspace_dependency=None):
        self.workspace_dependency = workspace_dependency
        self.path = Path(path).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as db, db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    catalog_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS kitchen_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    settings_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS reservations (
                    order_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    station TEXT NOT NULL,
                    slot INTEGER NOT NULL,
                    cook INTEGER NOT NULL,
                    starts_at REAL NOT NULL,
                    finishes_at REAL NOT NULL,
                    prep_minutes REAL NOT NULL,
                    PRIMARY KEY (order_id, task_id)
                );
                CREATE INDEX IF NOT EXISTS reservations_finish ON reservations(finishes_at);
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    request_hash TEXT NOT NULL,
                    order_json TEXT NOT NULL,
                    UNIQUE (user_id, idempotency_key)
                );
            """)
            db.execute(
                "INSERT OR IGNORE INTO kitchen_settings(id, settings_json) VALUES (1, ?)",
                (KitchenSettings().model_dump_json(),),
            )
            db.executemany(
                "INSERT OR IGNORE INTO products(id, catalog_json) VALUES (?, ?)",
                [(p["id"], json.dumps(p)) for p in CATALOG],
            )

    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        return db

    def login(self, body: LoginRequest):
        account = ACCOUNTS.get(body.email.strip().lower())
        expected = account["password"] if account else "invalid-test-password"
        valid = compare_digest(body.password.encode(), expected.encode())
        if not valid or account is None:
            raise HTTPException(401, "The test email or password is incorrect.")
        token = secrets.token_urlsafe(32)
        expires = time.time() + SESSION_SECONDS
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (time.time(),))
            db.execute(
                "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (digest(token), account["id"], expires),
            )
        return dict(
            token=token, user=public_user(account), expires_at=timestamp(expires)
        )

    def authenticate(self, token):
        with closing(self.connect()) as db:
            row = db.execute(
                "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
                (digest(token), time.time()),
            ).fetchone()
        account = next(
            (a for a in ACCOUNTS.values() if row and a["id"] == row["user_id"]), None
        )
        if account is None:
            raise HTTPException(
                401,
                "Your test session has expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return public_user(account)

    def logout(self, token):
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (digest(token),))

    def products(self):
        with closing(self.connect()) as db:
            rows = db.execute(
                "SELECT catalog_json FROM products ORDER BY rowid"
            ).fetchall()
        return [
            Product.model_validate_json(row["catalog_json"]).model_dump()
            for row in rows
        ]

    def order(self, user_id, order_id):
        with closing(self.connect()) as db:
            row = db.execute(
                "SELECT order_json FROM orders WHERE id = ? AND user_id = ?",
                (order_id, user_id),
            ).fetchone()
        if row is None:
            raise HTTPException(404, "This order could not be found.")
        return Order.model_validate_json(row["order_json"]).model_dump()

    @staticmethod
    def read_settings(db):
        row = db.execute(
            "SELECT settings_json FROM kitchen_settings WHERE id = 1"
        ).fetchone()
        return KitchenSettings.model_validate_json(row["settings_json"])

    @staticmethod
    def unfinished(db, now):
        return [
            dict(row)
            for row in db.execute(
                "SELECT * FROM reservations WHERE finishes_at > ? ORDER BY starts_at, order_id, task_id",
                (now,),
            )
        ]

    def status_snapshot(self, db, now):
        settings = self.read_settings(db)
        rows = self.unfinished(db, now)
        active = [r for r in rows if r["starts_at"] <= now]
        return dict(
            settings=settings.model_dump(),
            now=timestamp(now),
            orders_ahead=len({r["order_id"] for r in rows}),
            active_tasks=len(active),
            waiting_tasks=len(rows) - len(active),
            stations=[
                dict(
                    station=station,
                    capacity=capacity,
                    active=sum(r["station"] == station for r in active),
                    waiting=sum(
                        r["station"] == station and r["starts_at"] > now for r in rows
                    ),
                )
                for station, capacity in settings.capacities.items()
            ],
            next_completion_at=timestamp(min(r["finishes_at"] for r in rows))
            if rows
            else None,
        )

    def kitchen_status(self):
        with closing(self.connect()) as db, db:
            db.execute("BEGIN")
            return self.status_snapshot(db, time.time())

    def configure_kitchen(self, body: KitchenUpdate):
        body = KitchenUpdate.model_validate(body)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            now = time.time()
            previous = self.read_settings(db)
            updates = body.model_dump(exclude_none=True)
            if "capacities" in updates:
                updates["capacities"] = {**previous.capacities, **updates["capacities"]}
            settings = KitchenSettings.model_validate(
                {**previous.model_dump(), **updates}
            )
            for reservation in self.unfinished(db, now):
                if reservation["cook"] > settings.staff:
                    raise HTTPException(
                        409,
                        "An unfinished order has reserved a cook beyond that limit. Keep that cook available until the reservation finishes.",
                    )
                if reservation["slot"] > settings.capacities[reservation["station"]]:
                    raise HTTPException(
                        409,
                        f"An unfinished order has reserved that {reservation['station']} slot. Keep it available until the reservation finishes.",
                    )
            db.execute(
                "UPDATE kitchen_settings SET settings_json = ? WHERE id = 1",
                (settings.model_dump_json(),),
            )
            return self.status_snapshot(db, now)

    def confirm(self, user_id, body: ConfirmOrder):
        cart = sorted(
            (item.model_dump() for item in body.items), key=lambda i: i["product_id"]
        )
        fingerprint = digest(json.dumps(cart, sort_keys=True, separators=(",", ":")))
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT request_hash, order_json FROM orders WHERE user_id = ? AND idempotency_key = ?",
                (user_id, body.idempotency_key),
            ).fetchone()
            if existing:
                if not compare_digest(existing["request_hash"], fingerprint):
                    raise HTTPException(
                        409,
                        "This confirmation key was already used for a different cart. Start a new confirmation.",
                    )
                return Order.model_validate_json(
                    existing["order_json"]
                ).model_dump(), False
            catalog = {
                row["id"]: json.loads(row["catalog_json"])
                for row in db.execute("SELECT id, catalog_json FROM products")
            }
            items, preparation = [], []
            for line in cart:
                product = catalog.get(line["product_id"])
                if product is None:
                    raise HTTPException(
                        422,
                        f"Unknown product '{line['product_id']}'. Refresh the menu and try again.",
                    )
                if not product["available"]:
                    raise HTTPException(
                        409,
                        f"{product['name']} is sold out. Remove it from your cart to continue.",
                    )
                qty = line["quantity"]
                if qty > product["max_quantity"]:
                    raise HTTPException(
                        422,
                        f"{product['name']} allows up to {product['max_quantity']} per order.",
                    )
                items.append(
                    dict(
                        product_id=product["id"],
                        name=product["name"],
                        quantity=qty,
                        unit_price_cents=product["price_cents"],
                        line_total_cents=product["price_cents"] * qty,
                    )
                )
                preparation.append(
                    dict(
                        id=product["id"],
                        dish=product["dish"],
                        quantity=qty,
                        complexity=product["complexity"],
                    )
                )
            now = time.time()
            settings = self.read_settings(db)
            workspace = (
                self.workspace_dependency() if self.workspace_dependency else None
            )
            readiness, reservations = estimate_booking(
                workspace,
                preparation,
                settings,
                self.unfinished(db, now),
                now,
            )
            order = dict(
                id="M-" + uuid4().hex.upper(),
                created_at=timestamp(now),
                status="confirmed",
                payment_status="simulated",
                currency="INR",
                items=items,
                total_cents=sum(item["line_total_cents"] for item in items),
                preparation_items=preparation,
                readiness=readiness,
            )
            order = Order.model_validate(order).model_dump()
            serialized = json.dumps(order, allow_nan=False)
            db.execute(
                "INSERT INTO orders(id, user_id, idempotency_key, request_hash, order_json) VALUES (?, ?, ?, ?, ?)",
                (
                    order["id"],
                    user_id,
                    body.idempotency_key,
                    fingerprint,
                    serialized,
                ),
            )
            db.executemany(
                "INSERT INTO reservations(order_id, task_id, station, slot, cook, starts_at, finishes_at, prep_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        order["id"],
                        r["task_id"],
                        r["station"],
                        r["slot"],
                        r["cook"],
                        r["starts_at"],
                        r["finishes_at"],
                        r["prep_minutes"],
                    )
                    for r in reservations
                ],
            )
        return order, True


def create_router(path=DEFAULT_PATH, workspace_dependency=None):
    """Create the shop API with a replaceable SQLite path for isolated tests."""
    store = OrderStore(path, workspace_dependency)
    bearer = HTTPBearer(auto_error=False)
    router = APIRouter(prefix="/api/shop", tags=["Customer ordering test"])

    def session(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if credentials is None:
            raise HTTPException(
                401,
                "Sign in to your test account to continue.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return store.authenticate(credentials.credentials), credentials.credentials

    @router.post("/login", response_model=LoginResponse)
    def login(body: LoginRequest):
        return store.login(body)

    @router.post("/logout")
    def logout(auth=Depends(session)):
        store.logout(auth[1])
        return {"ok": True}

    @router.get("/me", response_model=User)
    def me(auth=Depends(session)):
        return auth[0]

    @router.get("/kitchen")
    def kitchen():
        return store.kitchen_status()

    @router.post("/kitchen")
    def update_kitchen(body: KitchenUpdate):
        return store.configure_kitchen(body)

    @router.get("/products", response_model=list[Product])
    def products():
        return store.products()

    @router.post("/orders", response_model=Order, status_code=201)
    def confirm(body: ConfirmOrder, response: Response, auth=Depends(session)):
        order, created = store.confirm(auth[0]["id"], body)
        response.status_code = 201 if created else 200
        return order

    @router.get("/orders/{order_id}", response_model=Order)
    def get_order(order_id: str, auth=Depends(session)):
        return store.order(auth[0]["id"], order_id)

    return router
