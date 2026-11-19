# Restaurant AI Prediction Platform

## Machine Learning Model Comparison, Explainability, and Order Readiness Simulation

## 1. Project Overview

Build a complete, interactive web application for an AI course project.
The application must demonstrate how machine learning models can predict
restaurant food preparation times, how their performance can be
evaluated and compared, and how their predictions can be integrated with
a kitchen scheduling algorithm to estimate when a customer's complete
order will be ready for pickup.

The application is an **ML model evaluation and restaurant order
readiness prediction platform**, not a conventional food ordering
application.

The central question the system should answer is:

> How long will the restaurant take to finish preparing the customer's
> complete order, considering dish preparation requirements, existing
> orders, kitchen resources, and current workload?

The customer-facing output is an estimated duration such as:

**"Your order will be ready in approximately 14 minutes."**

The application must also explain how this estimate was produced.

### Explicit scope exclusions

Do not include: - Customer GPS coordinates or current location. - Pickup
distance. - Delivery personnel or delivery availability. - Travel or
delivery duration. - Suggested customer departure time. - Payment
gateways, customer authentication, or a complete commercial
food-ordering workflow.

The system only predicts when the restaurant will finish preparing the
order and mark it **Ready for Pickup**.

## 2. Main Project Objectives

The application must demonstrate the complete AI/ML workflow:

1.  Dataset creation, loading, and exploration.
2.  Data preprocessing and feature engineering.
3.  Training five regression models.
4.  Evaluating all models using four common regression metrics.
5.  Comparing model performance through interactive visualizations.
6.  Explaining model behavior and individual predictions.
7.  Selecting a model based on measured test performance.
8.  Using model predictions in a Python-based kitchen scheduling
    algorithm.
9.  Simulating different restaurant conditions and estimating complete
    order readiness time.

The frontend should make these stages understandable and visually
connected.

## 3. Machine Learning Models

Implement and compare the following five regression models:

1.  **Linear Regression** -- baseline regression model.
2.  **K-Nearest Neighbors Regressor (KNN)** -- instance-based
    regression.
3.  **Support Vector Regression (SVR) with an RBF kernel** -- nonlinear
    regression.
4.  **Random Forest Regressor** -- ensemble of decision trees.
5.  **XGBoost Regressor** -- gradient-boosted decision trees.

### Important target-variable requirement

The target is a continuous preparation duration measured in minutes.
Therefore, use regression implementations.

Use **Linear Regression**, not Logistic Regression, as the baseline for
predicting continuous preparation time. Logistic Regression is a
classification algorithm and is not appropriate for the primary
continuous-time prediction task. If a classification extension is
desired later, it may classify orders into readiness categories such as
short, medium, or long wait, but it must remain separate from the main
regression comparison.

### Model configuration

Provide sensible default hyperparameters and allow users to inspect or
modify selected parameters.

Suggested configurable parameters:

-   Linear Regression: fit intercept.
-   KNN: number of neighbors, distance weighting, and distance metric.
-   SVR-RBF: C, gamma, and epsilon.
-   Random Forest: number of estimators, maximum depth, and minimum
    samples per leaf.
-   XGBoost: number of estimators, learning rate, maximum depth, and
    subsampling.

Use reproducible random seeds where applicable. Record each model's
configuration and training run.

All models must use the same training and test records for a fair
comparison. Apply scaling where appropriate, particularly for Linear
Regression, KNN, and SVR. Use preprocessing pipelines to prevent data
leakage.

## 4. Dataset and Feature Design

The first version may use a generated synthetic dataset and hardcoded
demonstration scenarios. Clearly label all synthetic data as simulated;
do not present it as real restaurant data.

Create a configurable dataset with enough records to demonstrate
training, testing, and model comparison. A starting target of
approximately 5,000--10,000 synthetic records is acceptable, but the
application should allow the dataset size to be changed.

### Suggested input features

Use meaningful features such as:

  -----------------------------------------------------------------------
  Feature                             Description
  ----------------------------------- -----------------------------------
  Dish type                           Burger, pizza, sandwich, coffee,
                                      smoothie, etc.

  Quantity                            Number of units of the dish

  Dish complexity                     Configurable complexity score

  Pending order count                 Number of unfinished orders

  Queue workload                      Estimated work already waiting

  Kitchen workload                    Current workload or utilization

  Available staff                     Number of available kitchen staff

  Resource availability               Availability of required
                                      preparation stations

  Time of day                         Restaurant operating period

  Day of week                         Day associated with the order

  Recent preparation average          Recent average duration for
                                      comparable dishes

  Preparation duration                Actual/simulated duration in
                                      minutes; target variable
  -----------------------------------------------------------------------

