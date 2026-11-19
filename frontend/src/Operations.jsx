import React, { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCheck,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coffee,
  CookingPot,
  Flame,
  FlaskConical,
  GitBranch,
  Layers3,
  ListOrdered,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  UsersRound,
  UtensilsCrossed,
  Workflow,
} from "lucide-react";
import { api } from "./api";
import "./operations.css";
const ServiceReplay = React.lazy(() => import("./ServiceReplay"));

const DISHES = ["Burger", "Pizza", "Sandwich", "Coffee", "Smoothie"];
const STATIONS = ["Grill", "Oven", "Prep", "Beverage"];
const PERIODS = ["Morning", "Lunch", "Afternoon", "Dinner"];
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const stationIcons = {
  Grill: Flame,
  Oven: CookingPot,
  Prep: UtensilsCrossed,
  Beverage: Coffee,
};
const defaultInputs = {
  dish: "Burger",
  quantity: 2,
  complexity: 3,
  pending: 4,
  queue_work: 21,
  workload: 62,
  staff: 3,
  capacity: 2,
  period: "Lunch",
  day: "Friday",
  recent_avg: 9,
};
const number = (value, precision = 1) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US", {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      })
    : "—";
const signed = (value) => (value > 0 ? "+" : "") + number(value, 2);
const clone = (obj) => structuredClone(obj);
const taskId = () => "item-" + crypto.randomUUID().slice(0, 8);
const minute = (value) => number(value) + " min";
const readable = (value) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);
const errorText = (err) =>
  err?.message || "The request could not be completed.";

