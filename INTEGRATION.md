# Use Mise in a React application

Mise exposes the fitted preparation-time models and Python kitchen scheduler through a stateless HTTP API. Your React app submits a new order and a current kitchen snapshot. The API returns an estimated pickup-readiness duration, the model identity, and an optional preparation schedule.

All bundled models use synthetic data. Render the returned warnings with the estimate. Train and validate against restaurant observations before using estimates as real operational promises.

## Start the local service

Run `Start Mise.cmd` from this project. The service listens at `http://127.0.0.1:8765`. The existing platform supplies dataset generation, training, and model selection.

- `GET /api/v1/menu` lists dish names, station requirements, defaults, limits, and available model identifiers.
- `POST /api/v1/estimate` calculates the complete order readiness.
- `GET /docs` provides the OpenAPI request and response schemas.

The algorithm uses the active dataset's fitted models. Train a model through the Model training page if the service returns HTTP 409.

## Connect a Vite React app

Copy `frontend/src/estimateClient.js` into your app. Configure a same-origin development proxy in your app's `vite.config.js`.

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
  },
});
```

For a deployed React app, route `/api/v1` through its web server to the Python service. The browser continues to call its own origin. If your reverse proxy uses an additional prefix, pass `{ apiBase: "/kitchen-ai" }` to the client and configure that prefix at the proxy.

## Show an estimate with React

The example uses a memoized request so rerenders preserve its identity. The effect cancels an obsolete request when the order changes or the component unmounts. The component also checks the abort signal before displaying a response.

```jsx
import { useEffect, useMemo, useState } from "react";
import { estimateOrder } from "./estimateClient";

export function Readiness({ orderId, burgerCount, kitchenSnapshot }) {
  const request = useMemo(
    () => ({
      order_id: orderId,
      items: [{ id: "burgers", dish: "Burger", quantity: burgerCount }],
      kitchen: kitchenSnapshot.kitchen,
      pending_orders: kitchenSnapshot.pending_orders,
      active_tasks: kitchenSnapshot.active_tasks,
      model: "recommended",
    }),
    [orderId, burgerCount, kitchenSnapshot],
  );
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    estimateOrder(request, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", result });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: error.message });
        }
      });
    return () => controller.abort();
  }, [request]);

  if (state.status === "loading") return <p role="status">Estimating readiness…</p>;
  if (state.status === "error") return <p role="alert">{state.message}</p>;

  return (
    <section aria-label="Order readiness">
      <h2>{state.result.message}</h2>
      <p>Estimated queue wait before the first item starts is {
        state.result.waiting_minutes.toFixed(1)
      } minutes.</p>
      {state.result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
    </section>
  );
}
```

Keep `kitchenSnapshot` memoized or stored in state in the parent component. Update it when the queue, active work, staffing, or resource availability changes. Aborting a browser request prevents stale UI updates. A calculation already running on the Python server may finish.

## Send the current kitchen snapshot

A minimal demonstration request uses explicit server defaults.

```json
{
  "order_id": "WEB-123",
  "items": [{ "dish": "Burger", "quantity": 2 }]
}
```

A fuller example supplies the current state.

```json
{
  "order_id": "WEB-123",
  "items": [
    { "id": "burgers", "dish": "Burger", "quantity": 2, "complexity": 3 },
    { "id": "coffee", "dish": "Coffee", "quantity": 1, "complexity": 1 }
  ],
  "kitchen": {
    "staff": 3,
    "capacities": { "Grill": 1, "Oven": 1, "Prep": 1, "Beverage": 1 },
    "workload": 55,
    "period": "Dinner",
    "day": "Saturday"
  },
  "pending_orders": [
    {
      "id": "WEB-122",
      "accepted_minutes_ago": 4,
      "items": [{ "id": "pizza", "dish": "Pizza", "quantity": 1 }]
    }
  ],
  "active_tasks": [{ "station": "Grill", "remaining_minutes": 5 }],
  "model": "recommended",
  "include_schedule": true
}
```

Each request estimates from a snapshot and leaves persistent queue management to your application. Your order service should supply a consistent snapshot and preserve its accepted orders. Submit a fresh estimate when that snapshot changes.

Include only waiting batches in `pending_orders`. Include already-started work in `active_tasks` with its remaining duration. Supplying the same work in both lists reserves it twice. `staff` is the total concurrent cook capacity, including cooks occupied by active tasks. Station capacities also include slots occupied by active tasks.

The new order is accepted at minute zero. `accepted_minutes_ago` is a positive elapsed duration for an older ticket. The scheduler uses the oldest eligible ticket first and can use a free station while another ticket waits on a busy station. Every batch occupies one cook and one station slot until completion. `depends_on` references item IDs in the same ticket and releases a batch after all listed tasks finish.

## Defaults and bounds

| Input | Default | Supported bounds |
| --- | --- | --- |
| `order_id` | Required | Nonempty string, up to 80 characters |
| `items` | Required | 1–40 batches |
| Item `id` | `item-1`, `item-2`, etc. | Unique within its ticket |
| Item `quantity` | 1 | 1–30 |
| Item `complexity` | Burger 3, Pizza 4, Sandwich 2, Coffee 1, Smoothie 2 | 1–5 |
| Item `depends_on` | Empty list | Existing same-ticket item IDs, acyclic |
| `kitchen.staff` | 3 | 1–25 |
| Each station capacity | 1 | 0–16, positive for any required station |
| `kitchen.workload` | 45 | 0–100 percent |
| `kitchen.period` | `Lunch` | Morning, Lunch, Afternoon, Dinner |
| `kitchen.day` | `Tuesday` | Monday–Sunday |
| `pending_orders` | Empty list | Up to 40 tickets |
| `accepted_minutes_ago` | 0 | 0–1440 |
| `active_tasks` | Empty list | Up to 25, bounded by staff and station capacities |
| `remaining_minutes` | Required for an active task | Greater than zero, up to 1440 |
| `model` | `recommended` | recommended, linear, knn, svr, forest, xgb |
| `include_schedule` | false | Boolean |

A request supports at most 150 waiting batches across new and pending tickets. Omitted station keys inherit capacity one. The defaults support repeatable demonstrations. Pass the restaurant's actual local weekday, service period, staffing, capacities, and queue conditions for operational integration.

Reserved pending ticket names are `New order` and `In progress`. The new order ID must differ from all pending ticket IDs. Automatic item IDs can collide with explicit IDs, so supply every ID when defining dependencies.

## Read the response

| Field | Meaning |
| --- | --- |
| `estimated_ready_in_minutes` | Whole minutes rounded upward for the customer-facing estimate |
| `readiness_minutes` | Scheduler completion time of the last required new-order batch |
| `waiting_minutes` | Time until the first new-order batch starts |
| `message` | Ready-to-display approximate readiness text |
| `model.id` | Regression model used |
| `model.dataset_version` | Exact active dataset version captured for the calculation |
| `model.trained_at` | Fitted run timestamp |
| `data_source` | `synthetic` for the bundled generator and models |
| `warnings` | Synthetic-data disclosure, range extrapolation, and duration clamping when applicable |
| `assumptions` | Scheduling policy, kitchen context, and feature construction |
| `schedule` | Included when requested, with task start/end, duration, wait, station, slot, cook, dependencies and model inputs |

Readiness incorporates queue waiting and parallel station operation. The per-task duration is active batch preparation time. The schedule uses the canonical labels `New order` and `In progress` in its `order` field. `customer_order_id` maps new and pending tasks to caller ticket IDs and is omitted for anonymous active reservations.

`recommended` selects the lowest validation MAE among models fitted for the captured dataset version. A concurrent workspace dataset change cannot mix model and dataset snapshots within a response.

The generator's fixed historical dish baseline supplies recent-average features. Queue-work features combine known remaining work and historical batch priors. These assumptions appear in the response and are implemented in `backend/scheduler.py`.

## Handle failures

- HTTP 422 returns a `detail` array with field locations and messages for invalid input, task cycles, missing resources, or impossible active reservations.
- HTTP 409 returns a `detail` string when the requested active dataset has no appropriate fitted model.
- Network failures should leave the UI in an error state. Recalculate after restoring connectivity.

The reusable fetch client turns HTTP errors into readable exceptions. It accepts an `AbortSignal` and performs no automatic retries or queue writes.

## Call from Python

```python
from backend.integration import estimate_order
from backend.store import Workspace