Choose features that would be available at prediction time. Do not
include information that would only become known after the order is
completed.

### Synthetic data generation

Generate synthetic records using transparent, configurable rules that
represent plausible relationships between: - Dish type and complexity. -
Quantity and preparation duration. - Queue workload and waiting
conditions. - Staff and kitchen resource availability. - Time-of-day
workload patterns.

Introduce controlled variability so the dataset is not perfectly
deterministic. Avoid generating random target values unrelated to the
input features, as that would make model training and evaluation
meaningless.

Document the assumptions and data-generation rules. Keep the synthetic
data generator separate from the model training code.

### Dataset separation

Maintain two distinct data sources:

**A. ML dataset** - Used to train, validate, and test the five models. -
Contains feature columns and a preparation-duration target. - Must use a
reproducible split.

**B. Demonstration scenarios** - A set of manually designed restaurant
situations. - Used to demonstrate the complete prediction and scheduling
workflow. - Must be separate from the model's training data. - Must
contain known, inspectable inputs and simulated order/resource states.

For historical real-world data, use chronological train/test splitting
where appropriate. For synthetic data, use a reproducible random split,
while ensuring records derived from the same simulated scenario do not
leak across splits if that would make evaluation artificially easy.

## 5. Four Model Evaluation Metrics

Evaluate every model using exactly the same held-out test dataset and
the following four regression metrics.

### 1. Mean Absolute Error (MAE)

Measures the average absolute difference between predicted and actual
preparation durations. Lower is better.

### 2. Mean Squared Error (MSE)

Measures the average squared prediction error and penalizes larger
errors more heavily. Lower is better.

### 3. Root Mean Squared Error (RMSE)

Measures prediction error in the original time unit, minutes. Lower is
better.

### 4. R-squared (R²)

Measures the proportion of target variance explained by the model.
Higher is generally better. Explain that R² can be negative when a model
performs worse than a simple mean-prediction baseline.

### Evaluation requirements

-   Calculate all four metrics from actual model predictions on the
    held-out test set.
-   Never hardcode or fabricate metric values.
-   Display the unit for MAE and RMSE as minutes; MSE is in minutes
    squared; R² is unitless.
-   Clearly indicate whether higher or lower values are better.
-   Report the best-performing model separately for each metric.
-   Do not assume one model wins every metric.
-   Include the dataset split and model configuration used for each
    evaluation run.
-   Keep training data, validation data, and test data appropriately
    separated.
-   Do not use the test set repeatedly for hyperparameter tuning. If
    tuning is implemented, use a validation set or cross-validation on
    the training data.

## 6. Application Navigation and Main Sections

Build the application around the following sections.

### A. Overview Dashboard

Create a polished project dashboard that summarizes the complete ML
pipeline.

Display: - Project title and short objective. - Number of models
evaluated. - Number of evaluation metrics. - Training dataset size. -
Testing dataset size. - Selected or best-performing model, based on
actual evaluation. - Best MAE, MSE, RMSE, and R² results. - Most recent
training/evaluation status. - A concise workflow overview.

Do not display fabricated results before models have actually been
trained and evaluated. Use empty states or clearly marked sample/demo
data when results are not yet available.

### B. Dataset Explorer

Provide an interactive dataset exploration page.

Include: - Dataset preview with pagination. - Number of records and
features. - Feature names and data types. - Missing-value summary. -
Descriptive statistics. - Target preparation-time distribution. -
Histograms for selected numerical features. - Categorical feature
distributions. - Feature correlation heatmap. - Scatter plots for
selected features against preparation duration. - Training, validation,
and test split summary.

Allow users to select a dataset or regenerate synthetic data using
configurable parameters. Clearly label the data source and generation
settings.

### C. Data Preprocessing

Show the preprocessing steps applied before training.

Include: - Missing-value handling, where required. - Categorical
encoding. - Numerical feature scaling where appropriate. - Feature
selection or engineering, if used. - Train/validation/test splitting. -
Pipeline configuration.

Show which preprocessing operations are applied to which models. Fit
transformations only on training data and apply the fitted
transformations to validation/test data to avoid leakage.

### D. Model Training and Configuration

Provide controls to: - Train an individual model. - Train all five
models. - View training progress and completion status. - Inspect
default hyperparameters. - Modify supported hyperparameters. - Retrain
models. - View training duration. - View the configuration and dataset
version associated with each run.

Use the same dataset split for all models in a comparison run.

