import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  Clock3,
  Coffee,
  CookingPot,
  Flame,
  ListOrdered,
  LoaderCircle,
  RefreshCw,
  Save,
  UsersRound,
  Utensils,
} from "lucide-react";
import { shopApi } from "./shopApi";
import "./shop-kitchen.css";

const STATIONS = {
  Grill: { label: "Grill", icon: Flame, dish: "Burgers" },
  Oven: { label: "Pizza oven", icon: CookingPot, dish: "Pizzas" },
  Prep: { label: "Preparation counter", icon: Utensils, dish: "Sandwiches" },
  Beverage: {
    label: "Drinks counter",
    icon: Coffee,
    dish: "Coffee and smoothies",
  },
};
const copySettings = (settings) => ({
  staff: settings.staff,
  workload: settings.workload,
  capacities: { ...settings.capacities },
});
function numeric(value) {
  return value === "" ? "" : Number(value);
}
function Field({ label, hint, value, min, max, step = 1, onChange }) {
  return (
    <label className="service-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        required
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(numeric(e.target.value))}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export default function ShopKitchen({ navigate }) {
  const [snapshot, setSnapshot] = useState(null),
    [draft, setDraft] = useState(null),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(""),
    [saveError, setSaveError] = useState(""),
    [saved, setSaved] = useState(false);
  const dirty = Boolean(
    snapshot &&
      draft &&
      JSON.stringify(copySettings(snapshot.settings)) !== JSON.stringify(draft),
  );
  async function refresh({ resetDraft = false } = {}) {
    setLoading(true);
    setLoadError("");
    try {
      const next = await shopApi("/kitchen");
      setSnapshot(next);
      if (resetDraft || !dirty) setDraft(copySettings(next.settings));
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setLoading(true);
    shopApi("/kitchen", { signal: controller.signal })
      .then((next) => {
        if (live) {
          setSnapshot(next);
          setDraft(copySettings(next.settings));
        }
      })
      .catch((err) => {
        if (live && err.name !== "AbortError") setLoadError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, []);
  function edit(patch) {
    setDraft((old) => ({ ...old, ...patch }));
    setSaved(false);
    setSaveError("");
  }
  async function save(e) {
    e.preventDefault();
    if (!snapshot || !dirty || saving) return;
    setSaving(true);
    setSaveError("");
    setSaved(false);
    const patch = {};
    if (draft.staff !== snapshot.settings.staff) patch.staff = draft.staff;
    if (draft.workload !== snapshot.settings.workload)
      patch.workload = draft.workload;
    const capacities = Object.fromEntries(
      Object.entries(draft.capacities).filter(
        ([key, value]) => value !== snapshot.settings.capacities[key],
      ),
    );
    if (Object.keys(capacities).length) patch.capacities = capacities;
    try {
      const next = await shopApi("/kitchen", { body: patch });
      setSnapshot(next);
      setDraft(copySettings(next.settings));
      setSaved(true);
    } catch (err) {
      setSaveError(
        err.status === 409
          ? "The change would conflict with a scheduled order. " + err.message
          : err.message,
      );
    } finally {
      setSaving(false);
    }
  }
  const time = (value) =>
    new Date(value).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="service-page">
      <header className="service-heading">
        <div>
          <span>Order operations</span>
          <h1>The kitchen behind every order.</h1>
          <p>
            Set the cooks and equipment available for customer orders. Checkout
            uses this saved setup and the existing queue.
          </p>
        </div>
        <button
          type="button"
          className="service-refresh"
          disabled={loading || saving}
          onClick={() => refresh()}
        >
          <RefreshCw size={16} className={loading ? "service-spin" : ""} />
          {loading ? "Refreshing…" : "Refresh status"}
        </button>
      </header>
      {loadError && (
        <div className="service-error" role="alert">
          {loadError}
          <button type="button" onClick={() => refresh()}>
            Try again
          </button>
        </div>
      )}
      {!snapshot ? (
        loading ? (
          <div className="service-loading" role="status">
            <LoaderCircle className="service-spin" size={22} />
            Opening the kitchen…
          </div>
        ) : null
      ) : (
        <>
          <section
            className="service-status"
            aria-label="Kitchen queue snapshot"
          >
            {[
              [ListOrdered, "Unfinished orders", snapshot.orders_ahead],
              [Flame, "Dishes cooking now", snapshot.active_tasks],
              [Clock3, "Dishes waiting to start", snapshot.waiting_tasks],
            ].map(([Icon, label, value]) => (
              <article key={label}>
                <span>
                  <Icon size={20} />
                </span>
                <div>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              </article>
            ))}
          </section>
          <div className="service-status-time">
            <Clock3 size={13} />
            <span>
              Status checked at {time(snapshot.now)} ({localZone})
              {snapshot.next_completion_at
                ? " · Next scheduled dish completion " +
                  time(snapshot.next_completion_at)
                : ""}
            </span>
          </div>
          <section
            className="service-stations"
            aria-label="Station availability"
          >
            {snapshot.stations.map((station) => {
              const config = STATIONS[station.station],
                Icon = config.icon;
              const free = Math.max(0, station.capacity - station.active);
              return (
                <article key={station.station}>
                  <div className="service-station-head">
                    <span>
                      <Icon size={22} />
                    </span>
                    <div>
                      <h2>{config.label}</h2>
                      <p>{config.dish}</p>
                    </div>
                  </div>
                  <strong
                    className={station.capacity === 0 ? "service-closed" : ""}
                  >
                    {station.capacity === 0
                      ? "Closed"
                      : free + " of " + station.capacity + " slots free"}
                  </strong>
                  <div className="service-slots" aria-hidden="true">
                    {Array.from({ length: station.capacity }, (_, i) => (
                      <i
                        key={i}
                        className={i < station.active ? "occupied" : ""}
                      />
                    ))}
                  </div>
                  <p className="service-station-count">
                    {station.active} cooking · {station.waiting} waiting
                  </p>
                </article>
              );
            })}
          </section>
          <div className="service-main">
            <form className="service-settings" onSubmit={save}>
              <header>
                <span>
                  <ChefHat size={23} />
                </span>
                <div>
                  <h2>Kitchen settings</h2>
                  <p>Save changes to use them for the next order.</p>
                </div>
              </header>
              <fieldset disabled={saving || loading}>
                <div className="service-field-grid">
                  <Field
                    label="Cooks on duty"
                    min={1}
                    max={25}
                    value={draft.staff}
                    onChange={(staff) => edit({ staff })}
                    hint="Each cooking task occupies one cook."
                  />
                  <Field
                    label="Kitchen workload (%)"
                    min={0}
                    max={100}
                    step="any"
                    value={draft.workload}
                    onChange={(workload) => edit({ workload })}
                    hint="Affects the model’s cooking time estimate."
                  />
                </div>
                <h3>Available cooking slots</h3>
                <p className="service-help">
                  One slot can prepare one dish batch at a time. Set a station
                  to 0 when it is closed.
                </p>
                <div className="service-field-grid">
                  {Object.entries(STATIONS).map(([station, config]) => (
                    <Field
                      key={station}
                      label={config.label + " slots"}
                      min={0}
                      max={16}
                      value={draft.capacities[station]}
                      onChange={(value) =>
                        edit({
                          capacities: { ...draft.capacities, [station]: value },
                        })
                      }
                    />
                  ))}
                </div>
                <p className="service-timezone">
                  Kitchen timezone <strong>{snapshot.settings.timezone}</strong>
                </p>
                {saveError && (
                  <div className="service-error" role="alert">
                    {saveError}
                  </div>
                )}
                {saved && (
                  <div className="service-saved" role="status">
                    <Check size={17} />
                    Kitchen settings saved for new orders.
                  </div>
                )}
                <div className="service-save-row">
                  <span>
                    {dirty
                      ? "You have unsaved changes."
                      : "Checkout is using these saved settings."}
                  </span>
                  <button type="submit" disabled={!dirty || saving || loading}>
                    {saving ? (
                      <LoaderCircle className="service-spin" size={17} />
                    ) : (
                      <Save size={17} />
                    )}{" "}
                    {saving ? "Saving…" : "Save kitchen settings"}
                  </button>
                </div>
              </fieldset>
            </form>
            <aside className="service-context">
              <span>
                <UsersRound size={24} />
              </span>
              <h2>One shared kitchen.</h2>
              <p>
                Every customer order joins the same saved schedule. Earlier
                orders reserve the cooks and stations they need.
              </p>
              <ul>
                <li>
                  Checkout calculates when the entire new order can be finished.
                </li>
                <li>Existing pickup estimates stay saved with their orders.</li>
                <li>
                  Setting changes must respect unfinished cooking reservations.
                </li>
              </ul>
              <p className="service-context-note">
                Queue status is a snapshot of scheduled work. Refresh to see
                which reservations are still in progress. Cooking durations come
                from a model trained on simulated data.
              </p>
              <button type="button" onClick={() => navigate("order")}>
                Try a customer order
                <ArrowRight size={16} />
              </button>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