workspace = Workspace()
result = estimate_order(workspace, {
    "order_id": "WEB-123",
    "items": [{"dish": "Burger", "quantity": 2}],
    "include_schedule": True,
})
print(result["message"])
```

Reuse one `Workspace` instance in a long-running application. Run the Python code from this project root, or import the backend package through your application's Python path. An unfitted dataset raises `EstimateUnavailable`; invalid input raises Pydantic `ValidationError`.

## Verify the interface

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_integration.py -v
```

The tests use temporary storage on E:. They train real models and verify the minimal request, validation, queue and active-work effects, agreement with the canonical scheduler for all five models, warning behavior, model availability, and a dataset switch during calculation.


## Checkout with a shared queue

The customer module now schedules confirmed orders through the fitted model. Authenticated `POST /api/shop/orders` accepts the existing cart and idempotency key and saves both the order and its resource reservations. The returned `readiness` object contains the complete-order pickup time, model provenance, kitchen snapshot, number of orders ahead, and per-dish start and finish times.

Use the saved order endpoint to restore the exact estimate recorded at checkout. A repeated checkout key returns the same order and reservations. Earlier receipts may have `readiness: null`.

The shared kitchen settings and current occupancy are available through `GET /api/shop/kitchen`. The **Order kitchen** page edits them using `POST /api/shop/kitchen`. Adding cooks or station slots leaves existing bookings valid. Reductions that remove resources already reserved for unfinished dishes are rejected.

The standalone estimation endpoint above remains stateless. Checkout is the operation that commits kitchen reservations. Demo progress follows stored schedule timestamps, and physical kitchen delays require actual-progress inputs in a future operational integration.
