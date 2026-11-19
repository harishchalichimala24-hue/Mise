import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  Suspense,
  lazy,
} from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Clock3,
  PlugZap,
  ShoppingBag,
  BrainCircuit,
  ChartColumnIncreasing,
  ChartNoAxesColumn,
  CheckCheck,
  ChevronRight,
  CircleDot,
  Database,
  Flame,
  GitBranch,
  Grid2X2,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  Workflow,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "./api";
import "./simple.css";
const Lab = lazy(() => import("./Lab"));
const Operations = lazy(() => import("./Operations"));
const QuickEstimate = lazy(() => import("./QuickEstimate"));
const IntegrationGuide = lazy(() => import("./IntegrationGuide"));
const CustomerShop = lazy(() => import("./CustomerShop"));
const ShopKitchen = lazy(() => import("./ShopKitchen"));
const groups = [
  ["Customer demo", [["order", "Order food", ShoppingBag]]],
  [
    "Kitchen",
    [
      ["service", "Order kitchen", Utensils],
      ["estimate", "Estimate pickup time", Clock3],
      ["kitchen", "Kitchen planner", Utensils],
      ["scenarios", "Example services", Layers3],
      ["predict", "Dish cooking time", SlidersHorizontal],
    ],
  ],
  ["For your app", [["integration", "Connect your app", PlugZap]]],
  [
    "Model lab",
    [
      ["overview", "Model overview", LayoutDashboard],
      ["dataset", "Explore training data", Database],
      ["pipeline", "How data is prepared", GitBranch],
      ["training", "Train the models", BrainCircuit],
      ["evaluation", "Compare accuracy", ChartNoAxesColumn],
      ["explain", "Understand predictions", Sparkles],
    ],
  ],
];
const nav = groups.flatMap(([, items]) => items);
const fmt = (v, n = 2) =>
  v == null
    ? "—"
    : v.toLocaleString("en-US", {
        minimumFractionDigits: n,
        maximumFractionDigits: n,
      });
