import React, { useState } from "react";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  Code2,
  Copy,
  PlugZap,
} from "lucide-react";
import "./simple.css";

const example = `import { useEffect, useRef, useState } from "react";
import { estimateOrder } from "./estimateClient";

export function PickupEstimate({ order, kitchen }) {
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);

  // Cancel and clear an estimate when its inputs change.
  useEffect(() => {
    setEstimate(null);
    setError("");
    setBusy(false);
    return () => pending.current?.abort();
  }, [order, kitchen]);

  async function calculate() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setEstimate(null);
    try {
      const result = await estimateOrder({
        order_id: order.id,
        items: order.items,
        kitchen: kitchen.settings,
        pending_orders: kitchen.pendingOrders,
        active_tasks: kitchen.activeTasks,
        model: "recommended"
      }, { signal: controller.signal });
      if (!controller.signal.aborted) setEstimate(result);
    } catch (error) {
      if (error.name !== "AbortError") setError(error.message);
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  }

  return (
    <section aria-live="polite">
      <button disabled={busy} onClick={calculate}>
        {busy ? "Calculating…" : "Estimate pickup time"}
      </button>
      {error && <p role="alert">{error}</p>}
      {estimate && (
        <>
          <p>{estimate.message}</p>
          {estimate.warnings.map((text, i) => <p key={i}>{text}</p>)}
        </>
      )}
    </section>
  );
}`;
const body = {
  order_id: "ORDER-1042",
  items: [
    { id: "burger", dish: "Burger", quantity: 2 },
    { id: "coffee", dish: "Coffee", quantity: 1 },
  ],
  kitchen: {
    staff: 3,
    capacities: { Grill: 1, Oven: 1, Prep: 1, Beverage: 1 },
    workload: 50,
    period: "Lunch",
    day: "Tuesday",
  },
  pending_orders: [],
  active_tasks: [],
  model: "recommended",
  include_schedule: true,
};
function CopyBlock({ label, text }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError("");
    } catch {
      setError("Select the code below and copy it with your keyboard.");
    }
  }
  return (
    <div className="integration-code">
      <div>
        <strong>{label}</strong>
        <button className="btn" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex="0">
        <code>{text}</code>
      </pre>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
export default function IntegrationGuide() {
  return (
    <div className="simple-page integration-page">
      <header className="page-title">
        <span className="simple-tag">React integration</span>
        <h1>Connect your app</h1>
        <p>
          Your app supplies the order and current kitchen state. Mise returns
          its estimated pickup time.
        </p>
      </header>
      <div className="integration-flow panel">
        <span>
          <Code2 size={22} />
          <b>Your React app</b>
          <small>Order + kitchen snapshot</small>
        </span>
        <span className="integration-arrow">→</span>
        <span>
          <PlugZap size={22} />
          <b>Python estimation API</b>
          <small>Model prediction + scheduling</small>
        </span>
        <span className="integration-arrow">→</span>
        <span>
          <CheckCheck size={22} />
          <b>Pickup estimate</b>
          <small>Minutes + explanation</small>
        </span>
      </div>
      <div className="simple-note">
        This local workspace uses synthetic training data. Validate the model on
        your restaurant’s measured preparation times before presenting estimates
        as operationally reliable.
      </div>
      <section className="panel simple-section">
        <h2>One endpoint for a complete order</h2>
        <p className="integration-description">
          Call <code>POST /api/v1/estimate</code> through your app’s backend or
          a same-origin proxy. It uses the same algorithm as the order estimator
          here. The endpoint calculates a schedule from the snapshot you send.
          Your app owns the queue and updates it when orders change.
        </p>
        <div className="integration-actions">
          <a
            className="btn primary"
            href="/docs#/Application%20integration"
            target="_blank"
            rel="noreferrer"
          >
            Try the API <ArrowUpRight size={15} />
          </a>
          <a
            className="btn"
            href="/api/v1/menu"
            target="_blank"
            rel="noreferrer"
          >
            Supported dishes and defaults <ArrowUpRight size={15} />
          </a>
          <a className="btn" href="/integration/estimateClient.js" download>
            Download JavaScript client
          </a>
        </div>
        <CopyBlock
          label="Example request with an empty queue"
          text={JSON.stringify(body, null, 2)}
        />
        <div className="integration-fields">
          <h3>Send the kitchen state you already know</h3>
          <dl>
            <dt>items</dt>
            <dd>
              Dish name and quantity for every batch in the new order. Add task
              dependencies when a dish must follow another.
            </dd>
            <dt>pending_orders</dt>
            <dd>
              Each waiting ticket, its age in minutes and remaining dish
              batches.
            </dd>
            <dt>active_tasks</dt>
            <dd>
              Currently occupied stations and remaining cooking minutes. Each
              active task also reserves one cook.
            </dd>
            <dt>kitchen</dt>
            <dd>
              Cooks on duty, station slots, current kitchen utilization, day and
              service period.
            </dd>
          </dl>
        </div>
        <p className="integration-description">
          Send a consistent snapshot for each estimate. Recalculate after
          changes to the queue, staff or equipment. Exclude completed items and
          keep an active batch out of the pending list.
        </p>
      </section>
      <section className="panel simple-section">
        <h2>Add it to your React interface</h2>
        <p className="integration-description">
          Place the downloaded client next to your component. Keep order and
          kitchen objects stable between renders until their values change. The
          example handles loading, errors, cancellations and updates.
        </p>
        <details className="simple-details">
          <summary>React component example</summary>
          <CopyBlock label="PickupEstimate.jsx" text={example} />
        </details>
        <div className="simple-fields integration-response">
          <div>
            <h3>Show to the customer</h3>
            <p>
              <code>message</code> contains a rounded pickup estimate.{" "}
              <code>estimated_ready_in_minutes</code> gives the same
              whole-minute value.
            </p>
          </div>
          <div>
            <h3>Use for kitchen planning</h3>
            <p>
              <code>readiness_minutes</code> keeps the exact calculation.{" "}
              <code>waiting_minutes</code> is the time before the first new dish
              starts. Request the optional <code>schedule</code> for per-dish
              timing.
            </p>
          </div>
        </div>
      </section>
      <section className="panel simple-section">
        <h2>Run it alongside your app</h2>
        <p className="integration-description">
          Your React app should call a relative API URL routed to FastAPI. For
          local Vite development, add this proxy to your Vite configuration.
        </p>
        <CopyBlock
          label="vite.config.js proxy setting"
          text={`server: {
  proxy: {
    "/api": "http://127.0.0.1:8765"
  }
}`}
        />
        <p className="integration-description">
          For a hosted React app, run the Python service on your infrastructure
          and route <code>/api</code> to it. A hosted browser cannot use this
          computer’s localhost address as a shared service. Keep the
          model-training and dataset tools internal. The project’s{" "}
          <code>INTEGRATION.md</code> contains the full request contract and
          deployment notes.
        </p>
      </section>
    </div>
  );
}