Provide clear loading, success, and error states. Do not make the UI
appear to train a model when no backend training operation has occurred.

### E. Model Evaluation and Comparison

This is one of the most important sections of the application.

#### 1. Evaluation metrics comparison matrix

Display a table with one row per model and four metric columns:

  ------------------------------------------------------------------------
  Model           MAE (min) ↓   MSE (min²) ↓   RMSE (min) ↓           R² ↑
  ------------ -------------- -------------- -------------- --------------
  Linear           Calculated     Calculated     Calculated     Calculated
  Regression                                                

  KNN              Calculated     Calculated     Calculated     Calculated
  Regressor                                                 

  SVR-RBF          Calculated     Calculated     Calculated     Calculated

  Random           Calculated     Calculated     Calculated     Calculated
  Forest                                                    
  Regressor                                                 

  XGBoost          Calculated     Calculated     Calculated     Calculated
  Regressor                                                 
  ------------------------------------------------------------------------

All values must come from actual model evaluation results.

Highlight the best value in each metric column, respecting the direction
of the metric. Explain that the model with the best individual metric
may differ from the overall preferred model.

#### 2. Four separate metric charts

Create a separate interactive chart for each metric: - MAE comparison. -
MSE comparison. - RMSE comparison. - R² comparison.

Use consistent model labels and clearly show units and metric direction.

#### 3. Combined normalized performance heatmap

Create a five-model-by-four-metric heatmap.

Because the metrics use different scales and directions, normalize them
for visualization only. Explain the normalization method and ensure that
lower error metrics and higher R² are represented consistently as better
performance.

Keep the original metric values visible in the evaluation table. Do not
replace actual metric values with normalized scores.

#### 4. Actual versus predicted plots

For each model, provide a scatter plot of: - Actual preparation
duration. - Predicted preparation duration. - Ideal prediction line (y =
x).

Allow users to select a model and inspect its plot.

#### 5. Residual analysis

Include: - Residual distribution histogram. - Residuals versus predicted
values. - Residual summary statistics. - Optional residual plots by
workload category or dish type.

Use residuals to identify systematic overprediction, underprediction,
and errors that vary with workload.

#### 6. Model performance summary

Generate a concise, data-driven summary that identifies: - Best model by
MAE. - Best model by MSE. - Best model by RMSE. - Best model by R². - A
recommended model based on a clearly stated selection rule.

Do not automatically declare XGBoost the winner. Select the preferred
model using measured results and explain any trade-offs.

### F. Model Explainability

Provide an explainability section to help users understand why models
make particular predictions.

Include:

**Random Forest and XGBoost** - Feature importance charts. - SHAP
summary/beeswarm plots. - SHAP dependence plots for selected features. -
SHAP waterfall plot for an individual prediction.

**Other models** - Permutation feature importance or another suitable
model-agnostic explanation. - Individual prediction explanations where
feasible.

Explain that feature importance indicates influence within the fitted
model and does not necessarily establish causation.

For an individual order, show how features such as queue workload, dish
quantity, complexity, and staff availability influenced the prediction.

### G. Prediction Simulator

Build an interactive simulator where users can enter a hypothetical
restaurant situation.

Allow users to configure: - Dish type. - Quantity. - Dish complexity. -
Existing pending order count or workload. - Kitchen workload. -
Available staff. - Resource availability. - Time of day. - Other
supported model input features.

Allow the user to select one trained model or compare all five models on
the same input.

Display: - Each model's predicted preparation duration. - Difference
between model predictions. - Selected model's prediction. - The selected
model's explainability result, where available. - Clear indication of
the units. - Warnings if inputs are outside the training-data range.

The simulator must call the Python backend. Do not reproduce model
calculations in the frontend.

### H. Restaurant Queue and Scheduling Simulation

Connect the ML predictions to a separate Python scheduling algorithm.

The ML model predicts preparation duration for a dish or suitable
preparation task. The scheduling algorithm uses those predicted
durations together with the current queue and kitchen-resource
constraints to estimate when the complete customer order will be ready.

Consider: - Existing pending orders. - Order acceptance time. -
Remaining work on currently active tasks. - Kitchen resource
availability. - Resource capacities. - Dish-to-resource requirements. -
Preparation dependencies. - Parallel preparation possibilities. - A
transparent scheduling and prioritization policy.

Example kitchen resources: - Grill station. - Pizza oven. - Beverage
counter. - General preparation counter.

Do not simply add all dish preparation times if independent kitchen
resources can prepare items simultaneously. The complete customer order
is ready only when every item in that order is finished.

