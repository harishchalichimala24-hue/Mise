import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  ChevronDown,
  Clock3,
  Coffee,
  Flame,
  LoaderCircle,
  Plus,
  Sandwich,
  Trash2,
  Utensils,
} from "lucide-react";
import { api } from "./api";
import { estimateOrder } from "./estimateClient";
import "./simple.css";

const dishes = ["Burger", "Pizza", "Sandwich", "Coffee", "Smoothie"];
const defaults = { Burger: 3, Pizza: 4, Sandwich: 2, Coffee: 1, Smoothie: 2 };
const icons = {
  Burger: Sandwich,
  Pizza: Flame,
  Sandwich: Sandwich,
  Coffee: Coffee,
  Smoothie: Coffee,
};
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const num = (value) =>
  Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
function serviceContext() {
  const now = new Date(),
    hour = now.getHours();
  return {
    day: weekdays[now.getDay()],
    period:
      hour < 11
        ? "Morning"
        : hour < 15
          ? "Lunch"
          : hour < 18
            ? "Afternoon"
            : "Dinner",
  };
}
export default function QuickEstimate({ state, navigate }) {
  const [items, setItems] = useState([
    { id: "item-1", dish: "Burger", quantity: 1, complexity: 3 },
  ]);
  const [presets, setPresets] = useState([]),
    [preset, setPreset] = useState("empty");
  const [staff, setStaff] = useState(3),
    [capacity, setCapacity] = useState({
      Grill: 1,
      Oven: 1,
      Prep: 1,
      Beverage: 1,
    });
  const [context, setContext] = useState(serviceContext),
    [utilization, setUtilization] = useState(25);
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState("");
  const request = useRef(null),
    resultHeading = useRef(null);
  const available = Boolean(state.recommended);
  async function loadPresets() {
    try {
      setPresets(await api("/scenarios"));
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
    }
  }
  useEffect(() => {
    loadPresets();
    return () => request.current?.abort();
  }, []);
  function invalidate() {
    request.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  }
  function editItems(next) {
    invalidate();
    setItems(next);
  }
  function choosePreset(id) {
    const p = presets.find((p) => p.id === id);
    if (!p) return;
    invalidate();
    setPreset(id);
    setStaff(p.staff);
    setCapacity(p.capacities);
    setUtilization(p.workload);
  }
  const fixture = presets.find((p) => p.id === preset);
  const pending = fixture?.pending || [],
    active = fixture?.active || [];
  const payload = {
    order_id: "preview-order",
    items,
    kitchen: {
      staff: Number(staff),
      capacities: capacity,
      workload: Number(utilization),
      ...context,
    },
    pending_orders: pending.map((p) => ({
      id: p.id,
      accepted_minutes_ago: -p.accepted,
      items: p.items,
    })),
    active_tasks: active.map((t) => ({
      station: t.station,
      remaining_minutes: t.remaining,
    })),
    model: "recommended",
    include_schedule: true,
  };
  async function calculate(e) {
    e.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const next = await estimateOrder(payload, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setResult(next);
        requestAnimationFrame(() => resultHeading.current?.focus());
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  const target = result?.schedule?.filter((t) => t.order === "New order") || [];
  return (
    <div className="simple-page">
      <header className="simple-welcome">
        <div>
          <span className="simple-tag">Order readiness</span>
          <h1>When will your order be ready?</h1>
          <p>
            Choose the dishes and kitchen conditions. We’ll work out the pickup
            time.
          </p>
        </div>
        <img src="/art/kitchen-diorama.webp" alt="" />
      </header>
      <div className="simple-layout">
        <form
          onSubmit={calculate}
          className="simple-form"
          onInvalidCapture={(event) => {
            const details = event.target.closest("details");
            if (details) details.open = true;
          }}
        >
          <section className="panel simple-section">
            <div className="simple-section-title">
              <span className="simple-step">1</span>
              <div>
                <h2>What’s in the order?</h2>
                <p>Add all the dishes the customer is waiting for.</p>
              </div>
            </div>
            <div className="simple-items">
              {items.map((item, index) => {
                const Icon = icons[item.dish];
                return (
                  <div className="simple-item" key={item.id}>
                    <span className="simple-dish-icon">
                      <Icon size={24} />
                    </span>
                    <label>
                      Dish {index + 1}
                      <select
                        value={item.dish}
                        onChange={(e) =>
                          editItems(
                            items.map((i) =>
                              i.id === item.id
                                ? {
                                    ...i,
                                    dish: e.target.value,
                                    complexity: defaults[e.target.value],
                                  }
                                : i,
                            ),
                          )
                        }
                      >
                        {dishes.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        required
                        type="number"
                        min="1"
                        max="30"
                        value={item.quantity}
                        onChange={(e) =>
                          editItems(
                            items.map((i) =>
                              i.id === item.id
                                ? {
                                    ...i,
                                    quantity:
                                      e.target.value === ""
                                        ? ""
                                        : Number(e.target.value),
                                  }
                                : i,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="simple-delete"
                      disabled={items.length === 1}
                      aria-label={"Remove dish " + (index + 1)}
                      onClick={() =>
                        editItems(items.filter((i) => i.id !== item.id))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="btn"
              disabled={items.length >= 40}
              onClick={() =>
                editItems([
                  ...items,
                  {
                    id: crypto.randomUUID(),
                    dish: "Coffee",
                    quantity: 1,
                    complexity: 1,
                  },
                ])
              }
            >
              <Plus size={16} /> Add another dish
            </button>
          </section>
          <section className="panel simple-section">
            <div className="simple-section-title">
              <span className="simple-step">2</span>
              <div>
                <h2>How busy is the kitchen?</h2>
                <p>
                  Try an example service, then adjust the staff and equipment.
                </p>
              </div>
            </div>
            {loadError ? (
              <div role="alert" className="simple-alert">
                {loadError}
                <button type="button" className="btn" onClick={loadPresets}>
                  Try loading again
                </button>
              </div>
            ) : (
              <div
                className="simple-presets"
                role="group"
                aria-label="Kitchen conditions"
              >
                {[
                  ["empty", "Quiet", "No waiting orders"],
                  ["normal", "Usual service", "A few orders ahead"],
                  ["rush", "Busy", "Dinner rush"],
                ].map(([id, label, hint]) => (
                  <button
                    type="button"
                    key={id}
                    disabled={!presets.length}
                    aria-pressed={preset === id}
                    onClick={() => choosePreset(id)}
                  >
                    <strong>{label}</strong>
                    <span>{hint}</span>
                    {preset === id && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
            <div className="simple-kitchen-summary">
              <ChefHat size={17} />
              <span>
                <b>{pending.length}</b> orders waiting · <b>{active.length}</b>{" "}
                dishes already cooking
              </span>
            </div>
            <div className="simple-fields">
              <label>
                Cooks available
                <input
                  required
                  type="number"
                  min="1"
                  max="25"
                  value={staff}
                  onChange={(e) => {
                    invalidate();
                    setStaff(e.target.value);
                  }}
                />
                <small>Includes cooks working on the dishes above.</small>
              </label>
              <label>
                Kitchen use
                <select
                  value={utilization}
                  onChange={(e) => {
                    invalidate();
                    setUtilization(Number(e.target.value));
                  }}
                >
                  {![25, 50, 80, 100].includes(Number(utilization)) && (
                    <option value={utilization}>
                      {utilization}% from the example
                    </option>
                  )}
                  <option value={25}>Light use · 25%</option>
                  <option value={50}>Half busy · 50%</option>
                  <option value={80}>Very busy · 80%</option>
                  <option value={100}>Fully occupied · 100%</option>
                </select>
                <small>
                  How much of the kitchen’s working capacity is in use.
                </small>
              </label>
            </div>
            <details className="simple-details">
              <summary>
                Equipment and preparation settings <ChevronDown size={16} />
              </summary>
              <div className="simple-fields">
                {Object.entries(capacity).map(([station, n]) => (
                  <label key={station}>
                    {station === "Prep"
                      ? "Preparation counter"
                      : station === "Beverage"
                        ? "Drinks counter"
                        : station}{" "}
                    slots
                    <input
                      required
                      type="number"
                      min="0"
                      max="16"
                      value={n}
                      onChange={(e) => {
                        invalidate();
                        setCapacity({
                          ...capacity,
                          [station]:
                            e.target.value === "" ? "" : Number(e.target.value),
                        });
                      }}
                    />
                  </label>
                ))}
                <label>
                  Service period
                  <select
                    value={context.period}
                    onChange={(e) => {
                      invalidate();
                      setContext({ ...context, period: e.target.value });
                    }}
                  >
                    {["Morning", "Lunch", "Afternoon", "Dinner"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Day
                  <select
                    value={context.day}
                    onChange={(e) => {
                      invalidate();
                      setContext({ ...context, day: e.target.value });
                    }}
                  >
                    {weekdays.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                {items.map((item, i) => (
                  <label key={item.id}>
                    Dish {i + 1} preparation difficulty
                    <select
                      value={item.complexity}
                      onChange={(e) =>
                        editItems(
                          items.map((x) =>
                            x.id === item.id
                              ? { ...x, complexity: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                    >
                      {[
                        [1, "Very simple"],
                        [2, "Simple"],
                        [3, "Standard"],
                        [4, "Detailed"],
                        [5, "Very detailed"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <small>Each slot can prepare one dish batch at a time.</small>
            </details>
            <details className="simple-details">
              <summary>
                See the example queue <ChevronDown size={16} />
              </summary>
              {pending.length === 0 && active.length === 0 ? (
                <p>The kitchen starts with every station free.</p>
              ) : (
                <ul>
                  {pending.map((p) => (
                    <li key={p.id}>
                      {p.id} ·{" "}
                      {p.items
                        .map((i) => i.quantity + " × " + i.dish)
                        .join(", ")}
                    </li>
                  ))}
                  {active.map((t, i) => (
                    <li key={"active" + i}>
                      {t.station} · {t.remaining} minutes of cooking left
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Use the kitchen planner to enter individual pending tickets,
                active work or dish dependencies.
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => navigate("kitchen")}
              >
                Open kitchen planner <ArrowRight size={15} />
              </button>
            </details>
          </section>
          {error && (
            <div className="simple-alert" role="alert">
              {error}
            </div>
          )}
          {!available && (
            <div className="simple-alert">
              Train a model before estimating an order.{" "}
              <button
                type="button"
                className="btn"
                onClick={() => navigate("training")}
              >
                Open model training
              </button>
            </div>
          )}
          <button
            className="simple-calculate"
            disabled={busy || !available || !fixture}
          >
            <Clock3 size={19} />
            {busy ? "Calculating your pickup time…" : "Estimate pickup time"}
            {busy ? (
              <LoaderCircle className="simple-spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
          </button>
          <p className="simple-footnote">
            This workspace uses simulated training data and example queues. Your
            connected app can send its actual order and kitchen state.
          </p>
        </form>
        <aside className="simple-result-column">
          <section
            className={"simple-result panel " + (result ? "has-result" : "")}
            aria-live="polite"
          >
            {result ? (
              <>
                <span className="simple-result-icon">
                  <Check size={25} />
                </span>
                <h2 ref={resultHeading} tabIndex="-1">
                  Your order estimate
                </h2>
                <div className="simple-minutes">
                  {result.estimated_ready_in_minutes}
                  <span>minutes</span>
                </div>
                <p>Estimated time until every dish is ready for pickup.</p>
                <small className="simple-rounding">
                  Rounded up to the next whole minute.
                </small>
                {result.warnings?.slice(1).map((warning, index) => (
                  <p className="simple-range-warning" key={index}>
                    {warning}
                  </p>
                ))}
                <div className="simple-result-detail">
                  <span>Before the first dish starts</span>
                  <strong>{num(result.waiting_minutes)} min</strong>
                </div>
                <div className="simple-result-detail">
                  <span>First start to all dishes done</span>
                  <strong>
                    {num(result.readiness_minutes - result.waiting_minutes)} min
                  </strong>
                </div>
                <div className="simple-result-tip">
                  <Utensils size={17} />
                  <span>
                    Dishes can cook at the same time when a station and a cook
                    are available.
                  </span>
                </div>
                {target.length > 0 && (
                  <div className="simple-finish-list">
                    <h3>When each dish finishes</h3>
                    {target.map((t) => (
                      <div key={t.id}>
                        <span>
                          {t.quantity} × {t.dish}
                        </span>
                        <b>{num(t.end)} min</b>
                      </div>
                    ))}
                  </div>
                )}
                <details className="simple-details">
                  <summary>
                    About this estimate <ChevronDown size={16} />
                  </summary>
                  <p>
                    Uses {state.names[result.model.id] || result.model.id},
                    selected by its validation accuracy.
                  </p>
                  <p>Dataset {result.model.dataset_version}</p>
                  {result.warnings?.map((warning, i) => (
                    <p key={i}>{warning}</p>
                  ))}
                </details>
              </>
            ) : (
              <>
                <div className="simple-result-icon">
                  <Clock3 size={29} />
                </div>
                <h2>Your pickup estimate</h2>
                <p>
                  Add your dishes and choose the kitchen conditions, then select{" "}
                  <b>Estimate pickup time</b>.
                </p>
                <div className="simple-how">
                  <span>
                    <Check size={15} /> Includes the queue ahead
                  </span>
                  <span>
                    <Check size={15} /> Checks cooks and equipment
                  </span>
                  <span>
                    <Check size={15} /> Waits for the last dish to finish
                  </span>
                </div>
              </>
            )}
          </section>
          <button
            className="simple-connect panel"
            onClick={() => navigate("integration")}
          >
            <span>
              <b>Use this in your React app</b>
              <small>Send an order. Get a pickup estimate.</small>
            </span>
            <ArrowRight size={18} />
          </button>
        </aside>
      </div>
    </div>
  );
}