function Heading({ title, description, icon: Icon }) {
  return (
    <header className="ops-heading">
      <div>
        <h1 className="page-title">{title}</h1>
        <p>{description}</p>
      </div>
      <span className="ops-page-glyph" aria-hidden="true">
        <Icon size={26} strokeWidth={1.5} />
      </span>
    </header>
  );
}
function Field({
  label,
  value,
  choices,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  hint,
}) {
  return (
    <label className="ops-field">
      <span>{label}</span>
      {choices ? (
        <select
          disabled={disabled}
          aria-label={label}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        >
          {choices.map((c) =>
            typeof c === "string" ? (
              <option key={c}>{c}</option>
            ) : (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ),
          )}
        </select>
      ) : (
        <input
          required
          aria-label={label}
          disabled={disabled}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? "" : Number(event.target.value),
            )
          }
        />
      )}
      {hint && <small className="ops-field-hint">{hint}</small>}
    </label>
  );
}
function RunButton({ busy, children, disabled = false }) {
  const Icon = busy ? LoaderCircle : Play;
  return (
    <button
      type="submit"
      className="btn primary ops-run"
      disabled={busy || disabled}
    >
      <Icon size={16} className={busy ? "ops-spin" : ""} />
      {busy ? "Calculating…" : children}
    </button>
  );
}
function Notice({ children, kind = "info" }) {
  return (
    <div
      className={"ops-notice " + kind}
      role={kind === "error" ? "alert" : "status"}
    >
      <CircleAlert size={17} />
      <div>{children}</div>
    </div>
  );
}
function NoModels({ navigate }) {
  return (
    <div className="ops-empty">
      <FlaskConical />
      <h3>Set up the prediction engine</h3>
      <p>
        Train a model on the current dataset. The estimate tools will then be
        ready to use.
      </p>
      <button
        type="button"
        className="btn"
        onClick={() => navigate("training")}
      >
        Open training studio
      </button>
    </div>
  );
}
function SectionHead({ icon: Icon, title, detail, accessory }) {
  return (
    <div className="ops-section-head">
      <span className="ops-section-icon">
        <Icon size={20} />
      </span>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {accessory && <div className="ops-accessory">{accessory}</div>}
    </div>
  );
}
function EmptyResult({ icon: Icon, title, children }) {
  return (
    <div className="ops-empty">
      <span>
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ModelSelect({ state, model, setModel }) {
  const choices = Object.keys(state.results).map((key) => ({
    value: key,
    label:
      state.names[key] + (key === state.recommended ? " · Recommended" : ""),
  }));
  return (
    <Field
      label="Prediction model"
      value={model}
      choices={choices}
      onChange={setModel}
    />
  );
}
function Stats({ entries }) {
  return (
    <div className="ops-stats">
      {entries.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
function Journey({ resultLabel = "Get the estimate" }) {
  return (
    <ol className="ops-journey" aria-label="How to use this page">
      <li>
        <span>1</span>Choose the food
      </li>
      <li>
        <span>2</span>Set the kitchen
      </li>
      <li>
        <span>3</span>
        {resultLabel}
      </li>
    </ol>
  );
}
function Advanced({ title, hint, children }) {
  return (
    <details className="ops-advanced">
      <summary>
        <SlidersHorizontal size={16} />
        <span>
          {title}
          {hint && <small>{hint}</small>}
        </span>
        <ChevronDown size={16} />
      </summary>
      <div>{children}</div>
    </details>
  );
}
function showInvalidField(event) {
  let details = event.target.closest("details");
  while (details) {
    details.open = true;
    details = details.parentElement.closest("details");
  }
}
function Predict({ state, navigate }) {
  const keys = Object.keys(state.results);
  const [inputs, setInputs] = useState(defaultInputs),
    [chosen, setChosen] = useState(state.recommended),
    [compare, setCompare] = useState(false);
  const model = keys.includes(chosen) ? chosen : state.recommended || keys[0];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [snapshot, setSnapshot] = useState(null);
  const update = (key, value) => {
    setInputs((old) => ({ ...old, [key]: value }));
    setError("");
  };
  const signature = JSON.stringify([inputs, model, compare]);
  const changed = Boolean(snapshot && snapshot.signature !== signature);
  const out = changed ? null : snapshot?.data;
  async function predict(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSnapshot(null);
    try {
      const data = await api("/predict", { order: inputs, model, compare });
      setSnapshot({ data, signature, dish: inputs.dish });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  const predictions = out?.predictions || {};
  const contributions = Object.entries(out?.explanation?.values || {}).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  );
  const maxContribution = Math.max(
    ...contributions.map(([, v]) => Math.abs(v)),
    0.001,
  );
  return (
    <>
      <Heading
        title="Dish cooking time"
        description="Choose a dish, tell us how busy the kitchen is, and get a preparation estimate."
        icon={Timer}
      />
      <Journey />
      {!keys.length ? (
        <NoModels navigate={navigate} />
      ) : (
        <div className="ops-two ops-simple">
          <form
            className="panel ops-panel"
            onSubmit={predict}
            onInvalidCapture={showInvalidField}
          >
            <fieldset disabled={busy}>
              <SectionHead
                icon={UtensilsCrossed}
                title="What are you making?"
              />
              <div className="ops-field-grid">
                <Field
                  label="Dish"
                  choices={DISHES}
                  value={inputs.dish}
                  onChange={(v) => update("dish", v)}
                />
                <Field
                  label="How many?"
                  min={1}
                  max={100}
                  value={inputs.quantity}
                  onChange={(v) => update("quantity", v)}
                  hint="Items prepared together in one batch."
                />
              </div>
              <div className="ops-section-break">
                <SectionHead icon={ChefHat} title="How is the kitchen?" />
              </div>
              <div className="ops-field-grid">
                <Field
                  label="How busy is it?"
                  choices={[
                    { value: 20, label: "Quiet" },
                    { value: 60, label: "Steady" },
                    { value: 90, label: "Very busy" },
                    ...(![20, 60, 90].includes(inputs.workload)
                      ? [
                          {
                            value: inputs.workload,
                            label: "Custom · " + inputs.workload + "%",
                          },
                        ]
                      : []),
                  ]}
                  value={inputs.workload}
                  onChange={(v) => update("workload", Number(v))}
                />
                <Field
                  label="Cooks available"
                  min={1}
                  max={60}
                  value={inputs.staff}
                  onChange={(v) => update("staff", v)}
                  hint="People working in the kitchen."
                />
              </div>
              <Advanced
                title="Fine-tune the estimate"
                hint="Recipe details, queue and model settings"
              >
                <div className="ops-field-grid">
                  <Field
                    label="Recipe difficulty"
                    choices={[
                      { value: 1, label: "1 · Very easy" },
                      { value: 2, label: "2 · Easy" },
                      { value: 3, label: "3 · Moderate" },
                      { value: 4, label: "4 · Involved" },
                      { value: 5, label: "5 · Complex" },
                    ]}
                    value={inputs.complexity}
                    onChange={(v) => update("complexity", Number(v))}
                  />
                  <Field
                    label="Usual cooking time (min)"
                    min={0.01}
                    max={300}
                    step={0.01}
                    value={inputs.recent_avg}
                    onChange={(v) => update("recent_avg", v)}
                    hint="Average for similar dishes before this order."
                  />
                  <Field
                    label="Orders already waiting"
                    min={0}
                    max={300}
                    value={inputs.pending}
                    onChange={(v) => update("pending", v)}
                  />
                  <Field
                    label="Work already queued (min)"
                    min={0}
                    max={5000}
                    step={0.01}
                    value={inputs.queue_work}
                    onChange={(v) => update("queue_work", v)}
                    hint="Estimated cooking work in the queue."
                  />
                  <Field
                    label="Kitchen in use (%)"
                    min={0}
                    max={100}
                    value={inputs.workload}
                    onChange={(v) => update("workload", v)}
                    hint="0 is empty. 100 is fully occupied."
                  />
                  <Field
                    label="Matching cooking stations"
                    min={1}
                    max={30}
                    value={inputs.capacity}
                    onChange={(v) => update("capacity", v)}
                    hint="Stations able to prepare this dish at once."
                  />
                  <Field
                    label="Time of day"
                    choices={PERIODS}
                    value={inputs.period}
                    onChange={(v) => update("period", v)}
                  />
                  <Field
                    label="Day"
                    choices={DAYS}
                    value={inputs.day}
                    onChange={(v) => update("day", v)}
                  />
                  <ModelSelect
                    state={state}
                    model={model}
                    setModel={setChosen}
                  />
                </div>
                <label className="ops-checkbox ops-compare-checkbox">
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={(e) => setCompare(e.target.checked)}
                  />
                  Compare all trained models
                </label>
              </Advanced>
              {error && (
                <Notice kind="error">
                  <strong>We couldn't calculate this estimate.</strong>
                  <p>{error}</p>
                  <span>Review your entries and try again.</span>
                </Notice>
              )}
              <div className="ops-form-footer ops-primary-footer">
                <span>Calculated from your kitchen settings.</span>
                <RunButton busy={busy}>
                  {changed ? "Update cooking time" : "Estimate cooking time"}
                </RunButton>
              </div>
            </fieldset>
          </form>
          <section className="panel ops-panel ops-summary">
            <SectionHead icon={Timer} title="Your cooking estimate" />
            {changed && (
              <Notice>
                Your details changed. Select “Update cooking time” for a fresh
                estimate.
              </Notice>
            )}
            {!out ? (
              <EmptyResult
                icon={CookingPot}
                title={
                  busy
                    ? "Calculating your estimate…"
                    : "Your estimate will appear here"
                }
              >
                Start with the dish and quantity. You can keep the other
                settings or adjust them to match your kitchen.
              </EmptyResult>
            ) : (
              <>
                <div className="ops-answer">
                  <span>Allow approximately</span>
                  <strong>
                    {number(predictions[out.model])}
                    <small>min</small>
                  </strong>
                  <span>
                    to prepare {inputs.quantity} × {snapshot.dish}
                  </span>
                </div>
                <p className="ops-result-explainer">
                  This is the time spent preparing the dish. For the full pickup
                  estimate, add your other dishes and the waiting queue in the
                  kitchen planner.
                </p>
                <button
                  type="button"
                  className="btn ops-next-action"
                  onClick={() => navigate("kitchen")}
                >
                  Plan the full order
                  <ChevronRight size={16} />
                </button>
                {out.warnings?.length > 0 && (
                  <Notice>
                    <strong>
                      These settings are unusual for the training data.
                    </strong>
                    <p>The estimate may be less reliable for this situation.</p>
                    <ul>
                      {out.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </Notice>
                )}
                {Object.keys(predictions).length > 1 && (
                  <Advanced title="Compare model estimates">
                    <div className="ops-scroll">
                      <table className="ops-table">
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th>Cooking time</th>
                            <th>Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(predictions).map(([key, val]) => (
                            <tr key={key}>
                              <td>{state.names[key]}</td>
                              <td>{minute(val)}</td>
                              <td>
                                {signed(val - predictions[out.model])} min
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Advanced>
                )}
                {contributions.length > 0 && (
                  <Advanced
                    title="Why this estimate?"
                    hint="See which settings increased or reduced the time"
                  >
                    <p className="ops-muted">
                      The model starts from {minute(out.explanation.base)}.
                      Positive values add time and negative values reduce it.
                      Method used is {out.explanation.method}.
                    </p>
                    <div className="ops-contributions">
                      {contributions.map(([key, val]) => (
                        <div key={key}>
                          <span>{state.dataset.labels[key] || key}</span>
                          <span className="ops-diverging">
                            <i
                              style={{
                                width:
                                  (50 * Math.abs(val)) / maxContribution + "%",
                                left: val >= 0 ? "50%" : undefined,
                                right: val < 0 ? "50%" : undefined,
                                background: val >= 0 ? "#ba624d" : "#248378",
                              }}
                            />
                          </span>
                          <b>{signed(val)}</b>
                        </div>
                      ))}
                    </div>
                  </Advanced>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function useScenarios() {
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    api("/scenarios")
      .then((list) => {
        if (live) setItems(list);
      })
      .catch((err) => {
        if (live) setError(errorText(err));
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  return { items, error, retry: () => retry((n) => n + 1) };
}
function ScenarioLoading({ error, retry }) {
  return error ? (
    <Notice kind="error">
      {error}{" "}
      <button type="button" className="ops-link" onClick={retry}>
        Try again
      </button>
    </Notice>
  ) : (
    <div className="ops-loading" role="status">
      <LoaderCircle className="ops-spin" size={18} />
      Loading kitchen scenarios…
    </div>
  );
}
function ScenarioSelect({ items, id, onChange }) {
  return (
    <Field
      label="Example kitchen"
      value={id}
      choices={items.map(({ id, name }) => ({ value: id, label: name }))}
      onChange={onChange}
    />
  );
}
function TaskEditor({ items, onChange, groupName }) {
  const update = (at, patch) =>
    onChange(items.map((item, i) => (i === at ? { ...item, ...patch } : item)));
  const remove = (at) =>
    onChange(
      items
        .filter((_, i) => i !== at)
        .map((task) => ({
          ...task,
          depends_on: (task.depends_on || []).filter(
            (id) => id !== items[at].id,
          ),
        })),
    );
  return (
    <div className="ops-task-list">
      {items.map((task, i) => {
        const previous = items.filter(
          (entry, index) =>
            index < i || (task.depends_on || []).includes(entry.id),
        );
        return (
          <div className="ops-task" key={task.id}>
            <div className="ops-task-top">
              <span>Dish {i + 1}</span>
              {items.length > 1 && (
                <button
                  type="button"
                  className="ops-icon-btn"
                  onClick={() => remove(i)}
                  aria-label={"Remove " + groupName + " item " + (i + 1)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <div className="ops-task-fields">
              <Field
                label="Food"
                choices={DISHES}
                value={task.dish}
                onChange={(dish) => update(i, { dish })}
              />
              <Field
                label="How many?"
                min={1}
                max={30}
                value={task.quantity}
                onChange={(quantity) => update(i, { quantity })}
              />
            </div>
            <Advanced
              title="Recipe details"
              hint={
                "Difficulty " +
                task.complexity +
                " of 5" +
                ((task.depends_on || []).length
                  ? " · waits for another dish"
                  : "")
              }
            >
              <Field
                label="Recipe difficulty"
                choices={[
                  { value: 1, label: "1 · Very easy" },
                  { value: 2, label: "2 · Easy" },
                  { value: 3, label: "3 · Moderate" },
                  { value: 4, label: "4 · Involved" },
                  { value: 5, label: "5 · Complex" },
                ]}
                value={task.complexity}
                onChange={(v) => update(i, { complexity: Number(v) })}
              />
              {previous.length > 0 && (
                <div className="ops-dep">
                  <p>Start this dish after these dishes are finished.</p>
                  {previous.map((ref) => (
                    <label className="ops-checkbox" key={ref.id}>
                      <input
                        type="checkbox"
                        checked={(task.depends_on || []).includes(ref.id)}
                        onChange={(e) =>
                          update(i, {
                            depends_on: e.target.checked
                              ? [...(task.depends_on || []), ref.id]
                              : (task.depends_on || []).filter(
                                  (id) => id !== ref.id,
                                ),
                          })
                        }
                      />
                      {ref.dish} · dish {items.indexOf(ref) + 1}
                    </label>
                  ))}
                </div>
              )}
            </Advanced>
          </div>
        );
      })}
      <button
        type="button"
        className="ops-add"
        onClick={() =>
          onChange([
            ...items,
            {
              id: taskId(),
              dish: "Burger",
              quantity: 1,
              complexity: 2,
              depends_on: [],
            },
          ])
        }
      >
        <Plus size={15} />
        Add another dish
      </button>
    </div>
  );
}

function ScenarioEditor({ value: s, change }) {
  const update = (key, val) => change({ ...s, [key]: val });
  const alterPending = (i, patch) =>
    update(
      "pending",
      s.pending.map((order, at) => (i === at ? { ...order, ...patch } : order)),
    );
  const alterActive = (i, patch) =>
    update(
      "active",
      s.active.map((task, at) => (i === at ? { ...task, ...patch } : task)),
    );
  return (
    <div className="ops-editor ops-editor-simple">
      <SectionHead
        icon={UtensilsCrossed}
        title="Your order"
        detail="Add everything that needs to be ready together."
      />
      <TaskEditor
        groupName="new order"
        items={s.order}
        onChange={(items) => update("order", items)}
      />
      <div className="ops-section-break">
        <SectionHead icon={ChefHat} title="Your kitchen" />
      </div>
      <div className="ops-field-grid">
        <Field
          label="Cooks available"
          min={1}
          max={25}
          value={s.staff}
          onChange={(n) => update("staff", n)}
          hint="Include cooks already preparing food."
        />
        <Field
          label="How busy is it?"
          choices={[
            { value: 20, label: "Quiet" },
            { value: 60, label: "Steady" },
            { value: 90, label: "Very busy" },
            ...(![20, 60, 90].includes(s.workload)
              ? [{ value: s.workload, label: "Custom · " + s.workload + "%" }]
              : []),
          ]}
          value={s.workload}
          onChange={(v) => update("workload", Number(v))}
        />
      </div>
      <p className="ops-kitchen-context">
        {s.pending.length} orders waiting · {s.active.length} dishes already
        cooking
      </p>
      <Advanced
        title="Kitchen details"
        hint="Waiting orders, occupied stations and timing"
      >
        <details>
          <summary>
            <CookingPot size={17} />
            Stations and service time
            <ChevronDown size={16} />
          </summary>
          <div className="ops-field-grid">
            <Field
              label="Kitchen in use (%)"
              min={0}
              max={100}
              value={s.workload}
              onChange={(n) => update("workload", n)}
              hint="0 is empty. 100 is fully occupied."
            />
            <Field
              label="Time of day"
              choices={PERIODS}
              value={s.period}
              onChange={(n) => update("period", n)}
            />
            <Field
              label="Day"
              choices={DAYS}
              value={s.day}
              onChange={(n) => update("day", n)}
            />
            {Object.entries(s.capacities).map(([station, cap]) => (
              <Field
                key={station}
                label={station + " stations"}
                min={0}
                max={16}
                value={cap}
                onChange={(v) =>
                  update("capacities", { ...s.capacities, [station]: v })
                }
                hint="Dishes this station can handle at once."
              />
            ))}
          </div>
        </details>
        <details>
          <summary>
            <ListOrdered size={17} />
            Orders already waiting<small>{s.pending.length}</small>
            <ChevronDown size={16} />
          </summary>
          <div className="ops-editor-body">
            <p className="ops-muted">
              Earlier orders get the first available cook and matching station.
            </p>
            {s.pending.map((order, i) => (
              <div className="ops-queued" key={order.id}>
                <div className="ops-inline">
                  <h4>{order.id}</h4>
                  <button
                    type="button"
                    className="ops-icon-btn"
                    aria-label={"Remove " + order.id}
                    onClick={() =>
                      update(
                        "pending",
                        s.pending.filter((_, at) => at !== i),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <Field
                  label="Minutes since this order arrived"
                  min={0}
                  max={1440}
                  value={-order.accepted}
                  onChange={(n) =>
                    alterPending(i, { accepted: n === "" ? "" : -n })
                  }
                  hint="For an order placed five minutes ago, enter 5."
                />
                <TaskEditor
                  groupName={order.id}
                  items={order.items}
                  onChange={(items) => alterPending(i, { items })}
                />
              </div>
            ))}
            <button
              type="button"
              className="ops-add"
              onClick={() =>
                update("pending", [
                  ...s.pending,
                  {
                    id: "Queue-" + crypto.randomUUID().slice(0, 5),
                    accepted: -1,
                    items: [
                      {
                        id: taskId(),
                        dish: "Pizza",
                        quantity: 1,
                        complexity: 3,
                        depends_on: [],
                      },
                    ],
                  },
                ])
              }
            >
              <Plus size={15} />
              Add a waiting order
            </button>
          </div>
        </details>
        <details>
          <summary>
            <Flame size={17} />
            Food already cooking<small>{s.active.length}</small>
            <ChevronDown size={16} />
          </summary>
          <div className="ops-editor-body">
            <p className="ops-muted">
              Each dish holds one cook and one station until its remaining time
              is up.
            </p>
            {s.active.map((task, i) => (
              <div className="ops-active-row" key={i}>
                <Field
                  label="Station being used"
                  value={task.station}
                  choices={STATIONS}
                  onChange={(station) => alterActive(i, { station })}
                />
                <Field
                  label="Minutes left"
                  min={0.1}
                  max={1440}
                  step={0.1}
                  value={task.remaining}
                  onChange={(remaining) => alterActive(i, { remaining })}
                />
                <button
                  type="button"
                  className="ops-icon-btn"
                  aria-label={"Remove cooking task " + (i + 1)}
                  onClick={() =>
                    update(
                      "active",
                      s.active.filter((_, at) => at !== i),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ops-add"
              onClick={() =>
                update("active", [
                  ...s.active,
                  { station: "Grill", remaining: 4 },
                ])
              }
            >
              <Plus size={15} />
              Add food already cooking
            </button>
          </div>
        </details>
      </Advanced>
    </div>
  );
}

function ScheduleTrace({ trace }) {
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (step >= trace.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((n) => n + 1), 1800);
    return () => clearTimeout(timer);
  }, [playing, step, trace]);
  if (!trace.length) return null;
  const current = trace[step];
  function select(n) {
    setPlaying(false);
    setStep(n);
  }
  return (
    <section className="panel ops-panel">
      <SectionHead
        icon={Workflow}
        title="Execution trace"
        detail="Replay the decisions recorded by the scheduler."
      />
      <div className="ops-player">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!playing && step === trace.length - 1) setStep(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
          {playing ? "Pause" : "Play trace"}
        </button>
        <button
          type="button"
          className="ops-icon-btn"
          disabled={step === 0}
          aria-label="Previous step"
          onClick={() => select(step - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <strong>
          Step {step + 1} of {trace.length}
        </strong>
        <button
          type="button"
          className="ops-icon-btn"
          disabled={step === trace.length - 1}
          aria-label="Next step"
          onClick={() => select(step + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="ops-progress">
        {trace.map((r, i) => (
          <button
            type="button"
            key={i}
            title={r.title}
            aria-label={"Step " + (i + 1) + ", " + r.title}
            aria-current={i === step ? "step" : undefined}
            onClick={() => select(i)}
            className={i <= step ? "filled" : ""}
          />
        ))}
      </div>
      <div key={step} className="ops-step">
        <h3>{current.title}</h3>
        <p>{readable(current.operation)}</p>
        <div className="ops-io">
          <div>
            <h4>Inputs</h4>
            <pre>{readable(current.input)}</pre>
          </div>
          <div>
            <h4>Output</h4>
            <pre>{readable(current.output)}</pre>
          </div>
        </div>
      </div>
      <details className="ops-log">
        <summary>Inspect full calculation log</summary>
        <ol>
          {trace.map((row, i) => (
            <li key={i}>
              <strong>{row.title}</strong>
              <p>{readable(row.operation)}</p>
              <pre>{readable(row.input)}</pre>
              <pre>{readable(row.output)}</pre>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
function Timeline({ result }) {
  const [focus, setFocus] = useState(null);
  const tasks = result.tasks,
    end = Math.max(result.ready, ...tasks.map((x) => x.end), 1),
    isNew = (t) => t.order === "New order";
  const stations = STATIONS.filter((s) => tasks.some((t) => t.station === s));
  const shown = tasks.find(
    (t) => [t.order, t.id, t.station, t.slot].join("|") === focus,
  );
  const groupKey = (t) => [t.order, t.id, t.station, t.slot].join("|");
  return (
    <section className="panel ops-panel">
      <SectionHead
        icon={Layers3}
        title="How your order fits into the kitchen"
        detail="The clock starts when your order arrives. Overlapping bars show dishes cooking at the same time."
      />
      <ol className="ops-milestones" aria-label="New order milestones">
        {[
          ["Order placed", "0.0 min"],
          ["Queue waiting", minute(result.wait)],
          ["First preparation starts", minute(result.wait)],
          ["All dishes complete", minute(result.ready)],
          ["Ready for pickup", minute(result.ready)],
        ].map(([title, value]) => (
          <li key={title}>
            <span>{title}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ol>
      <div className="ops-legend">
        <span>
          <i className="ops-new" />
          New order
        </span>
        <span>
          <i className="ops-pending" />
          Pending order
        </span>
        <span>
          <i className="ops-in-flight" />
          In progress
        </span>
      </div>
      <div className="ops-gantt-wrap">
        <div className="ops-gantt">
          <div className="ops-axis">
            <span>Station / slot</span>
            <div>
              {[0, 1, 2, 3, 4].map((i) => (
                <small key={i} style={{ left: 25 * i + "%" }}>
                  {number((end * i) / 4, 1)}
                </small>
              ))}
            </div>
          </div>
          {stations.flatMap((s) => {
            const Icon = stationIcons[s] || CookingPot;
            return [
              ...new Set(
                tasks.filter((t) => t.station === s).map((t) => t.slot),
              ),
            ]
              .sort((a, b) => a - b)
              .map((slot) => {
                const lane = tasks.filter(
                  (t) => t.station === s && t.slot === slot,
                );
                return (
                  <div className="ops-lane" key={s + slot}>
                    <span>
                      <Icon size={14} />
                      {s} {slot}
                    </span>
                    <div>
                      {lane.map((t) => (
                        <button
                          type="button"
                          key={groupKey(t)}
                          title={
                            (t.dish || t.station) +
                            " · " +
                            minute(t.start) +
                            " to " +
                            minute(t.end)
                          }
                          aria-label={
                            (t.dish || t.station) +
                            ", " +
                            s +
                            ", " +
                            minute(t.start) +
                            " to " +
                            minute(t.end)
                          }
                          className={
                            (t.active
                              ? "ops-in-flight"
                              : isNew(t)
                                ? "ops-new"
                                : "ops-pending") +
                            (focus === groupKey(t) ? " focused" : "")
                          }
                          onClick={() => setFocus(groupKey(t))}
                          style={{
                            left: (100 * t.start) / end + "%",
                            width: (100 * (t.end - t.start)) / end + "%",
                          }}
                        >
                          <span>{t.dish || "Active"}</span>
                        </button>
                      ))}
                      <i
                        className="ops-ready-line"
                        title={"Ready at " + minute(result.ready)}
                        style={{ left: (100 * result.ready) / end + "%" }}
                      />
                    </div>
                  </div>
                );
              });
          })}
          <div className="ops-end-caption">
            <CheckCheck size={15} />
            Ready for pickup at {minute(result.ready)}
          </div>
        </div>
      </div>
      {shown && (
        <div className="ops-selection">
          <strong>
            {shown.dish || "In progress"} · {shown.order}
          </strong>
          <p>
            {shown.station} {shown.slot} · starts {minute(shown.start)} ·
            finishes {minute(shown.end)} · duration {minute(shown.duration)}.
          </p>
        </div>
      )}
      <details className="ops-log">
        <summary>Inspect all task times and allocations</summary>
        <div className="ops-scroll">
          <table className="ops-table">
            <thead>
              <tr>
                {[
                  "Order / task",
                  "Station",
                  "Worker",
                  "Accepted",
                  "Wait",
                  "Start",
                  "Duration",
                  "Finish",
                  "Dependencies",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={groupKey(t)}>
                  <td>
                    <b>{t.dish || "In progress"}</b>
                    <br />
                    {t.order} · {t.id}
                  </td>
                  <td>
                    {t.station} {t.slot}
                  </td>
                  <td>{t.staff ?? "—"}</td>
                  <td>{minute(t.accepted)}</td>
                  <td>{minute(t.wait)}</td>
                  <td>{minute(t.start)}</td>
                  <td>{minute(t.duration)}</td>
                  <td>{minute(t.end)}</td>
                  <td>{t.depends_on?.join(", ") || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
function KitchenWork({ state, navigate, items }) {
  const [s, setS] = useState(() => {
    const id = sessionStorage.getItem("mise.scenario");
    return clone(
      items.find((v) => v.id === id) ||
        items.find((v) => v.id === "normal") ||
        items[0],
    );
  });
  useEffect(() => {
    sessionStorage.removeItem("mise.scenario");
  }, []);
  const keys = Object.keys(state.results);
  const [chosen, setChosen] = useState(state.recommended),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [snapshot, setSnapshot] = useState(null);
  const model = keys.includes(chosen) ? chosen : state.recommended || keys[0];
  const signature = JSON.stringify([model, s]);
  const changed = Boolean(snapshot && signature !== snapshot.signature);
  const result = changed ? null : snapshot?.result;
  async function simulate(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    setSnapshot(null);
    try {
      const result = await api("/simulate", { scenario: s, model });
      setSnapshot({ result, signature });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  const lastDish = result?.tasks.find(
    (t) => t.order === "New order" && t.id === result.critical,
  );
  if (!keys.length) return <NoModels navigate={navigate} />;
  return (
    <>
      <Journey resultLabel="See pickup time" />
      <div className="ops-two ops-kitchen ops-simple">
        <form
          onSubmit={simulate}
          onInvalidCapture={showInvalidField}
          className="panel ops-panel"
        >
          <fieldset disabled={busy}>
            <details className="ops-advanced ops-example">
              <summary>
                <Layers3 size={16} />
                <span>
                  Start with an example<small>{s.name}</small>
                </span>
                <ChevronDown size={16} />
              </summary>
              <div>
                <ScenarioSelect
                  items={items}
                  id={s.id}
                  onChange={(id) => {
                    setS(clone(items.find((x) => x.id === id)));
                    setError("");
                  }}
                />
                <p className="ops-scenario-note">{s.description}</p>
                <p className="ops-muted">
                  Choosing an example replaces your order and kitchen settings.
                </p>
              </div>
            </details>
            <ScenarioEditor
              value={s}
              change={(value) => {
                setS(value);
                setError("");
              }}
            />
            <Advanced
              title="Prediction model"
              hint={state.names[model] + " selected"}
            >
              <p className="ops-muted ops-model-hint">
                The recommended model has the smallest average error on the
                validation dishes. You can try another trained model here.
              </p>
              <ModelSelect state={state} model={model} setModel={setChosen} />
            </Advanced>
            {error && (
              <Notice kind="error">
                <strong>We couldn't plan this order.</strong>
                <p>{error}</p>
                <span>Review the kitchen details and try again.</span>
              </Notice>
            )}
            <div className="ops-form-footer">
              <button
                type="button"
                className="ops-link"
                onClick={() => {
                  setS(clone(items.find((item) => item.id === s.id)));
                  setError("");
                }}
              >
                <RotateCcw size={14} />
                Reset example
              </button>
              <RunButton busy={busy}>
                {changed ? "Update pickup time" : "Estimate pickup time"}
              </RunButton>
            </div>
          </fieldset>
        </form>
        <div className="ops-stack">
          <section className="panel ops-panel ops-summary">
            <SectionHead icon={Clock3} title="When will it be ready?" />
            {changed && (
              <Notice>
                Your order or kitchen changed. Select “Update pickup time” to
                calculate a new schedule.
              </Notice>
            )}
            {!result ? (
              <EmptyResult
                icon={ChefHat}
                title={
                  busy
                    ? "Planning your order…"
                    : "Your pickup estimate goes here"
                }
              >
                Add the food, check the kitchen, then select “Estimate pickup
                time”. Every dish is included in the final time.
              </EmptyResult>
            ) : (
              <>
                <div className="ops-answer">
                  <span>Your complete order should be ready in</span>
                  <strong>
                    {number(result.ready)}
                    <small>min</small>
                  </strong>
                  <span>
                    All{" "}
                    {result.tasks.filter((t) => t.order === "New order").length}{" "}
                    dish batches included
                  </span>
                </div>
                <div className="ops-time-story">
                  <div>
                    <Clock3 size={19} />
                    <div>
                      <b>
                        {result.wait > 0
                          ? minute(result.wait) + " before cooking begins"
                          : "Cooking can start straight away"}
                      </b>
                      <p>
                        {result.wait > 0
                          ? "A cook and a matching station need to become available."
                          : "The kitchen can begin at least one of your dishes now."}
                      </p>
                    </div>
                  </div>
                  <div>
                    <CookingPot size={19} />
                    <div>
                      <b>
                        {minute(result.ready - result.wait)} from first start to
                        pickup
                      </b>
                      <p>
                        Dishes can cook together when stations and staff are
                        available. Your order is ready when the last dish
                        finishes.
                      </p>
                    </div>
                  </div>
                </div>
                {lastDish && (
                  <div className="ops-last-item">
                    <CheckCheck size={18} />
                    <span>
                      <b>{lastDish.dish}</b> is the final dish to finish.
                    </span>
                  </div>
                )}
                <Advanced
                  title="How this was calculated"
                  hint="Model, queue position and scheduling rules"
                >
                  <Stats
                    entries={[
                      ["Place in queue", result.position],
                      ["Combined dish cooking work", minute(result.prep)],
                    ]}
                  />
                  <p className="ops-muted ops-model-hint">
                    The combined cooking work totals all batches. Overlapping
                    work helps the complete order finish sooner.
                  </p>
                  <h3 className="ops-sub">Model used</h3>
                  <p className="ops-muted">{state.names[result.model]}</p>
                  <h3 className="ops-sub">Scheduling rules</h3>
                  <p className="ops-muted">{readable(result.policy)}</p>
                </Advanced>
              </>
            )}
          </section>
          {result && (
            <React.Suspense
              fallback={
                <div className="ops-loading">Loading kitchen replay…</div>
              }
            >
              <ServiceReplay result={result} />
            </React.Suspense>
          )}
        </div>
      </div>
      {result && (
        <div className="ops-stack ops-output" key={snapshot.signature}>
          <Timeline result={result} />
          <Advanced
            title="See every calculation step"
            hint="Replay the model inputs and scheduling decisions"
          >
            <ScheduleTrace trace={result.trace} />
          </Advanced>
        </div>
      )}
    </>
  );
}

function Kitchen({ state, navigate }) {
  const { items, error, retry } = useScenarios();
  return (
    <>
      <Heading
        title="Plan a complete order"
        description="Find out when every dish will be ready, with the waiting queue and available cooks included."
        icon={ChefHat}
      />
      {items?.length ? (
        <KitchenWork items={items} state={state} navigate={navigate} />
      ) : (
        <ScenarioLoading
          error={error || (items ? "No scenario presets are available." : "")}
          retry={retry}
        />
      )}
    </>
  );
}
const presetIcons = [
  UtensilsCrossed,
  ChefHat,
  Flame,
  Layers3,
  GitBranch,
  CookingPot,
  Sparkles,
  UsersRound,
];
function ScenarioCompare({ state, navigate, items }) {
  const [id, setId] = useState(items[0].id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [runs, setRuns] = useState(null),
    [selected, setSelected] = useState("");
  const preset = items.find((x) => x.id === id) || items[0];
  const keys = Object.keys(state.results);
  async function compare(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setRuns(null);
    try {
      const results = await Promise.all(
        keys.map((model) => api("/simulate", { scenario: preset, model })),
      );
      setRuns(results);
      setSelected(state.recommended || keys[0]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  const openKitchen = () => {
    sessionStorage.setItem("mise.scenario", preset.id);
    navigate("kitchen");
  };
  const selectedRun = runs?.find((row) => row.model === selected);
  return (
    <>
      <div
        className="ops-presets"
        role="group"
        aria-label="Choose a demonstration scenario"
      >
        {items.map((scenario, i) => {
          const Icon = presetIcons[i % presetIcons.length];
          return (
            <button
              type="button"
              key={scenario.id}
              disabled={busy}
              aria-pressed={id === scenario.id}
              className={"ops-preset " + (id === scenario.id ? "selected" : "")}
              onClick={() => {
                setId(scenario.id);
                setRuns(null);
                setError("");
              }}
            >
              <span className="ops-preset-symbol">
                <Icon size={18} />
              </span>
              <strong>{scenario.name}</strong>
            </button>
          );
        })}
      </div>
      <div className="ops-two">
        <section className="panel ops-panel">
          <SectionHead
            icon={ChefHat}
            title={preset.name}
            detail={preset.description}
          />
          <Stats
            entries={[
              ["Service", preset.period],
              ["Pending orders", preset.pending.length],
              ["Available staff", preset.staff],
              ["Utilization", preset.workload + "%"],
            ]}
          />
          <h3 className="ops-sub">Incoming order</h3>
          <div className="ops-order-list">
            {preset.order.map((t) => (
              <div key={t.id}>
                <span className="ops-quantity">{t.quantity}×</span>
                <b>{t.dish}</b>
                <small>Complexity {t.complexity} / 5</small>
              </div>
            ))}
          </div>
          <h3 className="ops-sub">Station capacities</h3>
          <div className="ops-chips">
            {Object.entries(preset.capacities).map(([s, n]) => (
              <span key={s}>
                {s} <b>{n}</b>
              </span>
            ))}
          </div>
          <div className="ops-form-footer">
            <button className="btn" type="button" onClick={openKitchen}>
              Customize in kitchen <ChevronRight size={15} />
            </button>
          </div>
        </section>
        <section className="panel ops-panel">
          <SectionHead
            icon={BarChart3}
            title="Compare readiness"
            detail="Run the same service conditions through each trained model."
          />
          {!keys.length ? (
            <NoModels navigate={navigate} />
          ) : (
            <form className="ops-compare-action" onSubmit={compare}>
              <RunButton busy={busy}>
                Compare {keys.length} {keys.length === 1 ? "model" : "models"}
              </RunButton>
            </form>
          )}
          {error && <Notice kind="error">{error}</Notice>}
          {!runs ? (
            <EmptyResult icon={BarChart3} title="No comparison yet">
              Each model predicts the dish durations. The scheduler then
              computes when every item will be ready.
            </EmptyResult>
          ) : (
            <>
              <div className="ops-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Prep work</th>
                      <th>First wait</th>
                      <th>Ready</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.model}>
                        <td>{state.names[r.model]}</td>
                        <td>{minute(r.prep)}</td>
                        <td>{minute(r.wait)}</td>
                        <td>
                          <b>{minute(r.ready)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="ops-log">
                <summary>Compare individual dish predictions</summary>
                <div className="ops-scroll">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        {preset.order.map((item) => (
                          <th key={item.id}>
                            {item.quantity} × {item.dish}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.model}>
                          <td>{state.names[run.model]}</td>
                          {preset.order.map((item) => (
                            <td key={item.id}>
                              {minute(
                                run.tasks.find(
                                  (task) =>
                                    task.order === "New order" &&
                                    task.id === item.id,
                                )?.predicted,
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <Field
                label="Inspect model schedule"
                choices={runs.map((r) => ({
                  value: r.model,
                  label: state.names[r.model],
                }))}
                value={selected}
                onChange={setSelected}
              />
            </>
          )}
        </section>
      </div>
      {selectedRun && (
        <div className="ops-output">
          <Timeline key={selectedRun.model} result={selectedRun} />
        </div>
      )}
    </>
  );
}
function Scenarios({ state, navigate }) {
  const { items, error, retry } = useScenarios();
  return (
    <>
      <Heading
        title="Scenario library"
        description="Explore eight designed kitchen situations and compare order readiness across models."
        icon={Layers3}
      />
      {items?.length ? (
        <ScenarioCompare state={state} navigate={navigate} items={items} />
      ) : (
        <ScenarioLoading
          error={error || (items ? "No scenario presets are available." : "")}
          retry={retry}
        />
      )}
    </>
  );
}
export default function Operations({ page, state, navigate }) {
  const Screen =
    { predict: Predict, kitchen: Kitchen, scenarios: Scenarios }[page] ||
    Kitchen;
  const modelVersion = Object.values(state.results)
    .map((r) => r.trained)
    .join("|");
  return (
    <div className="operations">
      <Screen
        key={page + state.dataset.version + modelVersion}
        state={state}
        navigate={navigate}
      />
    </div>
  );
}