Display: - Queue position or scheduling order. - Resource allocation. -
Waiting time before each task starts. - Individual dish start and
completion times. - Total order readiness time. - Scheduling decisions
and assumptions.

Clearly distinguish predicted preparation duration from queue waiting
time.

### I. Algorithm Execution Visualization

Provide a step-by-step explanation of the complete prediction and
scheduling process.

Suggested sequence:

1.  Receive the new customer order.
2.  Extract and prepare model input features.
3.  Select the trained regression model.
4.  Predict preparation duration for the relevant dish or task.
5.  Inspect existing pending orders.
6.  Inspect kitchen resource availability.
7.  Apply the scheduling policy.
8.  Allocate resources and schedule preparation tasks.
9.  Simulate parallel preparation where possible.
10. Determine when every item in the new order is completed.
11. Calculate the final estimated readiness duration.
12. Display the final result and its explanation.

For each step, show: - Inputs being processed. - The operation being
performed. - Intermediate outputs. - Relevant model prediction or
scheduling decision. - How the step affects the final readiness
estimate.

Use an animated execution flow, status indicators, and an inspectable
calculation log. The visualization must be driven by actual backend
results rather than a decorative animation with fabricated values.

### J. Preparation Timeline

Create a timeline or Gantt-style visualization showing:

Order Placed → Queue Waiting → Preparation Starts → Individual Dish
Preparation → All Items Completed → Ready for Pickup.

Show overlapping task bars when different resources prepare dishes
simultaneously.

Display each task's: - Scheduled start time. - Predicted duration. -
Scheduled completion time. - Assigned kitchen resource.

The final order readiness time must correspond to the completion of the
last required item.

### K. Scenario Comparison

Provide predefined, hardcoded demonstration scenarios such as:

1.  Empty queue.
2.  Normal workload.
3.  Heavy restaurant rush.
4.  Multiple dishes in one order.
5.  Resource conflict.
6.  Limited kitchen capacity.
7.  High-complexity order.
8.  Reduced staff availability.

Each scenario should contain: - A new customer order. - Existing pending
orders. - Dish preparation requirements. - Kitchen resources and
capacities. - Workload conditions.

Allow users to run the same scenario using different trained models and
compare the resulting predictions and final readiness estimates.

All scenario outputs must be calculated by the backend. Any illustrative
values must be explicitly labelled as examples.

## 7. Model Selection Strategy

Provide a transparent way to choose the model used by the prediction
simulator and scheduling system.

Possible approaches: - User manually selects a trained model. -
Application recommends a model based on a documented evaluation rule. -
Application uses the model selected as best on a designated validation
metric.

Do not select a model using test-set performance and then report that
same test score as an unbiased final evaluation. Use validation results
for model selection and reserve the test set for final evaluation.

Show the selection rule and the metric values that support the
recommendation.

## 8. Backend and Project Architecture

Use Python for all data processing, model training, evaluation,
prediction, explainability calculations, and scheduling logic.

Use FastAPI to expose backend operations to the frontend.

Suggested project structure:

``` text
restaurant-ai-platform/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── charts/
│   │   ├── services/
│   │   └── App.jsx
│   └── package.json
│
├── backend/
│   ├── data/
│   │   ├── synthetic_dataset.csv
│   │   └── test_scenarios.json
│   │
│   ├── models/
│   │   ├── linear_regression.py
│   │   ├── knn_regressor.py
│   │   ├── svr_model.py
│   │   ├── random_forest.py
│   │   └── xgboost_model.py
│   │
│   ├── preprocessing/
│   │   └── pipeline.py
│   │
│   ├── evaluation/
│   │   ├── metrics.py
│   │   ├── comparison.py
│   │   └── residual_analysis.py
│   │
│   ├── explainability/
│   │   └── shap_analysis.py
│   │
│   ├── scheduling/
│   │   ├── queue_manager.py
│   │   ├── kitchen_scheduler.py
│   │   └── readiness_estimator.py
│   │
│   ├── data_generation/
│   │   └── synthetic_generator.py
│   │
│   ├── training/
│   │   └── train_models.py
│   │
│   ├── saved_models/
│   ├── main.py
│   └── requirements.txt
│
└── README.md
```

The structure may be adjusted where appropriate, but keep
responsibilities modular and separate.

### Suggested backend API endpoints

Design suitable REST endpoints, for example:

-   `GET /api/health` -- backend health.
-   `GET /api/dataset/summary` -- dataset information.
-   `GET /api/dataset/preview` -- dataset preview.
-   `POST /api/dataset/generate` -- generate synthetic data.
-   `POST /api/models/train` -- train one or all models.
-   `GET /api/models/status` -- model training status.
-   `GET /api/models/evaluation` -- retrieve the four evaluation
    metrics.
