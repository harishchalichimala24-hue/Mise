import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  FlaskConical,
  GitBranch,
  Layers3,
  Play,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Cell,
} from "recharts";
import { api } from "./api";
import "./lab.css";

const colors = ["#187b69", "#e58265", "#8075ae", "#4583a6", "#bd9147"];
const short = {
  linear: "Linear",
  knn: "KNN",
  svr: "SVR",
  forest: "Forest",
  xgb: "XGBoost",
};
const modelText = {
  linear: "Learns how each kitchen input adds to the preparation time.",
  knn: "Looks for similar dish batches and combines their preparation times.",
  svr: "Learns curved relationships between kitchen conditions and preparation time.",
  forest:
    "Combines many decision trees to estimate how long a batch will take.",
  xgb: "Builds decision trees in sequence, with each one correcting earlier errors.",
};
const metrics = [
  {
    key: "mae",
    name: "MAE",
    unit: "min",
    desc: "How many minutes predictions miss by, on average. Smaller is better.",
  },
  {
    key: "mse",
    name: "MSE",
    unit: "min²",
    desc: "Average squared error. Gives more weight to large mistakes. Smaller is better.",
  },
  {
    key: "rmse",
    name: "RMSE",
    unit: "min",
    desc: "Error in minutes with extra emphasis on large mistakes. Smaller is better.",
  },
  {
    key: "r2",
    name: "R²",
    unit: "unitless",
    desc: "How well the model explains differences in preparation times. Closer to one is better. A negative value means it performs below a mean-prediction baseline.",
  },
];
const pageNames = {
  dataset: [
    "Dataset explorer",
    "Explore the practice kitchen data used to teach and test the models.",
  ],
  pipeline: [
    "Preprocessing",
    "See how kitchen records are cleaned and prepared before the models learn.",
  ],
  training: [
    "Model training",
    "Teach five prediction methods using the same kitchen records, then compare their accuracy.",
  ],
  evaluation: [
    "Model evaluation",
    "Find out which model estimates preparation times most accurately.",
  ],
  explain: [
    "Model explainability",
    "See which details of an order make a model estimate more or less time.",
  ],
};
const nf = (n, d = 2) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const fixed = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const signed = (n) => (n > 0 ? "+" : "") + nf(n, 3);
const pretty = (s) =>
  String(s)
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
function useQuery(path, rev) {
  const [slot, setSlot] = useState({});
  const [retry, again] = useState(0);
  const id = JSON.stringify([path, rev, retry]);
  useEffect(() => {
    let active = true;
    if (path)
      api(path)
        .then((data) => {
          if (active) setSlot({ id, data });
        })
        .catch((e) => {
          if (active) setSlot({ id, error: e.message });
        });
    return () => {
      active = false;
    };
  }, [id]);
  return {
    ...(slot.id === id ? slot : {}),
    loading: !!path && slot.id !== id,
    retry: () => again((r) => r + 1),
  };
}
function Loading({ query }) {
  return query.error ? (
    <div className="lab-message error" role="alert">
      {query.error}
      <button className="btn" onClick={query.retry}>
        Try again
      </button>
    </div>
  ) : query.loading ? (
    <div className="lab-message" role="status">
      <RefreshCw size={16} className="lab-spin" /> Loading results…
    </div>
  ) : null;
}
function Field({ label, children }) {
  return (
    <label className="lab-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Panel({ title, desc, control, children, collapsible = false }) {
  const heading = (
    <div>
      <h2>{title}</h2>
      {desc && <p>{desc}</p>}
    </div>
  );
  if (collapsible)
    return (
      <details className="panel lab-panel lab-disclosure">
        <summary className="lab-panel-head">
          {heading}
          <ChevronRight className="lab-disclosure-arrow" size={18} />
        </summary>
        <div className="lab-disclosure-content">
          {control && <div className="lab-disclosure-controls">{control}</div>}
          {children}
        </div>
      </details>
    );
  return (
    <section className="panel lab-panel">
      <div className="lab-panel-head">
        {heading}
        {control}
      </div>
      {children}
    </section>
  );
}
function Tabs({ items, value, onChange }) {
  return (
    <div className="lab-tabs" aria-label="View">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className={value === item ? "on" : ""}
          aria-pressed={value === item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
function Empty({ navigate }) {
  return (
    <div className="panel lab-empty">
      <FlaskConical size={32} />
      <h2>Train a model to see results</h2>
      <p>
        Results belong to the active dataset and appear when a training run
        finishes.
      </p>
      <button className="btn primary" onClick={() => navigate("training")}>
        Open model training <ArrowRight size={15} />
      </button>
    </div>
  );
}
function Pill({ children }) {
  return <span className="lab-pill">{children}</span>;
}
function AxisHint({ children }) {
  return <p className="lab-axis">{children}</p>;
}
const axis = { fontSize: 11, fill: "#667a76" };
const tipStyle = {
  border: "1px solid #d4e2dd",
  borderRadius: 10,
  fontSize: 12,
  color: "#203e37",
  boxShadow: "0 4px 16px #163e2c12",
};
function Bars({
  data,
  x,
  y,
  height = 230,
  unit = "",
  colorsByRow = false,
  fill = colors[0],
  name = y,
  decimals = 2,
}) {
  return (
    <div className="lab-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="#e8eeeb"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey={x}
            axisLine={false}
            tickLine={false}
            tick={axis}
            minTickGap={9}
            tickFormatter={(v) => (typeof v === "number" ? nf(v, 1) : v)}
          />
          <YAxis
            width={44}
            axisLine={false}
            tickLine={false}
            tick={axis}
            domain={["auto", "auto"]}
            tickFormatter={(v) => nf(v, 2)}
          />
          <Tooltip
            contentStyle={tipStyle}
            cursor={{ fill: "#e0ece755" }}
            formatter={(v) => [nf(v, decimals) + " " + unit, name]}
            labelFormatter={(v, items) =>
              items?.[0]?.payload?.lo != null
                ? nf(items[0].payload.lo, 2) +
                  " – " +
                  nf(items[0].payload.hi, 2)
                : String(v)
            }
          />
          <Bar
            dataKey={y}
            name={name}
            fill={fill}
            radius={[4, 4, 0, 0]}
            maxBarSize={60}
            isAnimationActive={false}
          >
            {colorsByRow &&
              data.map((d, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function Dots({
  data,
  x,
  y,
  xname,
  yname,
  diagonal = false,
  zero = false,
  fill = colors[0],
  category = false,
}) {
  const span =
    diagonal && data.length
      ? [
          Math.floor(Math.min(...data.map((d) => Math.min(d[x], d[y])))),
          Math.ceil(Math.max(...data.map((d) => Math.max(d[x], d[y])))),
        ]
      : undefined;
  return (
    <>
      <div className="lab-chart" style={{ height: 245 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e5ece8" strokeDasharray="3 3" />
            <XAxis
              type={category ? "category" : "number"}
              allowDuplicatedCategory={false}
              dataKey={x}
              name={xname}
              domain={span || ["auto", "auto"]}
              tick={axis}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (typeof v === "number" ? nf(v, 1) : v)}
            />
            <YAxis
              dataKey={y}
              type="number"
              name={yname}
              domain={span || ["auto", "auto"]}
              width={40}
              tick={axis}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => nf(v, 1)}
            />
            <Tooltip
              contentStyle={tipStyle}
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(v, n) => [typeof v === "number" ? nf(v, 3) : v, n]}
            />
            {diagonal && span && (
              <ReferenceLine
                segment={[
                  { x: span[0], y: span[0] },
                  { x: span[1], y: span[1] },
                ]}
                stroke="#6f7775"
                strokeDasharray="5 4"
              />
            )}
            {zero && (
              <ReferenceLine y={0} stroke="#6f7775" strokeDasharray="5 4" />
            )}
            <Scatter
              data={data}
              fill={fill}
              fillOpacity={0.48}
              shape={<DotMark />}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <AxisHint>
        Horizontal · {xname} &nbsp; Vertical · {yname}
      </AxisHint>
    </>
  );
}
function DotMark({ cx, cy, fill, fillOpacity }) {
  return Number.isFinite(cx) && Number.isFinite(cy) ? (
    <circle cx={cx} cy={cy} r={3} fill={fill} fillOpacity={fillOpacity} />
  ) : null;
}
function Datatable({ heads, rows }) {
  return (
    <div className="lab-scroll">
      <table className="lab-table">
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Split({ dataset }) {
  return (
    <div className="lab-split">
      <div className="lab-split-bars" aria-hidden="true">
        {Object.entries(dataset.splits).map(([k, v], i) => (
          <i key={k} style={{ flexGrow: v, background: colors[i] }} />
        ))}
      </div>
      <div className="lab-split-legend">
        {Object.entries(dataset.splits).map(([k, v], i) => (
          <span key={k}>
            <i style={{ background: colors[i] }} />
            {pretty(k)} <b>{nf(v)}</b> ({nf((100 * v) / dataset.rows, 1)}%)
          </span>
        ))}
      </div>
    </div>
  );
}
function Dataset({ state, reload }) {
  const ds = state.dataset;
  const [tab, setTab] = useState("Distributions"),
    [feature, setFeature] = useState("prep_minutes"),
    [scatterFeature, setScatterFeature] = useState("quantity"),
    [page, setPage] = useState(1),
    [config, setConfig] = useState(false);
  const [form, setForm] = useState({
      size: ds.rows,
      seed: ds.seed,
      noise: ds.noise,
    }),
    [busy, setBusy] = useState(""),
    [err, setErr] = useState("");
  const q = useQuery(
    "/dataset/explore?feature=" + encodeURIComponent(feature) + "&page=" + page,
    ds.version,
  );
  const sq = useQuery(
    tab === "Relationships"
      ? "/dataset/explore?feature=" +
          encodeURIComponent(scatterFeature) +
          "&page=1"
      : null,
    ds.version,
  );
  const data = q.data,
    labels = ds.labels || {},
    target = "prep_minutes",
    fields = [...ds.features, target];
  async function mutate(path, body) {
    setBusy(path);
    setErr("");
    try {
      await api(path, body);
      setPage(1);
      await reload();
      setConfig(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    setForm({ size: ds.rows, seed: ds.seed, noise: ds.noise });
    setPage(1);
  }, [ds.version]);
  return (
    <>
      <section className="panel lab-panel lab-source">
        <div className="lab-source-symbol">
          <Database size={29} />
        </div>
        <div>
          <Pill>Synthetic dataset</Pill>
          <h2>Kitchen service records</h2>
          <p>
            {ds.version} · Seed {ds.seed} · Noise σ {nf(ds.noise)} min
          </p>
        </div>
        <div className="lab-source-actions">
          <Field label="Active dataset">
            <select
              value={ds.version}
              disabled={!!busy || state.job?.running}
              onChange={(e) =>
                mutate("/dataset/select", { version: e.target.value })
              }
            >
              {(state.versions || [ds]).map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version} · {nf(v.rows)} rows
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn"
            aria-expanded={config}
            disabled={!!busy || state.job?.running}
            onClick={() => setConfig(!config)}
          >
            <SlidersHorizontal size={16} /> Generate dataset
          </button>
        </div>
      </section>
      {err && (
        <div className="lab-message error" role="alert">
          {err}
        </div>
      )}
      {config && (
        <Panel
          title="Generator settings"
          desc="Each record is an independent synthetic dish batch. Lunch and dinner raise workload; larger, more complex batches take longer. Random variation adds realistic differences between otherwise similar orders. Reusing these settings recreates the same dataset."
        >
          <form
            className="lab-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutate("/dataset/generate", form);
            }}
          >
            {[
              ["size", "Records", 1],
              ["seed", "Repeatable random seed", 1],
              ["noise", "Random variation (min)", 0.01],
            ].map(([key, label, step]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  required
                  min={key === "size" ? 300 : key === "noise" ? 0.05 : 0}
                  max={
                    key === "size" ? 25000 : key === "noise" ? 8 : 2147483647
                  }
                  step={key === "noise" ? 0.0001 : step}
                  value={form[key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [key]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </Field>
            ))}
            <button className="btn primary" disabled={!!busy}>
              {busy ? "Generating…" : "Generate and activate"}
            </button>
          </form>
        </Panel>
      )}
      <div className="lab-summary">
        <div>
          <small>Dish batches</small>
          <strong>{nf(ds.rows)}</strong>
        </div>
        <div>
          <small>Input features</small>
          <strong>{ds.features.length}</strong>
        </div>
        <div>
          <small>Prediction target</small>
          <strong>
            Prep time <em>min</em>
          </strong>
        </div>
      </div>
      <Panel
        title="Dataset split"
        desc="Training records teach the models. Validation records help choose one. Test records provide a final accuracy check."
      >
        <Split dataset={ds} />
      </Panel>
      <Tabs
        items={[
          "Distributions",
          "Relationships",
          "Feature statistics",
          "Record preview",
        ]}
        value={tab}
        onChange={setTab}
      />
      <Loading query={q} />
      {data && tab === "Distributions" && (
        <div className="lab-grid">
          <Panel
            title="Feature distribution"
            desc="Choose a detail to see how often its values appear in the practice data."
            control={
              <Field label="Feature">
                <select
                  value={feature}
                  onChange={(e) => setFeature(e.target.value)}
                >
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {labels[f] || pretty(f)}
                    </option>
                  ))}
                </select>
              </Field>
            }
          >
            <Bars
              data={data.distribution}
              x="x"
              y="count"
              name="Records"
              unit="records"
            />
            <AxisHint>{labels[feature]} · Record count</AxisHint>
          </Panel>
          <Panel
            title="Preparation by dish"
            desc="Average preparation time for each dish in the simulated records."
          >
            <Bars
              data={data.dishes}
              x="dish"
              y="mean"
              name="Mean duration"
              colorsByRow
              unit="min"
            />
            <AxisHint>Dish type · Mean preparation duration (min)</AxisHint>
          </Panel>
        </div>
      )}
      {data && tab === "Relationships" && (
        <>
          <Panel
            title="Feature correlations"
            desc="Pearson correlation across numerical features. Teal indicates positive association and coral indicates negative association."
          >
            <Correlation
              matrix={data.matrix}
              correlations={data.correlations}
              labels={labels}
            />
          </Panel>
          <Panel
            title="Feature versus preparation duration"
            desc={
              sq.data?.scatter
                ? "A reproducible sample of dish batches."
                : "Records from the first preview page."
            }
            control={
              <Field label="Horizontal axis">
                <select
                  value={scatterFeature}
                  onChange={(e) => setScatterFeature(e.target.value)}
                >
                  {ds.features
                    .filter((f) => !["dish", "period", "day"].includes(f))
                    .map((f) => (
                      <option key={f} value={f}>
                        {labels[f]}
                      </option>
                    ))}
                </select>
              </Field>
            }
          >
            <Loading query={sq} />
            {sq.data && (
              <Dots
                data={
                  sq.data.scatter ||
                  sq.data.preview.map((r) => ({
                    x: r[scatterFeature],
                    y: r[target],
                  }))
                }
                x="x"
                y="y"
                xname={labels[scatterFeature]}
                yname="Preparation duration (min)"
              />
            )}
          </Panel>
        </>
      )}
      {data && tab === "Feature statistics" && (
        <Panel
          title="Schema and descriptive statistics"
          desc="Counts and numerical summaries cover every generated record."
        >
          <Datatable
            heads={[
              "Feature",
              "Data type",
              "Missing",
              "Minimum",
              "Mean",
              "Maximum",
              "Std. deviation",
            ]}
            rows={data.stats.map((s) => [
              labels[s.feature] || s.feature,
              s.dtype,
              nf(s.missing),
              nf(s.min),
              nf(s.mean),
              nf(s.max),
              nf(s.std),
            ])}
          />
        </Panel>
      )}
      {data && tab === "Record preview" && (
        <Panel
          title="Record preview"
          desc={
            "Page " +
            page +
            " of " +
            nf(data.pages) +
            " · " +
            nf(ds.rows) +
            " records"
          }
          control={
            <div className="lab-buttons">
              <button
                className="btn"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="btn"
                aria-label="Next page"
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          }
        >
          <Datatable
            heads={fields.map((k) => labels[k] || k)}
            rows={data.preview.map((r) => fields.map((k) => r[k] ?? "—"))}
          />
        </Panel>
      )}
    </>
  );
}
function Correlation({ matrix, correlations, labels }) {
  const keys = matrix ? Object.keys(matrix) : Object.keys(correlations);
  const cols = matrix ? keys : ["prep_minutes"];
  return (
    <div className="lab-scroll">
      <table className="lab-heat">
        <thead>
          <tr>
            <th scope="col">Feature</th>
            {cols.map((k) => (
              <th key={k} title={labels[k]}>
                {pretty(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th>{labels[k]}</th>
              {cols.map((c) => {
                const v = matrix ? matrix[k][c] : correlations[k];
                return (
                  <td
                    key={c}
                    title={labels[k] + " × " + labels[c] + " = " + v}
                    style={{
                      background:
                        (v >= 0 ? "rgba(29,133,108," : "rgba(226,130,103,") +
                        (0.07 + Math.abs(v) * 0.77) +
                        ")",
                      color: Math.abs(v) > 0.75 && v > 0 ? "white" : "#233e37",
                    }}
                  >
                    {fixed(v, 2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Pipeline({ state, navigate }) {
  const ds = state.dataset,
    cats = ["dish", "period", "day"];
  const phases = [
    [
      Database,
      "Separate inputs and target",
      ds.features.length +
        " input columns describe each batch. Preparation duration in minutes is the continuous target.",
    ],
    [
      GitBranch,
      "Partition the records",
      "Use two seeded random splits to form training, validation and test partitions before any transformation.",
    ],
    [
      Layers3,
      "Impute and encode",
      "Learn numerical medians and categorical modes on training records. One-hot encode dish, service period and weekday; ignore previously unseen categories.",
    ],
    [
      SlidersHorizontal,
      "Scale numerical features",
      "Standardize the numerical inputs for linear, neighbor and support vector regression. Tree models receive imputed values in their original units.",
    ],
    [
      Check,
      "Apply the fitted pipeline",
      "Reuse the fitted transformation for validation, testing and new orders. All original inputs are retained.",
    ],
  ];
  return (
    <>
      <Panel
        title="Shared split"
        desc={"Dataset " + ds.version + " · Random seed " + ds.seed}
      >
        <Split dataset={ds} />
      </Panel>
      <div className="lab-grid">
        <Panel title="Transformation sequence">
          {phases.map(([Icon, title, desc], i) => (
            <div className="lab-phase" key={title}>
              <div>
                <Icon size={18} />
              </div>
              <section>
                <small>Step {i + 1}</small>
                <h3>{title}</h3>
                <p>{desc}</p>
              </section>
            </div>
          ))}
        </Panel>
        <Panel
          title="Input schema"
          desc="Features available at the moment an order is accepted."
        >
          {[
            ["Categorical", cats],
            ["Numerical", ds.features.filter((f) => !cats.includes(f))],
            ["Target", ["prep_minutes"]],
          ].map(([label, features]) => (
            <section key={label} className="lab-schema">
              <h3>{label}</h3>
              <div>
                {features.map((f) => (
                  <span key={f}>{ds.labels?.[f] || pretty(f)}</span>
                ))}
              </div>
            </section>
          ))}
          <p className="lab-note">
            <CircleHelp size={16} /> Queue waiting is calculated later by the
            scheduler. The target measures active preparation.
          </p>
        </Panel>
      </div>
      <Panel title="Model-specific preprocessing">
        <Datatable
          heads={[
            "Estimator",
            "Numerical imputation",
            "Categorical encoding",
            "Numerical scaling",
          ]}
          rows={Object.entries(state.names).map(([k, n]) => [
            n,
            "Median",
            k === "linear" ? "One-hot · first level dropped" : "One-hot",
            ["linear", "knn", "svr"].includes(k)
              ? "StandardScaler"
              : "Original units",
          ])}
        />
      </Panel>
      <button className="btn primary" onClick={() => navigate("training")}>
        Configure model training <ArrowRight size={16} />
      </button>
    </>
  );
}

const floatingParams = ["C", "epsilon", "learning_rate", "subsample"];
function ParamControl({ name, value, onChange, state }) {
  return (
    <Field
      label={
        {
          fit_intercept: "Learn a baseline time",
          n_neighbors: "Similar batches to consider",
          weights: "How nearby batches are weighted",
          metric: "How similarity is measured",
          C: "C · fit flexibility",
          gamma: "Gamma · influence range",
          epsilon: "Epsilon · error tolerance (min)",
          n_estimators: "Number of trees",
          max_depth: "Maximum tree depth",
          min_samples_leaf: "Minimum records per leaf",
          learning_rate: "Learning rate",
          subsample: "Fraction of records per tree",
        }[name] || pretty(name)
      }
    >
      {typeof value === "boolean" ? (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      ) : state.options?.[name] ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {state.options[name].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          value={value}
          required
          min={state.limits?.[name]?.[0]}
          max={state.limits?.[name]?.[1]}
          step={floatingParams.includes(name) ? "any" : 1}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      )}
    </Field>
  );
}
function Training({ state, reload, navigate }) {
  const [chosen, choose] = useState("linear"),
    [edits, setEdits] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const job = state.job || {},
    keys = Object.keys(state.names),
    results = state.results;
  const configs = Object.fromEntries(
    keys.map((k) => [
      k,
      { ...state.defaults[k], ...(results[k]?.config || {}), ...edits[k] },
    ]),
  );
  const running = busy || job.running;
  function update(name, value) {
    setEdits((prev) => ({
      ...prev,
      [chosen]: { ...prev[chosen], [name]: value },
    }));
  }
  async function train(key) {
    setError("");
    setBusy(true);
    try {
      await api("/models/train", {
        model: key,
        params: key === "all" ? configs : { [key]: configs[key] },
      });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel lab-training-intro">
        <div className="lab-source-symbol">
          <FlaskConical size={28} />
        </div>
        <div>
          <h2>Train and compare all five models</h2>
          <p>
            {state.dataset.version} · {nf(state.dataset.splits.train)} training
            batches · Seed {state.dataset.seed}
          </p>
        </div>
        <button
          className="btn primary"
          disabled={running}
          onClick={() => train("all")}
        >
          <Play size={15} />{" "}
          {Object.keys(results).length ? "Retrain all five" : "Train all five"}
        </button>
      </section>
      <p className="lab-note">
        <CircleHelp size={16} /> Training teaches each model from examples, then
        checks its estimates against records it has never learned from. After it
        finishes, open evaluation to compare accuracy.
      </p>
      {(job.message || job.running || job.error) && (
        <div
          className={"lab-job " + (job.error ? "has-error" : "")}
          role="status"
        >
          <div>
            {job.running ? (
              <RefreshCw size={18} className="lab-spin" />
            ) : job.error ? (
              <CircleHelp size={18} />
            ) : (
              <Check size={18} />
            )}
            <strong>
              {job.error
                ? "Training error"
                : job.running
                  ? "Training in progress"
                  : "Training status"}
            </strong>
            <span>{job.error || job.message}</span>
            {job.total > 0 && (
              <small>
                {Math.min(job.completed, job.total)} / {job.total}
              </small>
            )}
          </div>
          {job.running && (
            <progress value={job.completed} max={Math.max(1, job.total)} />
          )}
        </div>
      )}
      {error && (
        <div className="lab-message error" role="alert">
          {error}
        </div>
      )}
      <Panel
        title="Adjust model settings"
        collapsible
        desc="Open to adjust how a model learns or train one model individually. The built-in settings are ready to use."
      >
        <div className="lab-config">
          <div className="lab-model-list">
            {keys.map((k, i) => (
              <button
                key={k}
                onClick={() => choose(k)}
                className={chosen === k ? "on" : ""}
                aria-pressed={chosen === k}
              >
                <i style={{ background: colors[i] }} />
                <span>{state.names[k]}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              train(chosen);
            }}
            className="lab-config-fields"
          >
            <div className="lab-kicker">
              <Settings2 size={15} />
              <span>Learning settings</span>
            </div>
            <h3>{state.names[chosen]}</h3>
            <p>{modelText[chosen]}</p>
            <div className="lab-form-grid">
              {Object.entries(configs[chosen]).map(([n, v]) => (
                <ParamControl
                  key={n}
                  name={n}
                  value={v}
                  state={state}
                  onChange={(v) => update(n, v)}
                />
              ))}
            </div>
            <div className="lab-buttons">
              <button type="submit" className="btn primary" disabled={running}>
                <Play size={15} />
                {results[chosen] ? "Retrain model" : "Train model"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setEdits((prev) => ({
                    ...prev,
                    [chosen]: { ...state.defaults[chosen] },
                  }))
                }
              >
                Restore defaults
              </button>
            </div>
          </form>
        </div>
      </Panel>
      <Panel
        title="Latest fitted runs"
        desc="See which models are ready to use. Expand a row for the settings behind that result."
        control={
          Object.keys(results).length > 0 && (
            <button className="btn" onClick={() => navigate("evaluation")}>
              View evaluation <ArrowRight size={15} />
            </button>
          )
        }
      >
        {keys.map((k, i) => {
          const r = results[k];
          return (
            <details className="lab-run" key={k}>
              <summary>
                <i style={{ background: colors[i] }} />
                <b>{state.names[k]}</b>
                <span>
                  {r
                    ? new Date(r.trained).toLocaleString()
                    : "Awaiting training"}
                </span>
                <strong>{r ? nf(r.seconds) + " s" : "—"}</strong>
                <ChevronRight size={16} />
              </summary>
              {r ? (
                <div className="lab-run-body">
                  <Pill>{r.version}</Pill>
                  {Object.entries(r.config).map(([n, v]) => (
                    <span key={n}>
                      {pretty(n)} <b>{String(v)}</b>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="lab-run-body">
                  Train this model to record a configuration.
                </p>
              )}
            </details>
          );
        })}
      </Panel>
      <RunHistory state={state} />
    </>
  );
}

function RunHistory({ state }) {
  const [page, setPage] = useState(0);
  const records = state.history || [],
    total = Math.ceil(records.length / 10),
    current = Math.min(page, Math.max(0, total - 1));
  return (
    <Panel
      title="Training history"
      collapsible
      desc="Open to compare previous training attempts and their saved settings."
      control={
        total > 1 && (
          <div className="lab-buttons">
            <button
              className="btn"
              disabled={!current}
              aria-label="Previous runs"
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              {current + 1} / {total}
            </span>
            <button
              className="btn"
              disabled={current >= total - 1}
              aria-label="Next runs"
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )
      }
    >
      {!records.length ? (
        <div className="lab-message">
          The next completed training run will appear here.
        </div>
      ) : (
        records.slice(current * 10, current * 10 + 10).map((run, i) => (
          <details className="lab-run" key={run.trained + run.model + i}>
            <summary>
              <i
                style={{
                  background:
                    colors[Object.keys(state.names).indexOf(run.model)],
                }}
              />
              <b>{state.names[run.model]}</b>
              <span>
                {new Date(run.trained).toLocaleString()} · {run.version}
              </span>
              <strong>{nf(run.seconds)} s</strong>
              <ChevronRight size={16} />
            </summary>
            <div className="lab-run-body">
              <Pill>{run.version}</Pill>
              {Object.entries(run.config).map(([k, v]) => (
                <span key={k}>
                  {pretty(k)} <b>{String(v)}</b>
                </span>
              ))}
              {run.fit_seconds != null && (
                <span>
                  Model fitting <b>{nf(run.fit_seconds, 3)} s</b>
                </span>
              )}
            </div>
            <Datatable
              heads={[
                "Partition",
                ...metrics.map((m) => m.name + " (" + m.unit + ")"),
              ]}
              rows={["validation", "test"].map((k) => [
                pretty(k),
                ...metrics.map((m) => fixed(run[k]?.[m.key])),
              ])}
            />
          </details>
        ))
      )}
    </Panel>
  );
}
function ScoreSelect({ names, chosen, choose }) {
  return (
    <Field label="Fitted model">
      <select value={chosen || ""} onChange={(e) => choose(e.target.value)}>
        {Object.entries(names).map(([k, n]) => (
          <option value={k} key={k}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  );
}
function ModelReadout({ state, navigate }) {
  const key = state.recommended,
    result = state.results[key];
  return (
    result && (
      <div className="lab-recommend">
        <span className="lab-recommend-icon">
          <Sparkles size={21} />
        </span>
        <section>
          <small>Recommended prediction model</small>
          <h3>{state.names[key]}</h3>
          <p>
            Its estimates missed by an average of {nf(result.validation.mae)}{" "}
            minutes across {nf(state.dataset.splits.validation)} validation
            batches, the lowest average error among the trained models.
          </p>
        </section>
        <div>
          <strong>{fixed(result.validation.mae)}</strong>
          <span>minutes average error</span>
          <button
            className="btn primary lab-use-model"
            onClick={() => navigate("estimate")}
          >
            Try an order <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  );
}
function Evaluation({ state, navigate }) {
  const [tab, setTab] = useState("Scorecard"),
    [split, setSplit] = useState("test"),
    [selected, setSelected] = useState("");
  const all = Object.entries(state.names),
    trained = all.filter(([k]) => state.results[k]),
    names = Object.fromEntries(trained);
  const chosen = names[selected]
    ? selected
    : state.recommended || trained[0]?.[0];
  const stat = state.results[chosen];
  const q = useQuery(
    tab === "Diagnostics" && stat ? "/models/plots?model=" + chosen : null,
    stat?.trained,
  );
  if (!trained.length) return <Empty navigate={navigate} />;
  const scores = Object.fromEntries(
    metrics.map(({ key }) => {
      const values = trained.map(([k]) => state.results[k][split][key]);
      const lo = Math.min(...values),
        hi = Math.max(...values),
        best = key === "r2" ? hi : lo;
      return [
        key,
        {
          lo,
          hi,
          best,
          winners: trained
            .filter(([k]) => state.results[k][split][key] === best)
            .map(([, n]) => n),
        },
      ];
    }),
  );
  const norm = (v, m) => {
    const { lo, hi } = scores[m];
    return hi === lo
      ? 1
      : m === "r2"
        ? (v - lo) / (hi - lo)
        : (hi - v) / (hi - lo);
  };
  const rowData = trained.map(([k]) => ({
    label: short[k],
    ...state.results[k][split],
  }));
  const diag = q.data;
  return (
    <>
      <ModelReadout state={state} navigate={navigate} />
      <Tabs
        items={["Scorecard", "Metric charts", "Diagnostics"]}
        value={tab}
        onChange={setTab}
      />
      {tab !== "Diagnostics" && (
        <div className="lab-view-head">
          <span>
            <GitBranch size={15} />
            {state.dataset.version} · {nf(state.dataset.splits[split])} {split}{" "}
            records
          </span>
          <Field label="Evaluation split">
            <select value={split} onChange={(e) => setSplit(e.target.value)}>
              <option value="test">Test · final accuracy check</option>
              <option value="validation">Validation · model selection</option>
            </select>
          </Field>
        </div>
      )}
      {tab === "Scorecard" && (
        <>
          <Panel
            title="How accurate are the models?"
            desc="Start with average error (MAE), measured in minutes. Highlighted values are the best in each column. The recommendation uses validation results."
          >
            <Datatable
              heads={[
                "Model",
                ...metrics.map((m) => (
                  <span title={m.desc}>
                    {m.name} {m.key === "r2" ? "↑" : "↓"}
                    <small className="lab-metric-label">
                      {
                        {
                          mae: "Average error · min",
                          mse: "Squared error · min²",
                          rmse: "Large-error emphasis · min",
                          r2: "Explained variation",
                        }[m.key]
                      }
                    </small>
                  </span>
                )),
              ]}
              rows={all.map(([k, n]) => [
                <strong>{n}</strong>,
                ...metrics.map((m) => {
                  const v = state.results[k]?.[split]?.[m.key];
                  return (
                    <span
                      className={v === scores[m.key].best ? "lab-best" : ""}
                    >
                      {fixed(v)}
                    </span>
                  );
                }),
              ])}
            />
          </Panel>
          <Panel
            title="What do these scores mean?"
            desc="Open the guide to the four accuracy measures."
            collapsible
          >
            <div className="lab-metric-guide">
              {metrics.map((m) => (
                <section key={m.key}>
                  <h3>
                    {m.name} <span>{m.unit}</span>
                  </h3>
                  <p>{m.desc}</p>
                </section>
              ))}
            </div>
            <p className="lab-note">
              Validation results choose the recommended model. The separate test
              records measure its final performance. These results describe the
              synthetic data used in this project.
            </p>
          </Panel>
          <Panel
            title="Normalized performance heatmap"
            collapsible
            desc="Each column uses min–max scaling across fitted models. One is best and zero is worst. Error scales are reversed. Tied columns score one."
          >
            <div className="lab-scroll">
              <table className="lab-heat">
                <thead>
                  <tr>
                    <th>Model</th>
                    {metrics.map((m) => (
                      <th key={m.key}>{m.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {all.map(([k, n]) => (
                    <tr key={k}>
                      <th>{n}</th>
                      {metrics.map((m) => {
                        const v = state.results[k]?.[split]?.[m.key],
                          s = v == null ? null : norm(v, m.key);
                        return (
                          <td
                            key={m.key}
                            title={m.name + " = " + fixed(v) + " " + m.unit}
                            style={{
                              background:
                                s == null
                                  ? "#edf0ee"
                                  : "rgba(15,116,94," + (0.08 + 0.85 * s) + ")",
                              color: s > 0.55 ? "white" : "#233e37",
                            }}
                          >
                            {fixed(s, 2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Best result for each metric"
            collapsible
            desc={"Best measured results on the " + split + " partition."}
          >
            <div className="lab-leaders">
              {metrics.map((m) => (
                <div key={m.key}>
                  <small>
                    {m.name} {m.key === "r2" ? "↑" : "↓"}
                  </small>
                  <strong>
                    {fixed(scores[m.key].best)} <em>{m.unit}</em>
                  </strong>
                  <b>{scores[m.key].winners.join(" / ")}</b>
                  <p>{m.desc}</p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
      {tab === "Metric charts" && (
        <div className="lab-grid">
          {metrics.map((m, i) => (
            <Panel
              key={m.key}
              title={m.name + " comparison"}
              desc={
                m.desc +
                " " +
                (m.key === "r2" ? "Higher" : "Lower") +
                " is better."
              }
            >
              <Bars
                data={rowData}
                x="label"
                y={m.key}
                name={m.name}
                fill={colors[i]}
                unit={m.unit}
                decimals={4}
              />
              <AxisHint>
                Model · {m.name} ({m.unit})
              </AxisHint>
            </Panel>
          ))}
        </div>
      )}
      {tab === "Diagnostics" && (
        <>
          <div className="lab-view-head">
            <span>
              <Activity size={16} /> Held-out test diagnostics
            </span>
            <ScoreSelect names={names} chosen={chosen} choose={setSelected} />
          </div>
          <Loading query={q} />
          {diag && (
            <>
              <div className="lab-grid">
                <Panel
                  title="Actual versus predicted"
                  desc="Each dot is a test dish batch. Dots closer to the dashed line have more accurate estimates."
                >
                  <Dots
                    data={diag.points}
                    x="actual"
                    y="pred"
                    xname="Actual (min)"
                    yname="Predicted (min)"
                    diagonal
                  />
                </Panel>
                <Panel
                  title="Residuals versus predicted"
                  desc="Residual means actual time minus estimated time. Dots above zero took longer than the model expected."
                >
                  <Dots
                    data={diag.points}
                    x="pred"
                    y="residual"
                    xname="Predicted (min)"
                    yname="Actual − predicted (min)"
                    fill={colors[2]}
                    zero
                  />
                </Panel>
              </div>
              <div className="lab-grid">
                <Panel
                  title="Residual distribution"
                  desc="See how often the model overestimated or underestimated. Errors near zero are smaller."
                >
                  <Bars
                    data={diag.histogram}
                    x="x"
                    y="count"
                    name="Test records"
                    unit="records"
                    fill={colors[1]}
                  />
                  <AxisHint>Residual (min) · Test records</AxisHint>
                </Panel>
                <Panel
                  title="Residual summary"
                  desc={
                    state.names[chosen] +
                    " · " +
                    nf(diag.points.length) +
                    " test records"
                  }
                >
                  <Datatable
                    heads={["Statistic", "Minutes"]}
                    rows={Object.entries(stat.residual).map(([k, v]) => [
                      {
                        mean: "Mean bias",
                        std: "Standard deviation",
                        p05: "5th percentile",
                        median: "Median",
                        p95: "95th percentile",
                      }[k] || k,
                      fixed(v),
                    ])}
                  />
                  <p className="lab-note">
                    {Math.abs(stat.residual.mean) < 0.0005
                      ? "Mean bias rounds to zero."
                      : stat.residual.mean > 0
                        ? "On average, this model predicts shorter preparation times than observed."
                        : "On average, this model predicts longer preparation times than observed."}
                  </p>
                </Panel>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function Importance({ values, labels, unit }) {
  const max = Math.max(0.000001, ...values.map((r) => Math.abs(r.value)));
  return (
    <div className="lab-importance">
      {values.map(({ feature, value }) => (
        <div
          key={feature}
          title={labels[feature] + ": " + fixed(value, 4) + " " + unit}
        >
          <span>{labels[feature] || feature}</span>
          <div>
            <i
              style={{
                width: (Math.abs(value) / max) * 100 + "%",
                background: value < 0 ? colors[1] : colors[0],
              }}
            />
          </div>
          <b>{fixed(value, 3)}</b>
        </div>
      ))}
    </div>
  );
}
function Beeswarm({ records, features, labels }) {
  const width = 760,
    left = 175,
    right = 30,
    step = 34,
    span = width - left - right,
    h = step * features.length + 40;
  const max = Math.max(
    0.001,
    ...records.flatMap((r) => features.map((f) => Math.abs(r.values[f]))),
  );
  const pos = (v) => left + ((v / max + 1) * span) / 2;
  return (
    <div className="lab-scroll">
      <svg
        className="lab-bees"
        viewBox={"0 0 " + width + " " + h}
        role="img"
        aria-label="SHAP contribution summary by feature in minutes"
      >
        <line
          x1={pos(0)}
          x2={pos(0)}
          y1={0}
          y2={h - 30}
          stroke="#96ada4"
          strokeDasharray="3 3"
        />
        {features.map((f, i) => {
          const ys = step * i + step / 2,
            raw = records.map((r) => r.input[f]),
            isNumeric = typeof raw[0] === "number",
            lo = isNumeric ? Math.min(...raw) : 0,
            hi = isNumeric ? Math.max(...raw) : 0;
          const bins = {};
          return (
            <g key={f}>
              <text
                x={left - 12}
                y={ys + 4}
                textAnchor="end"
                fontSize="12"
                fill="#3d514b"
              >
                {labels[f]}
              </text>
              <line
                x1={left}
                x2={width - right}
                y1={ys}
                y2={ys}
                stroke="#e6eeea"
              />
              {records.map((r, j) => {
                const x = pos(r.values[f]),
                  bucket = Math.floor(x / 5),
                  rank = bins[bucket] || 0;
                bins[bucket] = rank + 1;
                const y =
                  ys +
                  ((rank === 0
                    ? 0
                    : (rank % 2 === 1 ? 1 : -1) * Math.ceil(rank / 2) * 3.1) %
                    13);
                const level = hi === lo ? 0.5 : (raw[j] - lo) / (hi - lo);
                const hue = isNumeric
                  ? "rgb(" +
                    [
                      Math.round(39 + level * 181),
                      Math.round(145 - level * 38),
                      Math.round(132 - level * 38),
                    ].join(",") +
                    ")"
                  : "#8174a5";
                return (
                  <circle
                    key={j}
                    cx={x}
                    cy={y}
                    r={2.9}
                    fillOpacity=".78"
                    fill={hue}
                  >
                    <title>
                      {labels[f]} · {raw[j]} · {signed(r.values[f])} min
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}
        {[-1, -0.5, 0, 0.5, 1].map((v) => (
          <text
            key={v}
            x={pos(v * max)}
            y={h - 15}
            textAnchor="middle"
            fontSize={11}
            fill="#63766c"
          >
            {nf(v * max, 1)}
          </text>
        ))}
      </svg>
    </div>
  );
}
function Waterfall({ record, base, labels }) {
  const entries = Object.entries(record.values).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  );
  let total = base;
  const parts = entries.map(([f, v]) => {
    const from = total;
    total += v;
    return { f, v, from, to: total };
  });
  const min = Math.min(base, ...parts.map((p) => p.to)),
    max = Math.max(base, ...parts.map((p) => p.to)),
    span = Math.max(0.001, max - min),
    x = (v) => ((v - min) / span) * 92 + 4;
  return (
    <div className="lab-water">
      <div className="lab-water-ends">
        <span>
          Reference <b>{nf(base, 3)} min</b>
        </span>
        <ArrowRight size={17} />
        <span>
          Prediction <b>{nf(record.prediction, 3)} min</b>
        </span>
      </div>
      {parts.map((p) => (
        <div
          className="lab-water-row"
          key={p.f}
          title={"From " + nf(p.from, 3) + " to " + nf(p.to, 3) + " minutes"}
        >
          <span>
            {labels[p.f]} <small>{String(record.input[p.f])}</small>
          </span>
          <div>
            <i
              style={{
                left: Math.min(x(p.from), x(p.to)) + "%",
                width: Math.max(0.4, Math.abs(x(p.from) - x(p.to))) + "%",
                background: p.v >= 0 ? colors[1] : colors[0],
              }}
            />
          </div>
          <b>{signed(p.v)}</b>
        </div>
      ))}
      <AxisHint>
        Contribution in minutes · Coral increases the estimate; teal decreases
        it.
      </AxisHint>
    </div>
  );
}
function Explain({ state, navigate }) {
  const [selected, choose] = useState(""),
    [tab, setTab] = useState("Global influence"),
    [feature, setFeature] = useState("quantity"),
    [idx, setIdx] = useState(0);
  const labels = state.dataset.labels,
    features = state.dataset.features,
    names = Object.fromEntries(
      Object.entries(state.names).filter(([k]) => state.results[k]),
    );
  const chosen = names[selected]
    ? selected
    : state.recommended || Object.keys(names)[0];
  const q = useQuery(
    chosen ? "/models/explainability?model=" + chosen : null,
    state.results[chosen]?.trained,
  );
  if (!chosen) return <Empty navigate={navigate} />;
  const d = q.data,
    records = d?.records || [],
    index = Math.min(idx, records.length - 1),
    r = records[index],
    tree = chosen === "forest" || chosen === "xgb";
  const order =
    d && records.length
      ? [...features].sort((a, b) =>
          records.reduce(
            (s, r) => s + Math.abs(r.values[b]) - Math.abs(r.values[a]),
            0,
          ),
        )
      : [];
  return (
    <>
      <div className="lab-view-head">
        <span>
          <GitBranch size={16} />
          {state.dataset.version} · Fitted model analysis
        </span>
        <ScoreSelect
          names={names}
          chosen={chosen}
          choose={(k) => {
            choose(k);
            setIdx(0);
          }}
        />
      </div>
      <p className="lab-note">
        <CircleHelp size={16} /> Start with the overall input ranking, or choose
        “Individual prediction” to see why one dish batch received its estimate.
      </p>
      <Tabs
        items={["Global influence", "Feature effects", "Individual prediction"]}
        value={tab}
        onChange={setTab}
      />
      <Loading query={q} />
      {d && (
        <>
          {tab === "Global influence" && (
            <>
              <div className="lab-influence-stack">
                <Panel
                  title="Which inputs matter most?"
                  desc="We shuffle one input at a time and measure how much accuracy drops. A longer positive bar means the model relies more on that input."
                >
                  <Importance
                    values={d.importance}
                    labels={labels}
                    unit="min"
                  />
                  <AxisHint>Mean increase in MAE (min)</AxisHint>
                </Panel>
                {d.native?.length > 0 && (
                  <Panel
                    title="Tree feature importance"
                    collapsible
                    desc="Open to see how much the model uses each input across its decision trees."
                  >
                    <Importance values={d.native} labels={labels} unit="" />
                    <AxisHint>Fraction of total importance</AxisHint>
                  </Panel>
                )}
              </div>
              <p className="lab-note">
                <CircleHelp size={16} /> These charts show patterns learned by
                this model. Inputs can move together in the data, so influence
                alone does not establish cause and effect.
              </p>
            </>
          )}
          {tab === "Feature effects" && records.length > 0 && (
            <>
              <Panel
                title={tree ? "SHAP summary" : "Contribution summary"}
                desc={
                  d.method +
                  " · " +
                  records.length +
                  " explained records. Each point shows one feature’s contribution to a prediction."
                }
              >
                <Beeswarm records={records} features={order} labels={labels} />
                <div className="lab-swarm-legend">
                  <span>Lower numeric value</span>
                  <i />
                  <span>Higher numeric value</span>
                  <b />
                  Categorical
                </div>
                <AxisHint>Contribution to preparation duration (min)</AxisHint>
              </Panel>
              <Panel
                title={tree ? "SHAP dependence" : "Feature dependence"}
                desc="Choose an input. Dots above zero increase the estimated time; dots below zero decrease it."
                control={
                  <Field label="Feature">
                    <select
                      value={feature}
                      onChange={(e) => setFeature(e.target.value)}
                    >
                      {features.map((f) => (
                        <option key={f} value={f}>
                          {labels[f]}
                        </option>
                      ))}
                    </select>
                  </Field>
                }
              >
                <Dots
                  data={records.map((r) => ({
                    x: r.input[feature],
                    y: r.values[feature],
                  }))}
                  x="x"
                  y="y"
                  xname={labels[feature]}
                  yname="Contribution (min)"
                  category={typeof records[0].input[feature] !== "number"}
                  zero
                />
              </Panel>
            </>
          )}
          {tab === "Individual prediction" && r && (
            <Panel
              title={tree ? "SHAP waterfall" : "Prediction waterfall"}
              desc={
                d.method +
                " · The signed contributions add to the reference value to produce the prediction."
              }
              control={
                <Field label="Explained batch">
                  <select
                    value={index}
                    onChange={(e) => setIdx(Number(e.target.value))}
                  >
                    {records.map((r, i) => (
                      <option key={i} value={i}>
                        {i + 1} · {r.input.dish} × {r.input.quantity}
                      </option>
                    ))}
                  </select>
                </Field>
              }
            >
              <Waterfall record={r} base={d.base} labels={labels} />
            </Panel>
          )}
          {tab !== "Global influence" && !records.length && (
            <div className="lab-message">
              No individual records are available for this run.
            </div>
          )}
        </>
      )}
    </>
  );
}
export default function Lab({ page, state, reload, navigate }) {
  const component = {
    dataset: Dataset,
    pipeline: Pipeline,
    training: Training,
    evaluation: Evaluation,
    explain: Explain,
  };
  const Screen = component[page],
    meta = pageNames[page];
  if (!Screen) return null;
  return (
    <div className="lab">
      <header className="lab-heading">
        <div className="eyebrow">Machine learning lab</div>
        <h1 className="page-title">{meta[0]}</h1>
        <p>{meta[1]}</p>
      </header>
      <Screen
        key={page + ":" + state.dataset.version}
        state={state}
        reload={reload}
        navigate={navigate}
      />
    </div>
  );
}
