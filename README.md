# Mise Kitchen Intelligence

Mise is a local restaurant machine learning lab. It predicts the active preparation time of each dish batch, then schedules those batches against cooks, stations, dependencies and older tickets to estimate when the whole order will be ready for pickup.

## Set up a fresh clone

This repository contains the application source, sample assets, dependency lockfiles and tests. Local environments, generated model artifacts, caches and customer test sessions are excluded. Follow **Rebuild or develop** below once to install dependencies, build the frontend and train the synthetic baseline. Use your clone directory in place of `E:\Harish Project` if you store it elsewhere. Then launch **Start Mise.cmd**.

## Open the installed application

Double-click **Start Mise.cmd** in this folder. It opens [the local workspace](http://127.0.0.1:8765/) in your browser. When the launcher starts the server, leave its window open during use. Press Ctrl+C in that window to stop it. Running the launcher again opens the existing service. The delivered installation includes the built frontend, the Python environment, 6,000 generated records and five fitted model artifacts. Normal use works offline.

## Customer ordering demo

Choose **Order food** in the sidebar for the customer-facing test journey. Sign in, select products, adjust the cart, review checkout and place a practice order. The confirmation includes the saved order ID, itemized amount, simulated payment status and a whole-order pickup estimate calculated from the shared kitchen queue.

Use `demo@mise.test` with `Kitchen123!`, or `guest@mise.test` with `Welcome123!`. Sample prices use INR. The local catalog and confirmed orders persist in `runtime/orders.sqlite`. See `CUSTOMER-DEMO.md` for the module guide.

The customer module uses the same frontend and backend. Its `/api/shop` routes are modular. Checkout uses the trained model and books cooks and station slots atomically. Open **Order kitchen** to view and configure the capacity used by customer orders. Confirmed orders keep their original estimates and include `preparation_items` compatible with the standalone estimation API.

## Everyday use

1. Open **Estimate pickup time**, the starting page. Add every dish and its quantity.
2. Choose **Quiet**, **Usual service** or **Busy** to load an example queue. Adjust cooks and kitchen use as needed.
3. Select **Estimate pickup time**. The result shows the rounded estimate, the wait before cooking starts, and each dish's finish time. Changing any input clears the previous estimate.
4. Open **Kitchen planner** for your own pending tickets, active work, equipment slots and dependencies. Advanced settings expand on demand.
5. Open **Example services** to compare different conditions or **Dish cooking time** to investigate a single batch.

These pages use simulated training data and clearly identified example queues. The expandable **Model lab** contains the dataset explorer, preprocessing details, model training, measured evaluation and prediction explanations.

## Connect your React app

Open **Connect your app** for a copyable request, React component and downloadable JavaScript client. The versioned endpoint is `POST /api/v1/estimate`. Supply the order and a current kitchen snapshot to obtain the readiness duration, model version, warnings and optional task schedule. The simple estimator uses this endpoint itself.

The implementation is reusable as `backend.integration.estimate_order(workspace, request)`. The browser client is `frontend/src/estimateClient.js`. See `INTEGRATION.md` for the contract, local proxy configuration and React integration. Your host app maintains order state and sends a fresh snapshot for each calculation.

## Data and reproducibility

The generator in `backend/dataset.py` draws independent dish batches. Dish priors are 7.5 minutes for a burger, 11.5 for a pizza, 4.5 for a sandwich, 2.5 for a coffee and 3.8 for a smoothie. Lunch, dinner and weekend service tend to have higher utilization. Queue size is sampled conditional on utilization. Complexity is correlated with dish type. The simulated prior preparation average is generated independently of the current dish's outcome. Controlled Gaussian noise adds unobserved variation.

Active preparation time combines dish prior, complexity, sublinear batching cost, a high-utilization penalty, interactions, small congestion costs and diminishing benefits from more staff or station slots. Durations have a 0.5-minute floor in the generator. Queue and workload influence active handling time, while explicit waiting to start is calculated by the scheduler. The source contains the full coefficients. The eight scenario fixtures in `backend/scenarios.json` are separate manually designed inputs.

The default seed is 42 with a noise standard deviation of 1.35 minutes. Two deterministic shuffled splits reserve 70% for training, 15% for validation and 15% for final testing. Dataset versions encode the generator revision, size, seed and noise settings. The default split contains 4,200 training, 900 validation and 900 test records. Every model for a version uses the same record IDs.

## Models, evaluation and explanations

The shared scikit-learn pipeline fits numerical median imputation, categorical most-frequent imputation and one-hot encoding on training rows. Linear Regression, KNN and RBF SVR also standardize numerical inputs. Linear regression drops the first category in each encoded field. Random Forest and XGBoost use unscaled numeric inputs. Inputs comprise dish, service period, weekday, quantity, complexity, pending ticket count, estimated queued work, utilization, staffing, station capacity and prior dish duration.

The preferred model minimizes validation MAE, with a stable model-key tie break. Test scores describe held-out performance. MAE is average absolute error in minutes. MSE averages squared errors in min². RMSE returns squared error to minutes by taking the square root. R² measures improvement over a mean baseline, can be negative, and increases with better fit. The evaluation view marks each column's winner. Heatmap colors use per-column min–max scaling and invert the three error metrics. A tied column gives each model full credit. Residuals are actual minus predicted minutes. Positive values indicate underprediction.

Permutation importance measures how much validation MAE increases when a feature is shuffled. It uses three repeats on up to 128 validation records. The tree regressors also expose native importance and additive Tree SHAP explanations, with one-hot contributions aggregated to their source field. XGBoost uses its native exact contribution implementation. Random Forest uses SHAP TreeExplainer. The other models use two opposing paths from a training reference record. Their signed changes average to an additive local explanation. These assignments depend on the reference and feature order. Global explanation plots use a deterministic sample of up to 72 validation records. Importance describes fitted associations and cannot establish causation.

## Kitchen scheduling

Time zero is acceptance of the new order. The scheduler ranks pending tickets by acceptance time, then checks dependency readiness and current resource availability. It dispatches the oldest eligible task and breaks ties by input order. Every dish batch occupies one cook and a compatible station slot for its entire predicted duration. Existing active tasks reserve their cook and slot for a specified remaining duration. Independent batches can overlap. A temporarily blocked older dish allows other ready work on available stations.

Burger uses Grill, pizza uses Oven, coffee and smoothie use Beverage, and sandwich uses Prep. Queued work is estimated from known remaining work plus older batches' dish priors times quantity. Scheduling inputs use priors available at acceptance. The trace records a minimum allocation of 0.1 minutes when a regressor returns a lower duration. Pickup readiness is the maximum completion time among the new order's tasks. The sum of batch minutes measures active work and can exceed elapsed order time.

## Project layout

| Location | Contents |
| --- | --- |
| `frontend/src/` | React interface, navigation, Recharts analysis, simulation controls and visualizations |
| `frontend/public/art/` | Locally served kitchen illustration |
| `backend/dataset.py` | Seeded synthetic generator, split and exploration |
| `backend/models.py` | Estimators, pipelines, metrics and model explanations |
| `backend/store.py` | Active workspace, version switching, background training and run history |
| `backend/scheduler.py` | Scenario validation and event-driven scheduling |
| `backend/main.py`, `backend/responses.py` | FastAPI endpoints, validation and response contracts |
| `runtime/data/` | Versioned CSVs, metadata and saved model bundles |
| `frontend/dist/` | Production frontend served by FastAPI |
| `tests/` | Scheduler invariants and isolated full-stack API/ML tests |
| `PROJECT-BRIEF.md` | Original project specification |

The Python process owns a single local workspace. It fits in a background thread, permits reads during retraining and publishes a complete replacement bundle atomically. Model history stores parameters, time and scores for each completed run. Dataset creation or switching while a job is running returns HTTP 409. A failed job preserves the previously published models. The API reference is available at [local interactive docs](http://127.0.0.1:8765/docs).

## Rebuild or develop

Use PowerShell from the project root on E:. Python 3.12 and a current Node LTS that supports Vite 7 (22.12 or later) are suitable. The delivered frontend was built with Node 26. Commands below place package caches and temporary downloads inside the project.

```powershell
Set-Location 'E:\Harish Project'
New-Item -ItemType Directory -Force runtime\tmp, runtime\cache | Out-Null
$env:TEMP = (Resolve-Path runtime\tmp).Path
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path (Get-Location) 'runtime\cache\pip'
$env:npm_config_cache = Join-Path (Get-Location) 'runtime\cache\npm'
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
Push-Location frontend
npm.cmd ci
npm.cmd run build
Pop-Location
.\.venv\Scripts\python.exe -m backend.bootstrap
.\.venv\Scripts\python.exe launch.py
```

The bootstrap command trains a baseline when the selected version has no fitted models. To run the suite, execute `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`. It uses temporary project-local storage and an ephemeral HTTP port. For frontend development, run the API on port 8765 and `npm.cmd run dev` in `frontend`. Vite proxies API calls to FastAPI. Installed project assets, fonts and data are served locally.

## Interpretation and limits

The platform uses synthetic data for experiments. Accuracy measures agreement with the generator on unseen synthetic batches. Estimating accuracy in a real kitchen requires measured preparation records, acceptance-time feature capture and evaluation on future service periods. Treat scenario outputs as conditional estimates. Cooks are interchangeable, tasks run without interruption, and station capacities stay fixed throughout a simulation. The model evaluates one ticket snapshot with known active work. Staff breaks, new arrivals, equipment failures, service-time uncertainty and station handoffs would require additional inputs and scheduling rules.

