import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Coffee,
  Clock3,
  CookingPot,
  UsersRound,
  Eye,
  EyeOff,
  Flame,
  LoaderCircle,
  LogOut,
  Minus,
  Plus,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Utensils,
  UserRound,
} from "lucide-react";
import { shopApi } from "./shopApi";
import "./customer.css";

const SESSION_KEY = "mise.shop.session";
const basketKey = (id) => "mise.shop.cart." + id;
const emptyBasket = () => ({
  items: [],
  idempotencyKey: "",
  orderId: "",
  checkout: false,
});
const money = (cents, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return typeof value?.token === "string" && value.token ? value : null;
  } catch {
    return null;
  }
}
function readBasket(id) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(basketKey(id)));
    if (!saved || !Array.isArray(saved.items)) return emptyBasket();
    const items = saved.items.filter(
      (item) =>
        typeof item.product_id === "string" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 30,
    );
    const uniqueItems = [
      ...new Map(items.map((item) => [item.product_id, item])).values(),
    ];
    return {
      items: uniqueItems.map(({ product_id, quantity }) => ({
        product_id,
        quantity,
      })),
      idempotencyKey:
        typeof saved.idempotencyKey === "string" ? saved.idempotencyKey : "",
      orderId: typeof saved.orderId === "string" ? saved.orderId : "",
      checkout: saved.checkout === true,
    };
  } catch {
    return emptyBasket();
  }
}
function safeStore(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The current session remains usable without browser storage. */
  }
}
function clearStored(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* A browser can disable storage. */
  }
}
function ErrorNotice({ children, retry }) {
  return (
    <div className="shop-error" role="alert">
      <p>{children}</p>
      {retry && (
        <button type="button" onClick={retry}>
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}
function Loading({ children }) {
  return (
    <div className="shop-loading" role="status">
      <LoaderCircle size={21} className="shop-spin" />
      <span>{children}</span>
    </div>
  );
}
function Photo({ product, className = "" }) {
  return (
    <div className={"shop-photo " + className}>
      <img
        src={product.image}
        alt={product.name}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <Utensils size={32} aria-hidden="true" />
    </div>
  );
}
function Stepper({ step }) {
  return (
    <ol className="shop-steps" aria-label="Order progress">
      {["Choose your food", "Review & confirm", "Order placed"].map(
        (label, i) => (
          <li
            key={label}
            className={i <= step ? "is-current" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            {label}
          </li>
        ),
      )}
    </ol>
  );
}
function Quantity({ value, max, onChange, label, disabled = false }) {
  return (
    <div
      className="shop-quantity"
      role="group"
      aria-label={label + " quantity"}
    >
      <button
        type="button"
        aria-label={"Decrease " + label}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <span aria-label={label + " quantity " + value}>{value}</span>
      <button
        type="button"
        aria-label={"Increase " + label}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
function Login({ onLogin, busy, error, sessionMessage }) {
  const [email, setEmail] = useState("demo@mise.test"),
    [password, setPassword] = useState("Kitchen123!"),
    [visible, setVisible] = useState(false);
  const preset = (which) => {
    setEmail(which === "demo" ? "demo@mise.test" : "guest@mise.test");
    setPassword(which === "demo" ? "Kitchen123!" : "Welcome123!");
  };
  return (
    <div className="shop-login">
      <div className="shop-login-art">
        <img src="/food/burger.webp" alt="Freshly prepared burger" />
        <div>
          <span className="shop-brand-word">mise.</span>
          <h2>
            A good meal
            <br />
            starts here.
          </h2>
          <p>Choose something delicious. We’ll take care of the order.</p>
        </div>
      </div>
      <section className="shop-login-panel">
        <span className="shop-icon-tile">
          <ShoppingBag size={24} />
        </span>
        <h1>Welcome to the table.</h1>
        <p className="shop-intro">
          Sign in with a test account to explore the menu and place a practice
          order.
        </p>
        {sessionMessage && (
          <p className="shop-session-message" role="status">
            {sessionMessage}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onLogin({ email: email.trim(), password });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Email address
              <input
                type="email"
                name="email"
                required
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <span className="shop-password">
                <input
                  type={visible ? "text" : "password"}
                  name="password"
                  required
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <button type="submit" className="shop-primary shop-wide">
              {busy ? (
                <LoaderCircle className="shop-spin" size={17} />
              ) : (
                <UserRound size={17} />
              )}{" "}
              {busy ? "Signing in…" : "Sign in & see the menu"}
              <ArrowRight size={17} />
            </button>
          </fieldset>
        </form>
        <details className="shop-test-accounts" open>
          <summary>Use a test account</summary>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => preset("demo")}
            >
              <b>Demo customer</b>
              <span>demo@mise.test</span>
              <code>Kitchen123!</code>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => preset("guest")}
            >
              <b>Guest customer</b>
              <span>guest@mise.test</span>
              <code>Welcome123!</code>
            </button>
          </div>
        </details>
        <p className="shop-test-note">
          Practice checkout uses a simulated payment. No money is charged.
        </p>
      </section>
    </div>
  );
}
function OrderLines({
  lines,
  items,
  update,
  remove,
  editable = true,
  busy = false,
}) {
  return (
    <div className="shop-order-lines">
      {items.map((item) => {
        const product = lines.find((p) => p.id === item.product_id);
        if (!product)
          return (
            <div className="shop-unavailable-row" key={item.product_id}>
              <span>This item is no longer on the menu.</span>
              {editable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(item.product_id)}
                >
                  Remove item
                </button>
              )}
            </div>
          );
        return (
          <div className="shop-order-line" key={item.product_id}>
            <Photo product={product} />
            <div>
              <strong>{product.name}</strong>
              <small>
                {money(product.price_cents)} each
                {!product.available ? " · Currently unavailable" : ""}
              </small>
              {editable ? (
                <Quantity
                  value={item.quantity}
                  max={product.max_quantity}
                  onChange={(n) => update(item.product_id, n)}
                  label={product.name}
                  disabled={busy}
                />
              ) : (
                <span className="shop-line-quantity">
                  Quantity {item.quantity}
                </span>
              )}
            </div>
            <div className="shop-line-price">
              <b>{money(product.price_cents * item.quantity)}</b>
              {editable && (
                <button
                  type="button"
                  aria-label={"Remove " + product.name}
                  disabled={busy}
                  onClick={() => remove(item.product_id)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Cart({ products, basket, update, remove, checkout, total, issues }) {
  const count = basket.items.reduce((n, item) => n + item.quantity, 0);
  return (
    <aside className="shop-cart" id="shop-cart" tabIndex="-1">
      <header>
        <h2>Your order</h2>
        <span>
          {count} {count === 1 ? "item" : "items"}
        </span>
      </header>
      {!count ? (
        <div className="shop-empty-cart">
          <ShoppingBag size={30} />
          <h3>A little hungry?</h3>
          <p>Add something from the menu to get started.</p>
        </div>
      ) : (
        <>
          <OrderLines
            lines={products}
            items={basket.items}
            update={update}
            remove={remove}
          />
          {issues.length > 0 && (
            <div className="shop-cart-issues" role="status">
              {issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          )}
          <div className="shop-total">
            <span>Order total</span>
            <strong>{money(total)}</strong>
          </div>
          <button
            className="shop-primary shop-wide"
            type="button"
            onClick={checkout}
            disabled={issues.length > 0}
          >
            Review order
            <ArrowRight size={17} />
          </button>
          <p className="shop-cart-footnote">
            You’ll confirm everything on the next screen.
          </p>
        </>
      )}
    </aside>
  );
}
function Menu({
  products,
  basket,
  update,
  remove,
  checkout,
  total,
  issues,
  user,
}) {
  const [filter, setFilter] = useState("All");
  const count = basket.items.reduce((sum, item) => sum + item.quantity, 0);
  const filtered = products.filter(
    (product) =>
      filter === "All" ||
      (filter === "Drinks"
        ? ["Coffee", "Smoothie"].includes(product.dish)
        : !["Coffee", "Smoothie"].includes(product.dish)),
  );
  return (
    <>
      <div className="shop-menu-header">
        <div>
          <span className="shop-greeting">
            A table for {user.name.split(" ")[0]}
          </span>
          <h1>What sounds good?</h1>
          <p>Fresh favorites, ready for your next order.</p>
        </div>
        <button
          type="button"
          className="shop-cart-jump"
          aria-label={
            "View cart, " + count + " " + (count === 1 ? "item" : "items")
          }
          onClick={() => {
            document
              .querySelector("#shop-cart")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
            document
              .querySelector("#shop-cart")
              ?.focus({ preventScroll: true });
          }}
        >
          <ShoppingBag size={18} />
          <span>Your order</span>
          <b>{count}</b>
        </button>
      </div>
      <div className="shop-menu-layout">
        <section className="shop-menu" aria-label="Food menu">
          <div className="shop-menu-banner">
            <div>
              <span className="shop-banner-mark">
                <Flame size={16} /> Made for a good break
              </span>
              <h2>
                Something for
                <br />
                every appetite.
              </h2>
              <p>Pick your favorites and make it a meal.</p>
            </div>
            <img src="/food/burger.webp" alt="" />
          </div>
          <div
            className="shop-filter"
            role="group"
            aria-label="Menu categories"
          >
            {["All", "Food", "Drinks"].map((label) => (
              <button
                type="button"
                key={label}
                aria-pressed={label === filter}
                onClick={() => setFilter(label)}
              >
                {label === "Drinks" ? (
                  <Coffee size={15} />
                ) : (
                  <Utensils size={15} />
                )}{" "}
                {label}
              </button>
            ))}
          </div>
          <div className="shop-products">
            {filtered.map((product) => {
              const selected =
                basket.items.find((item) => item.product_id === product.id)
                  ?.quantity || 0;
              return (
                <article
                  className={
                    "shop-product " +
                    (!product.available ? "is-unavailable" : "")
                  }
                  key={product.id}
                >
                  <Photo product={product} />
                  {!product.available && (
                    <span className="shop-sold-out">Sold out today</span>
                  )}
                  <div className="shop-product-body">
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <div className="shop-product-footer">
                      <strong>{money(product.price_cents)}</strong>
                      {selected > 0 && product.available ? (
                        <div className="shop-product-quantity">
                          <button
                            type="button"
                            aria-label={"Remove one " + product.name}
                            onClick={() =>
                              selected === 1
                                ? remove(product.id)
                                : update(product.id, selected - 1)
                            }
                          >
                            <Minus size={15} />
                          </button>
                          <span aria-label={selected + " in your order"}>
                            {selected}
                          </span>
                          <button
                            type="button"
                            disabled={selected >= product.max_quantity}
                            aria-label={"Add one " + product.name}
                            onClick={() => update(product.id, selected + 1)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="shop-add"
                          aria-label={"Add " + product.name}
                          disabled={!product.available}
                          onClick={() => update(product.id, 1)}
                        >
                          {product.available ? (
                            <>
                              <Plus size={15} />
                              Add
                            </>
                          ) : (
                            "Unavailable"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <Cart
          {...{ products, basket, update, remove, checkout, total, issues }}
        />
      </div>
    </>
  );
}
function Checkout({
  products,
  basket,
  total,
  issues,
  user,
  busy,
  error,
  back,
  place,
}) {
  return (
    <div className="shop-checkout">
      <button
        type="button"
        className="shop-back"
        onClick={back}
        disabled={busy}
      >
        <ArrowLeft size={16} />
        Back to menu
      </button>
      <header>
        <h1>One last look.</h1>
        <p>Check your order, then place it with a simulated payment.</p>
      </header>
      <div className="shop-checkout-layout">
        <section className="shop-review-card">
          <header>
            <h2>Your items</h2>
            <button type="button" onClick={back} disabled={busy}>
              Edit order
            </button>
          </header>
          <OrderLines lines={products} items={basket.items} editable={false} />
          <div className="shop-review-account">
            <UserRound size={20} />
            <div>
              <span>Ordering as</span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        </section>
        <section className="shop-payment-card">
          <span className="shop-icon-tile">
            <ReceiptText size={22} />
          </span>
          <h2>Order summary</h2>
          <div className="shop-payment-row">
            <span>Items subtotal</span>
            <b>{money(total)}</b>
          </div>
          <div className="shop-payment-row">
            <span>Extra charges</span>
            <b>{money(0)}</b>
          </div>
          <div className="shop-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="shop-payment-note">
            <CheckCheck size={19} />
            <div>
              <strong>Simulated payment</strong>
              <p>
                This is a practice order. No card details are needed and no
                money will be charged.
              </p>
            </div>
          </div>
          <div className="shop-checkout-pickup">
            <Clock3 size={19} />
            <div>
              <strong>Pickup time comes with your confirmation</strong>
              <p>
                When you place the order, we check the saved queue, available
                cooks and kitchen stations to schedule every dish.
              </p>
            </div>
          </div>
          {issues.length > 0 && <ErrorNotice>{issues.join(" ")}</ErrorNotice>}
          {error && (
            <ErrorNotice>
              {error}
              <span className="shop-retry-hint">
                Retrying this order uses the same request number to avoid
                duplicate orders.
              </span>
            </ErrorNotice>
          )}
          <button
            type="button"
            className="shop-primary shop-wide"
            disabled={busy || issues.length > 0 || !basket.items.length}
            onClick={place}
          >
            {busy ? (
              <LoaderCircle className="shop-spin" size={18} />
            ) : (
              <ShoppingBag size={18} />
            )}{" "}
            {busy ? "Scheduling your order…" : "Place practice order"}
            {!busy && <ArrowRight size={17} />}
          </button>
          <p className="shop-cart-footnote">
            Your order is saved when confirmation appears.
          </p>
        </section>
      </div>
    </div>
  );
}
function PickupEstimate({ readiness }) {
  if (!readiness)
    return (
      <div className="shop-legacy-pickup">
        <Clock3 size={20} />
        <p>Pickup estimate was not recorded for this older order.</p>
      </div>
    );
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const pickup = new Date(readiness.estimated_ready_at);
  const clock = (value) =>
    new Date(value).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  const minutes = (value) =>
    Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (
    <section className="shop-pickup" aria-label="Saved pickup estimate">
      <div className="shop-pickup-title">
        <span>
          <Clock3 size={21} />
        </span>
        <span>Estimated pickup time</span>
      </div>
      <strong className="shop-pickup-clock">{clock(pickup)}</strong>
      <p className="shop-pickup-date">
        {pickup.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}{" "}
        · {zone}
      </p>
      <p className="shop-pickup-duration">
        About <b>{readiness.estimated_ready_in_minutes} minutes</b> from order
        placement
      </p>
      <div className="shop-pickup-facts">
        <div>
          <UsersRound size={18} />
          <span>
            Orders ahead<b>{readiness.orders_ahead}</b>
          </span>
        </div>
        <div>
          <CookingPot size={18} />
          <span>
            Before first dish starts
            <b>{minutes(readiness.waiting_minutes)} min</b>
          </span>
        </div>
      </div>
      <p className="shop-pickup-explanation">
        This time includes every dish in your order, the queue ahead, and the
        cooks and stations available when you placed it.
      </p>
      <p className="shop-pickup-source">
        Saved at order placement. The preparation model was trained on simulated
        kitchen data.
      </p>
      {readiness.warnings?.length > 0 && (
        <div className="shop-pickup-warnings" role="status">
          {readiness.warnings.map((warning, i) => (
            <p key={i}>{warning}</p>
          ))}
        </div>
      )}
      <details className="shop-pickup-details">
        <summary>
          When each dish is scheduled
          <ChevronRight size={15} />
        </summary>
        <p>All times are shown in {zone}.</p>
        <div
          className="shop-pickup-table"
          tabIndex="0"
          role="region"
          aria-label="Dish preparation schedule"
        >
          <table>
            <thead>
              <tr>
                <th>Dish</th>
                <th>Station</th>
                <th>Starts</th>
                <th>Finishes</th>
                <th>Cooking</th>
                <th>Waiting</th>
              </tr>
            </thead>
            <tbody>
              {readiness.items.map((item, i) => (
                <tr key={item.id || i}>
                  <th scope="row">
                    {item.dish}
                    {item.quantity ? " × " + item.quantity : ""}
                  </th>
                  <td>{item.station}</td>
                  <td>
                    <time dateTime={item.starts_at}>
                      {clock(item.starts_at)}
                    </time>
                  </td>
                  <td>
                    <time dateTime={item.finishes_at}>
                      {clock(item.finishes_at)}
                    </time>
                  </td>
                  <td>{minutes(item.prep_minutes)} min</td>
                  <td>{minutes(item.wait_minutes)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The complete order is ready after the last scheduled dish finishes.
          Cooking can overlap where staff and stations are free.
        </p>
      </details>
    </section>
  );
}

function Confirmation({ order, user, startAnother, navigate }) {
  const date = new Date(order.created_at);
  return (
    <div className="shop-confirmation">
      <div className="shop-confirmation-heading">
        <span>
          <CheckCheck size={34} />
        </span>
        <h1>You’re all set, {user.name.split(" ")[0]}.</h1>
        <p>Your practice order has been placed.</p>
      </div>
      <PickupEstimate readiness={order.readiness} />
      <section className="shop-receipt">
        <header>
          <div>
            <span>Order confirmation</span>
            <h2>{order.id}</h2>
          </div>
          <span className="shop-confirmed">
            <Check size={13} />
            Confirmed
          </span>
        </header>
        <p className="shop-receipt-date">
          {Number.isNaN(date.valueOf())
            ? order.created_at
            : date.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
        </p>
        <div className="shop-receipt-items">
          {order.items.map((item, index) => (
            <div key={item.product_id || index}>
              <span>
                <b>
                  {item.quantity} × {item.name}
                </b>
                <small>
                  {money(item.unit_price_cents, order.currency)} each
                </small>
              </span>
              <strong>{money(item.line_total_cents, order.currency)}</strong>
            </div>
          ))}
        </div>
        <div className="shop-total">
          <span>Order total</span>
          <strong>{money(order.total_cents, order.currency)}</strong>
        </div>
        <div className="shop-receipt-meta">
          <span>
            Customer<b>{user.name}</b>
          </span>
          <span>
            Payment
            <b>
              {order.payment_status === "simulated"
                ? "Simulated · no charge"
                : order.payment_status}
            </b>
          </span>
        </div>
        <p className="shop-receipt-note">
          This confirmation is saved to your test account. You can reload this
          page to view it again.
        </p>
      </section>
      <div className="shop-confirmation-actions">
        <button type="button" className="shop-primary" onClick={startAnother}>
          Start another order
          <Plus size={17} />
        </button>
        <button
          type="button"
          className="shop-secondary"
          onClick={() => navigate("estimate")}
        >
          Explore pickup estimates
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export default function CustomerShop({ navigate }) {
  const [auth, setAuth] = useState(null),
    [checking, setChecking] = useState(true),
    [loginBusy, setLoginBusy] = useState(false),
    [loginError, setLoginError] = useState(""),
    [message, setMessage] = useState("");
  const [products, setProducts] = useState(null),
    [menuError, setMenuError] = useState(""),
    [menuLoading, setMenuLoading] = useState(false);
  const [basket, setBasket] = useState(emptyBasket),
    [order, setOrder] = useState(null),
    [orderBusy, setOrderBusy] = useState(false),
    [orderError, setOrderError] = useState(""),
    [restoreBusy, setRestoreBusy] = useState(false),
    [restoreError, setRestoreError] = useState("");
  const mounted = useRef(true),
    authRef = useRef(null),
    orderLock = useRef(false),
    viewHeading = useRef(null);
  const setSession = (value) => {
    authRef.current = value;
    setAuth(value);
  };
  function remember(value, next) {
    if (value) safeStore(basketKey(value.user.id), next);
    setBasket(next);
  }
  async function loadProducts() {
    setMenuError("");
    setMenuLoading(true);
    try {
      const data = await shopApi("/products");
      if (mounted.current) setProducts(data);
    } catch (err) {
      if (mounted.current) setMenuError(err.message);
    } finally {
      if (mounted.current) setMenuLoading(false);
    }
  }
  function expired() {
    clearStored(SESSION_KEY);
    setSession(null);
    setOrder(null);
    setBasket(emptyBasket());
    setOrderError("");
    setRestoreError("");
    setMessage(
      "Your test session expired. Sign in again to continue with your saved order.",
    );
  }
  async function restoreOrder(value, id) {
    setRestoreBusy(true);
    setRestoreError("");
    try {
      const saved = await shopApi("/orders/" + encodeURIComponent(id), {
        token: value.token,
      });
      if (authRef.current?.token === value.token) {
        setOrder(saved);
        remember(value, { ...emptyBasket(), orderId: saved.id });
      }
    } catch (err) {
      if (authRef.current?.token !== value.token) return;
      if (err.status === 401) expired();
      else setRestoreError(err.message);
    } finally {
      if (mounted.current) setRestoreBusy(false);
    }
  }
  function enter(value) {
    setSession(value);
    safeStore(SESSION_KEY, value);
    setLoginError("");
    setMessage("");
    const saved = readBasket(value.user.id);
    setBasket(saved);
    setOrder(null);
    setOrderError("");
    if (saved.orderId) restoreOrder(value, saved.orderId);
  }
  useEffect(() => {
    mounted.current = true;
    loadProducts();
    const saved = readSession();
    if (!saved) {
      setChecking(false);
      return () => {
        mounted.current = false;
      };
    }
    const controller = new AbortController();
    shopApi("/me", { token: saved.token, signal: controller.signal })
      .then((user) => {
        if (mounted.current) enter({ token: saved.token, user });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (err.status === 401) {
          clearStored(SESSION_KEY);
          setMessage(
            "Please sign in to continue. Your previous session has ended.",
          );
        } else setLoginError(err.message);
      })
      .finally(() => {
        if (mounted.current) setChecking(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);
  async function login(credentials) {
    setLoginBusy(true);
    setLoginError("");
    try {
      const value = await shopApi("/login", { body: credentials });
      if (mounted.current) enter(value);
    } catch (err) {
      if (mounted.current) setLoginError(err.message);
    } finally {
      if (mounted.current) setLoginBusy(false);
    }
  }
  async function logout() {
    if (orderLock.current) return;
    const prior = authRef.current;
    clearStored(SESSION_KEY);
    if (prior) clearStored(basketKey(prior.user.id));
    setSession(null);
    setBasket(emptyBasket());
    setOrder(null);
    setOrderError("");
    setRestoreError("");
    setLoginError("");
    setMessage("You’re signed out. Your cart has been cleared.");
    if (prior)
      try {
        await shopApi("/logout", { token: prior.token, body: {} });
      } catch {
        /* Local session and cart are already cleared. */
      }
  }
  function edit(nextItems) {
    setOrderError("");
    remember(authRef.current, {
      items: nextItems,
      idempotencyKey: "",
      orderId: "",
      checkout: false,
    });
  }
  function update(id, quantity) {
    const product = products?.find((p) => p.id === id);
    if (
      !product?.available ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > product.max_quantity
    )
      return;
    const exists = basket.items.some((item) => item.product_id === id);
    edit(
      exists
        ? basket.items.map((item) =>
            item.product_id === id ? { ...item, quantity } : item,
          )
        : [...basket.items, { product_id: id, quantity }],
    );
  }
  const remove = (id) =>
    edit(basket.items.filter((item) => item.product_id !== id));
  const total = basket.items.reduce(
    (sum, item) =>
      sum +
      (products?.find((p) => p.id === item.product_id)?.price_cents || 0) *
        item.quantity,
    0,
  );
  const issues = basket.items.flatMap((item) => {
    const product = products?.find((p) => p.id === item.product_id);
    if (!product) return ["Remove the item that is no longer on the menu."];
    if (!product.available)
      return [product.name + " is unavailable. Please remove it to continue."];
    if (item.quantity > product.max_quantity)
      return [
        "Choose up to " + product.max_quantity + " of " + product.name + ".",
      ];
    return [];
  });
  function checkout() {
    if (!basket.items.length || issues.length) return;
    remember(authRef.current, {
      ...basket,
      checkout: true,
      idempotencyKey: basket.idempotencyKey || crypto.randomUUID(),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function placeOrder() {
    if (
      orderLock.current ||
      !authRef.current ||
      !basket.items.length ||
      issues.length
    )
      return;
    orderLock.current = true;
    setOrderBusy(true);
    setOrderError("");
    const value = authRef.current;
    const key = basket.idempotencyKey || crypto.randomUUID();
    remember(value, { ...basket, idempotencyKey: key, checkout: true });
    try {
      const placed = await shopApi("/orders", {
        token: value.token,
        body: { items: basket.items, idempotency_key: key },
      });
      if (authRef.current?.token === value.token) {
        setOrder(placed);
        remember(value, { ...emptyBasket(), orderId: placed.id });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      if (authRef.current?.token !== value.token) return;
      if (err.status === 401) expired();
      else {
        setOrderError(err.message);
        if (err.status === 409 || err.status === 422) loadProducts();
      }
    } finally {
      orderLock.current = false;
      if (mounted.current) setOrderBusy(false);
    }
  }
  function startAnother() {
    setOrder(null);
    setRestoreError("");
    remember(authRef.current, emptyBasket());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const stage = order ? 2 : basket.checkout ? 1 : 0;
  useEffect(() => {
    if (auth && !checking) viewHeading.current?.focus({ preventScroll: true });
  }, [stage, auth?.user.id, checking]);
  return (
    <div className="customer-shop">
      {checking ? (
        <Loading>Opening your test account…</Loading>
      ) : !auth ? (
        <Login
          onLogin={login}
          busy={loginBusy}
          error={loginError}
          sessionMessage={message}
        />
      ) : (
        <>
          <header className="shop-toolbar">
            <div>
              <span className="shop-brand-word">mise.</span>
              <span className="shop-test-label">Test kitchen</span>
            </div>
            <div>
              <span className="shop-user">
                <UserRound size={15} />
                {auth.user.name}
              </span>
              <button type="button" onClick={logout} disabled={orderBusy}>
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </header>
          <div
            className="shop-stage-label"
            ref={viewHeading}
            tabIndex="-1"
            aria-label={
              ["Menu", "Review your order", "Order confirmation"][stage]
            }
          >
            <Stepper step={stage} />
          </div>
          {restoreBusy ? (
            <Loading>Finding your saved order…</Loading>
          ) : restoreError ? (
            <section className="shop-restore">
              <ErrorNotice retry={() => restoreOrder(auth, basket.orderId)}>
                {restoreError}
              </ErrorNotice>
              <button
                type="button"
                className="shop-secondary"
                onClick={startAnother}
              >
                Return to the menu
              </button>
            </section>
          ) : order ? (
            <Confirmation
              {...{ order, navigate, startAnother }}
              user={auth.user}
            />
          ) : !products ? (
            <>
              {menuLoading && <Loading>Preparing the menu…</Loading>}
              {menuError && (
                <ErrorNotice retry={loadProducts}>{menuError}</ErrorNotice>
              )}
            </>
          ) : (
            <>
              {menuError && (
                <ErrorNotice retry={loadProducts}>{menuError}</ErrorNotice>
              )}
              {basket.checkout ? (
                <Checkout
                  {...{ products, basket, total, issues }}
                  user={auth.user}
                  busy={orderBusy}
                  error={orderError}
                  back={() => {
                    setOrderError("");
                    remember(authRef.current, { ...basket, checkout: false });
                  }}
                  place={placeOrder}
                />
              ) : (
                <Menu
                  {...{
                    products,
                    basket,
                    update,
                    remove,
                    checkout,
                    total,
                    issues,
                  }}
                  user={auth.user}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
