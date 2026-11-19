# Customer ordering demonstration

Open **Order food** in the Mise sidebar. The module shares the React application and FastAPI service with the restaurant AI workspace.

## Test accounts

| Email | Password |
| --- | --- |
| demo@mise.test | Kitchen123! |
| guest@mise.test | Welcome123! |

These accounts are predefined demonstration identities. A successful login creates an eight-hour session. Signing out revokes that session.

## Try the complete journey

1. Sign in with a test account.
2. Browse the sample food menu. Available products show an add control. The sold-out special stays visible with its availability label.
3. Add products and review the cart. Change quantities or remove items.
4. Continue to checkout and inspect the itemized amount.
5. Select **Place order** to receive a simulated checkout confirmation.
6. Read the estimated pickup time for the complete order, the saved order ID, item details and final amount. Expand the preparation details to see when each dish starts and finishes.

Prices are sample INR values. The Python service calculates every order total from the stored product catalog. The checkout confirmation records a simulated payment. It can be retried using the same confirmation key without creating duplicate orders or reserving kitchen time twice.

## Implementation

- `frontend/src/CustomerShop.jsx` owns the customer journey.
- `frontend/src/customer.css` extends the existing typography and color system.
- `backend/ordering.py` owns the catalog, test sessions and order records.
- `runtime/orders.sqlite` stores the local catalog, sessions and confirmed orders.
- `tests/test_ordering.py` tests the API with its own temporary database.

The API uses the `/api/shop` prefix. The menu is public. Cart confirmation and saved order access require a bearer session for the owning test customer. A price or product name supplied by the browser cannot replace the server catalog value. Product availability and quantity limits are checked during confirmation.

## Pickup estimates and the shared kitchen queue

Every new checkout calls the fitted preparation-time model and reserves the required cooks and station slots before it saves the confirmation. The order's pickup estimate is the latest finish among all its dish batches. Independent dishes can run in parallel, and earlier bookings affect both active work and future availability.

Open **Order kitchen** in the workspace to inspect current capacity and configure cooks, station slots and kitchen utilization. These settings are used by customer checkout. Existing reservations retain their assigned resources and times. Adding capacity is permitted while orders are in progress. A capacity reduction is rejected when it would remove a cook or station slot already reserved for unfinished work.

The demonstration advances preparation according to scheduled start and finish times. Elapsed bookings automatically free capacity for subsequent orders. It assumes the kitchen follows the predicted schedule. Pickup estimates remain saved at placement, including after a reload or retry. A real kitchen integration would supply actual progress to account for unexpected delays.

The queue, settings, and schedules persist in the same SQLite database as customer orders. Checkout saves the order and reservations in one transaction. Prediction or scheduling failure leaves the cart available for retry. A selected dataset must have a trained model before an order can be confirmed.

Orders saved before this connection was added retain their original receipts. Their preparation state was never recorded, so they have no saved pickup estimate or resource bookings.

## Reuse from another app

Each order still includes `preparation_items`. Its `readiness` field stores the pickup estimate, kitchen snapshot, model version, queue count, warnings and individual task timing.

Use `POST /api/shop/orders` for checkout with a saved reservation in this shared kitchen. The standalone `POST /api/v1/estimate` remains useful for hypothetical order calculations from caller-supplied kitchen snapshots. Its contract is documented in `INTEGRATION.md`.

Models use synthetic training data. Customer estimates are labeled as demonstration estimates.