const colors = {
  xgb: "#207763",
  linear: "#66a78f",
  svr: "#b48ca6",
  forest: "#87a8c8",
  knn: "#dc9b6d",
};
const short = {
  linear: "Linear Regression",
  knn: "KNN",
  svr: "SVR–RBF",
  forest: "Random Forest",
  xgb: "XGBoost",
};
function getPage() {
  const k = location.hash.slice(1);
  return nav.some(([id]) => id === k) ? k : "estimate";
}
function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const last = document.activeElement;
    const d = ref.current;
    d.showModal();
    return () => {
      d.close();
      last?.focus();
    };
  }, []);
  return (
    <dialog
      className="mise-dialog"
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-inner">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button
            className="iconbtn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function Hero({ navigate }) {
  const ref = useRef(null),
    reduce = useReducedMotion();
  function tilt(e) {
    if (reduce || e.pointerType === "touch") return;
    const box = e.currentTarget.getBoundingClientRect();
    ref.current.style.setProperty(
      "--rx",
      ((e.clientY - box.top) / box.height - 0.5) * -7 + "deg",
    );
    ref.current.style.setProperty(
      "--ry",
      ((e.clientX - box.left) / box.width - 0.5) * 9 + "deg",
    );
  }
  return (
    <section
      className="hero"
      onPointerMove={tilt}
      onPointerLeave={() => {
        ref.current.style.setProperty("--rx", "0deg");
        ref.current.style.setProperty("--ry", "0deg");
      }}
      ref={ref}
    >
      <div className="hero-grid" />
      <div className="hero-content">
        <div className="hero-chip">
          <span />
          Simulation engine
        </div>
        <h2>Inside the kitchen.</h2>
        <p>
          Turn dish-level predictions into a working kitchen schedule. See when
          every order is ready.
        </p>
        <button className="hero-button" onClick={() => navigate("kitchen")}>
          Open simulator <ArrowRight size={15} />
        </button>
      </div>
      <div className="hero-scene">
        <motion.img
          initial={reduce ? false : { opacity: 0, y: 9 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="diorama"
          src="/art/kitchen-diorama.webp"
          alt="Isometric miniature kitchen with a pizza oven, grill, and preparation counters"
        />
      </div>
    </section>
  );
}
function Kpi({ icon: Icon, name, value, unit, note, tone }) {
  return (
    <div className={"kpi " + tone}>
      <div className="kpi-label">
        <span className="kpi-icon">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <span>{name}</span>
      </div>
      <div className="kpi-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="kpi-note">{note}</div>
    </div>
  );
}
const metricInfo = {
  mae: ["MAE", "min", "Lower is better"],
  mse: ["MSE", "min²", "Lower is better"],
  rmse: ["RMSE", "min", "Lower is better"],
  r2: ["R²", "", "Higher is better"],
};
function Home({ state, navigate }) {
  const [metric, setMetric] = useState("mae"),
    [scenarios, setScenarios] = useState([]),
    [scenarioError, setScenarioError] = useState(false);
  useEffect(() => {
    api("/scenarios")
      .then(setScenarios)
      .catch(() => setScenarioError(true));
  }, []);
  const result = Object.values(state.results),
    best = state.results[state.recommended];
  const rank = (m) =>
    [...result].sort((a, b) =>
      m === "r2" ? b.test[m] - a.test[m] : a.test[m] - b.test[m],
    );
  const ordered = rank(metric);
  const scores = ordered.map((r) => r.test[metric]);
  const low = Math.min(0, ...scores);
  const scale = Math.max(0.0001, Math.max(0, ...scores) - low);
  const picks = [
    ["normal", Utensils, "green"],
    ["rush", Flame, "peach"],
    ["parallel", Layers3, "lilac"],
  ];
  function openScenario(id) {
    sessionStorage.setItem("mise.scenario", id);
    navigate("kitchen");
  }
  return (
    <div className="dashboard">
      <div className="home-title">
        <div>
          <h1>Kitchen overview</h1>
          <p>Model performance and service planning at a glance.</p>
        </div>
        <span className="source-chip">
          <span />
          Synthetic workspace
        </span>
      </div>
      <Hero navigate={navigate} />
      <div className="section-heading">
        <h2>Workspace snapshot</h2>
        <span>
          <CircleDot size={13} /> Current dataset
        </span>
      </div>
      <div className="kpis">
        <Kpi
          icon={Database}
          name="Dataset size"
          value={fmt(state.dataset.rows, 0)}
          note={fmt(state.dataset.splits.train, 0) + " training records"}
          tone="mint"
        />
        <Kpi
          icon={Boxes}
          name="Trained models"
          value={result.length}
          unit="/ 5"
          note={state.job.running ? state.job.message : "Regression models"}
          tone="purple"
        />
        <Kpi
          icon={Activity}
          name="Best test MAE"
          value={fmt(rank("mae")[0]?.test.mae)}
          unit="min"
          note={
            rank("mae")[0] ? short[rank("mae")[0].model] : "Awaiting training"
          }
          tone="peach"
        />
        <Kpi
          icon={ChartColumnIncreasing}
          name="Best test R²"
          value={fmt(rank("r2")[0]?.test.r2, 3)}
          note={fmt(state.dataset.splits.test, 0) + " held-out records"}
          tone="blue"
        />
      </div>
      <div className="home-panels">
        <section className="panel perf-panel">
          <div className="panel-heading">
            <div>
              <h2>Model performance</h2>
              <p>Held-out test results across trained models</p>
            </div>
            <select
              aria-label="Comparison metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {Object.keys(metricInfo).map((k) => (
                <option key={k} value={k}>
                  {metricInfo[k][0]}
                </option>
              ))}
            </select>
          </div>
          <div className="bar-chart">
            {ordered.map((r) => (
              <div className="metric-row" key={r.model}>
                <span>{short[r.model]}</span>
                <div className="bar-canvas">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: (Math.abs(r.test[metric]) / scale) * 100 + "%",
                    }}
                    style={{
                      background: colors[r.model],
                      marginLeft:
                        ((Math.min(0, r.test[metric]) - low) / scale) * 100 +
                        "%",
                    }}
                  />
                </div>
                <strong>{fmt(r.test[metric], metric === "r2" ? 3 : 2)}</strong>
              </div>
            ))}
            {!ordered.length && (
              <p>Train a model to see its measured test scores.</p>
            )}
          </div>
          <div className="panel-foot">
            <span>
              {metricInfo[metric][0]}{" "}
              {metricInfo[metric][1] && "(" + metricInfo[metric][1] + ")"} ·{" "}
              {metricInfo[metric][2]}
            </span>
            <button onClick={() => navigate("evaluation")}>
              View evaluation <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
        <section className="panel scenario-panel">
          <div className="panel-heading">
            <div>
              <h2>Scenario library</h2>
              <p>Explore different service conditions</p>
            </div>
            <button
              className="iconbtn"
              onClick={() => navigate("scenarios")}
              aria-label="Explore all scenarios"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="scenario-list">
            {picks.map(([id, Icon, tone]) => {
              const s = scenarios.find((s) => s.id === id);
              return (
                s && (
                  <button key={id} onClick={() => openScenario(id)}>
                    <span className={"scenario-icon " + tone}>
                      <Icon size={19} />
                    </span>
                    <div>
                      <strong>{s.name}</strong>
                      <small>
                        {s.order.length} dish batches · {s.staff} kitchen staff
                      </small>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                )
              );
            })}
            {scenarioError && (
              <p>
                Scenario library unavailable. Refresh the workspace to retry.
              </p>
            )}
          </div>
        </section>
      </div>
      <div className="home-panels">
        <section className="panel subpanel">
          <span className="mini-heading">
            <CheckCheck size={15} /> Model selection
          </span>
          <h2>{best ? state.names[state.recommended] : "Awaiting training"}</h2>
          <p>
            {best
              ? "Recommended by the lowest validation MAE of " +
                fmt(best.validation.mae) +
                " minutes."
              : "Train the baseline models to compare their validation results."}
          </p>
          <p>
            {result.length
              ? "Best test MSE " +
                fmt(rank("mse")[0].test.mse) +
                " min² · Best test RMSE " +
                fmt(rank("rmse")[0].test.rmse) +
                " min"
              : ""}
          </p>
        </section>
        <section className="panel subpanel">
          <span className="mini-heading">
            <Workflow size={15} /> Experiment workflow
          </span>
          <div className="workflow-links">
            {[
              ["dataset", "Explore data"],
              ["training", "Train"],
              ["evaluation", "Evaluate"],
              ["explain", "Explain"],
              ["kitchen", "Simulate"],
            ].map(([id, label]) => (
              <button key={id} onClick={() => navigate(id)}>
                {label}
                <ChevronRight size={12} />
              </button>
            ))}
          </div>
          <p>
            {result.length} models evaluated on 4 metrics. {state.job.message}.
          </p>
        </section>
      </div>
    </div>
  );
}
export default function App() {
  const [page, setPage] = useState(getPage),
    [state, setState] = useState(null),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [dialog, setDialog] = useState(""),
    [query, setQuery] = useState("");
  const reload = useCallback(async () => {
    try {
      const next = await api("/state");
      setState(next);
      setError("");
      return next;
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    reload();
    const h = () => {
      setPage(getPage());
      setMobile(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, [reload]);
  useEffect(() => {
    if (!state?.job.running) return;
    const t = setInterval(reload, 900);
    return () => clearInterval(t);
  }, [state?.job.running, reload]);
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setDialog((d) => (d === "search" ? "" : "search"));
      }
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const navigate = useCallback((p) => {
    location.hash = p;
    setPage(p);
    setDialog("");
    setMobile(false);
    window.scrollTo(0, 0);
  }, []);
  const current = nav.find(([id]) => id === page)[1],
    activeGroup = groups.find(([, items]) =>
      items.some(([id]) => id === page),
    )[0];
  useEffect(() => {
    document.title = current + " · Mise Kitchen Intelligence";
  }, [current]);
  return (
    <div className="app-layout">
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        Skip to main content
      </a>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand" href="#estimate" aria-label="Mise order estimator">
          <img src="/mise.svg" alt="" />
          <span>
            mise<span className="brand-period">.</span>
            <small>Kitchen intelligence</small>
          </span>
        </a>
        <nav aria-label="Workspace navigation">
          {groups.map(([g, items]) => {
            const links = (
              <div className="nav-group" key={g}>
                <h2>{g}</h2>
                {items.map(([id, label, Icon]) => (
                  <a
                    key={id}
                    href={"#" + id}
                    aria-current={page === id ? "page" : undefined}
                    className={page === id ? "active" : ""}
                    onClick={() => setMobile(false)}
                  >
                    <Icon size={18} strokeWidth={1.65} />
                    {label}
                    {page === id && <span className="nav-dot" />}
                  </a>
                ))}
              </div>
            );
            return g === "Model lab" ? (
              <details
                className="nav-lab"
                key={g}
                open={items.some(([id]) => id === page) || undefined}
              >
                <summary>
                  Model lab - advanced <ChevronRight size={14} />
                </summary>
                {links}
              </details>
            ) : (
              links
            );
          })}
        </nav>
        <div className="side-bottom">
          <button onClick={() => setDialog("guide")}>
            <BookOpen size={17} /> Workspace guide <ChevronRight size={14} />
          </button>
          <div className="workspace-identity">
            <span className="identity-icon">
              <Utensils size={18} />
            </span>
            <div>
              <b>Restaurant AI</b>
              <small>Local workspace</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="top-bar">
          <button
            className="mobile-toggle iconbtn"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <div className="crumb">
            <Grid2X2 size={15} />
            <span>{activeGroup}</span>
            <ChevronRight size={13} />
            <strong>{current}</strong>
          </div>
          <div className="header-actions">
            <button
              className="search-trigger"
              aria-label="Search workspace"
              onClick={() => {
                setQuery("");
                setDialog("search");
              }}
            >
              <Search size={15} />
              <span>Search workspace</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className={"engine-status " + (error ? "offline" : "")}>
              <i />
              {error
                ? "Disconnected"
                : state
                  ? "Connected"
                  : "Connecting"}
            </span>
          </div>
        </header>
        <main id="content" className="page-area" tabIndex="-1">
          {error && (
            <div role="alert" className="error-banner">
              {error} <button onClick={reload}>Retry connection</button>
            </div>
          )}
          {!state ? (
            <div className="panel waiting">
              <LoaderCircle size={24} /> Connecting to the Python engine…
            </div>
          ) : (
            <Suspense
              fallback={<div className="waiting">Loading workspace…</div>}
            >
              {page === "service" ? <ShopKitchen navigate={navigate}/> : page === "order" ? (
                <CustomerShop navigate={navigate} />
              ) : page === "estimate" ? (
                <QuickEstimate
                  key={state.dataset.version}
                  {...{ state, navigate }}
                />
              ) : page === "integration" ? (
                <IntegrationGuide />
              ) : page === "overview" ? (
                <Home state={state} navigate={navigate} />
              ) : ["predict", "kitchen", "scenarios"].includes(page) ? (
                <Operations
                  key={page + "-" + state.dataset.version}
                  {...{ page, state, navigate, reload }}
                />
              ) : (
                <Lab
                  key={page + "-" + state.dataset.version}
                  {...{ page, state, navigate, reload }}
                />
              )}
            </Suspense>
          )}
        </main>
      </div>
      {dialog === "search" && (
        <Dialog title="Search workspace" onClose={() => setDialog("")}>
          <input
            className="command-input"
            placeholder="Find a page…"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="command-list">
            {nav
              .filter(([, n]) => n.toLowerCase().includes(query.toLowerCase()))
              .map(([id, label, Icon]) => (
                <button key={id} onClick={() => navigate(id)}>
                  <Icon size={17} />
                  {label}
                  <ArrowRight size={14} />
                </button>
              ))}
            {!nav.some(([, n]) =>
              n.toLowerCase().includes(query.toLowerCase()),
            ) && <p>No matching pages.</p>}
          </div>
        </Dialog>
      )}
      {dialog === "guide" && (
        <Dialog title="Workspace guide" onClose={() => setDialog("")}>
          <p>
            Start with an order, check the kitchen conditions, and calculate its
            pickup time.
          </p>
          <div className="guide-steps">
            {[
              [
                "estimate",
                "Get a pickup estimate",
                "Choose dishes and a kitchen condition to see when everything will be ready.",
              ],
              [
                "kitchen",
                "Plan a complete service",
                "Enter the queue, equipment and cooks. Inspect the schedule and 3D replay.",
              ],
              [
                "integration",
                "Connect your React app",
                "Send real order and kitchen data to the reusable estimation API.",
              ],
              [
                "evaluation",
                "Understand model accuracy",
                "Explore how the models were trained and what their measured errors mean.",
              ],
            ].map(([id, label, desc], i) => (
              <button key={id} onClick={() => navigate(id)}>
                <span>{i + 1}</span>
                <div>
                  <b>{label}</b>
                  <small>{desc}</small>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}