-   `GET /api/models/comparison` -- retrieve comparison results.
-   `GET /api/models/plots` -- retrieve chart-ready evaluation data.
-   `GET /api/models/explainability` -- retrieve feature importance or
    SHAP data.
-   `POST /api/predict` -- predict using a selected trained model.
-   `POST /api/predict/compare` -- compare all trained models for the
    same input.
-   `GET /api/scenarios` -- retrieve predefined scenarios.
-   `POST /api/simulate` -- run the prediction and scheduling
    simulation.

Use appropriate request validation and response schemas. The frontend
should obtain all calculated results from the backend.

## 9. Technology Stack

### Frontend

-   React.js.
-   Tailwind CSS.
-   Recharts or another suitable charting library.
-   Framer Motion for animations.

### Backend and ML

-   Python.
-   FastAPI.
-   Scikit-learn.
-   XGBoost.
-   Pandas.
-   NumPy.
-   SHAP.
-   Joblib for model persistence.

### Visualization and analysis

-   Recharts for interactive frontend charts.
-   Matplotlib and Seaborn for backend-generated analysis where
    appropriate.

### Initial storage

-   CSV and JSON files for synthetic datasets and scenarios.
-   Saved model artifacts for trained models.

### Future storage

-   PostgreSQL for persistent order, restaurant, and historical
    preparation records.

## 10. UI/UX Requirements

Create a polished, modern, professional analytics platform suitable for
an academic AI project presentation.

The application should feel like a combination of: - An ML experiment
and evaluation dashboard. - An interactive data science platform. - A
restaurant operations and scheduling simulator.

Prioritize: - Clear navigation. - Consistent design system. - Readable
charts and tables. - Interactive filters and model selectors. -
Responsive layouts. - Useful tooltips and metric explanations. - Clear
loading, error, and empty states. - Smooth but restrained animations. -
A clear distinction between measured results, synthetic data, and
illustrative examples.

Avoid decorative visualizations that do not represent actual data or
calculations.

## 11. Expected Deliverables

Deliver:

1.  A fully functional React frontend.
2.  A Python FastAPI backend.
3.  A synthetic dataset generator with documented assumptions.
4.  Five trained regression model implementations.
5.  A common preprocessing and evaluation pipeline.
6.  A model comparison matrix using MAE, MSE, RMSE, and R².
7.  Interactive metric charts and a normalized comparison heatmap.
8.  Actual-versus-predicted plots.
9.  Residual analysis.
10. Model explainability using feature importance and SHAP where
    appropriate.
11. An interactive prediction simulator.
12. Hardcoded restaurant demonstration scenarios.
13. A Python queue and kitchen scheduling algorithm.
14. A preparation timeline and final order readiness estimate.
15. A README explaining setup, architecture, datasets, models, metrics,
    assumptions, and limitations.

## 12. Critical Acceptance Criteria

The application is complete only when:

-   All five regression models can be trained through the backend.
-   All models are evaluated on the same held-out test records.
-   MAE, MSE, RMSE, and R² are calculated from actual predictions.
-   The evaluation table and charts use real calculated results.
-   The application identifies the best model separately for each
    metric.
-   The model-selection rule is transparent.
-   Data preprocessing does not leak information from the test set.
-   Users can compare model predictions for the same input.
-   Explainability results are based on actual fitted models.
-   The scheduling algorithm uses model-predicted preparation durations.
-   Existing queue and kitchen-resource constraints affect the final
    readiness estimate.
-   Parallel preparation is represented where resources permit.
-   The complete order is ready only when all its items are complete.
-   The final estimated readiness time is calculated by the Python
    backend.
-   The frontend does not fabricate model scores, predictions, or
    scheduling outcomes.
-   Synthetic data is clearly distinguished from real-world data.

## 13. Final Product Vision

The application must tell one connected story:

**Dataset → Data Preprocessing → Model Training → Model Evaluation →
Model Comparison → Model Explainability → Preparation-Time Prediction →
Kitchen Scheduling → Estimated Order Readiness.**

A user should be able to explore the dataset, train five different
regression models, compare them using four evaluation metrics,
understand why they make predictions, select a model, and see how its
predictions influence the restaurant's preparation schedule.

The most important principle is that this must be a genuinely
functioning ML application with an interactive visual explanation---not
merely a static dashboard displaying sample scores.

Build the application incrementally, validate the Python models and
scheduling logic independently, and then connect the frontend to the
backend.
