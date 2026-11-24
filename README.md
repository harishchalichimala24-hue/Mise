# CampusBites
### A Smart Food Ordering and Eatery Management System

CampusBites is a software engineering project focused on improving food ordering and kitchen operations in closed and semi-closed environments such as university campuses, institutional facilities, and managed food courts.

The project combines a customer-facing food ordering demonstration with an intelligent kitchen preparation-time estimation and scheduling system. Its central technical component predicts active food preparation duration using machine learning and estimates whole-order readiness by considering kitchen workload and available resources.

> **Current implementation:** The repository contains an academic working prototype of the kitchen intelligence system, together with a limited customer ordering demonstration. It is not a complete production-ready, multi-outlet food ordering platform.

---

## Project Information

| Field | Details |
|---|---|
| Project | CampusBites |
| Technical prototype name | Mise Kitchen Intelligence |
| Course | Software Engineering |
| Group | 28 |
| Section | C5 |
| Academic Year | 2026–27 |
| Faculty Mentor | Dr. Shreyansh Sharma |

### Project Team

| Team Member | Enrollment Number |
|---|---|
| Harish Chalichimala | BT24GCS038 |
| Ballani Sai kesava Santhos | BT24GCS078 |
| Kambam Rajeswar Reddy | BT24GCS043 |
| S. Mohit Anand | BT24GCS415 |

---

## 1. Problem Statement

In campus and other managed food environments, customers may need to choose between multiple eateries and often have limited visibility into how long their food will take to prepare.

Kitchen workload, pending orders, preparation dependencies, available staff, and station capacity can all influence the time required to complete an order.

CampusBites explores how food ordering can be connected with an intelligent kitchen management component to provide better visibility into order preparation and readiness.

## 2. Project Objectives

- Demonstrate a customer-facing food ordering workflow.
- Estimate food preparation duration using machine learning.
- Compare multiple regression models using standard evaluation metrics.
- Simulate kitchen scheduling based on available resources and pending workload.
- Estimate when all items in an order will be ready for pickup.
- Provide a versioned API through which another application can consume the readiness-estimation functionality.

## 3. Features and Modules

### 3.1 Customer Ordering Demonstration

The prototype includes a limited customer ordering workflow:

- Test-account login.
- Sample food and drink catalog.
- Product selection and quantity management.
- Shopping cart and order summary.
- Practice checkout and simulated payment confirmation.
- Local order persistence and retrieval.

This module demonstrates the basic customer journey. It does not connect to a real payment gateway.

### 3.2 Kitchen Intelligence

The kitchen component estimates preparation and order readiness using kitchen conditions and workload.

Its functionality includes:

- Dish-level active preparation-time estimation.
- Whole-order readiness estimation.
- Pending order and active task consideration.
- Cook and kitchen station availability.
- Resource capacity and task dependency handling.
- Scheduling of independent tasks in parallel when resources permit.

The estimated readiness time represents when the last required item in an order is completed and ready for pickup.

### 3.3 Machine Learning Model Laboratory

The model laboratory provides an environment to explore the dataset, train regression models, compare their performance, and inspect prediction behavior.

Five regression models are implemented:

1. Linear Regression
2. K-Nearest Neighbors Regressor
3. Support Vector Regression (RBF Kernel)
4. Random Forest Regressor
5. XGBoost Regressor

The models are evaluated using four metrics:

| Metric | Meaning |
|---|---|
| MAE | Mean Absolute Error |
| MSE | Mean Squared Error |
| RMSE | Root Mean Squared Error |
| R² | Coefficient of Determination |

The model with the lowest validation MAE is selected for prediction.

The prototype also includes feature-importance analysis, permutation importance, and prediction-explanation functionality.

### 3.4 Application Integration

The backend exposes a versioned readiness-estimation interface:

`POST /api/v1/estimate`

This interface allows an external application to submit the required order and kitchen information and receive a structured readiness estimate.

Refer to [INTEGRATION.md](INTEGRATION.md) for the request and response contract and integration guidance.

---

## 4. System Architecture

The current application follows a browser-based, layered client-server architecture.

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React, Vite | User interface, navigation, forms and visualizations |
| Backend | Python, FastAPI | API endpoints, application logic and validation |
| Machine Learning | scikit-learn, XGBoost | Dataset processing, model training, evaluation and prediction |
| Scheduling | Python | Kitchen task scheduling and readiness calculation |
| Persistence | SQLite | Local customer-order demonstration data |

### Architecture Overview

```text
                    CUSTOMER / USER
                           |
                           v
                 REACT FRONTEND (VITE)
                           |
                         HTTP
                           |
                           v
                  PYTHON / FASTAPI
                           |
           +---------------+----------------+
           |               |                |
           v               v                v
      ML PIPELINE     KITCHEN SCHEDULER   ORDERING
           |               |                |
           v               v                v
      REGRESSION       TASK ALLOCATION    SQLITE
       MODELS          AND READINESS      STORAGE
           |
           v
      MODEL EVALUATION
      AND EXPLANATIONS
```

---

## 5. Technology Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Python
- FastAPI

**Machine Learning and Data Processing**
- scikit-learn
- XGBoost
- NumPy
- Pandas
- Related scientific Python dependencies

**Database**
- SQLite

**Testing**
- Python `unittest`

---

## 6. Repository Structure

```text
CampusBites/
│
├── backend/
│   ├── dataset.py
│   ├── scheduler.py
│   ├── main.py
│   ├── order_readiness.py
│   ├── models.py
│   ├── store.py
│   ├── integration.py
│   ├── ordering.py
│   ├── bootstrap.py
│   ├── responses.py
│   └── scenarios.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── CustomerShop.jsx
│   │   ├── Lab.jsx
│   │   ├── Operations.jsx
│   │   ├── QuickEstimate.jsx
│   │   ├── ServiceReplay.jsx
│   │   ├── ShopKitchen.jsx
│   │   └── IntegrationGuide.jsx
│   ├── package.json
│   └── package-lock.json
│
├── tests/
│   ├── test_integration.py
│   ├── test_order_readiness.py
│   ├── test_ordering.py
│   ├── test_platform.py
│   └── test_scheduler.py
│
├── PROJECT-BRIEF.md
├── CUSTOMER-DEMO.md
├── INTEGRATION.md
├── Start Mise.cmd
├── launch.py
└── README.md
```

The repository also contains supporting frontend assets, styles, API clients, and backend modules.

Generated runtime data, local virtual environments, dependency folders, caches, and compiled frontend output are excluded from the source package and recreated when required.

---

## 7. Installation and Setup

### Prerequisites

Install the following:

- Windows 10/11, macOS, or Linux.
- Python 3.12.
- Node.js 22.12 or later.
- npm.
- Internet access for initial dependency installation.
- An available local TCP port `8765`.

The frontend uses React 19 and Vite 7. The backend uses FastAPI, scikit-learn, XGBoost, and related Python packages.

### Windows Setup

Open PowerShell in the repository root and execute:

```powershell
py -3.12 -m venv .venv

\.venv\Scripts\python.exe -m pip install --upgrade pip

\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt

Push-Location frontend
npm ci
npm run build
Pop-Location

\.venv\Scripts\python.exe -m backend.bootstrap
```

After the initial setup, launch the application using:

```powershell
\.venv\Scripts\python.exe launch.py
```

Alternatively, double-click:

```text
Start Mise.cmd
```

### macOS / Linux Setup

Open a terminal in the repository root:

```bash
python3.12 -m venv .venv

. .venv/bin/activate

python -m pip install --upgrade pip

python -m pip install -r backend/requirements-lock.txt

cd frontend
npm ci
npm run build
cd ..

python -m backend.bootstrap

python launch.py
```

### Accessing the Application

Once the backend service starts, open:

**http://127.0.0.1:8765/**

Keep the terminal running while using the application.

To stop the service, press `Ctrl+C` in the terminal.

---

## 8. Demonstration Account

The customer ordering demonstration includes fixed test accounts.

| Email | Password |
|---|---|
| `demo@mise.test` | `Kitchen123!` |
| `guest@mise.test` | `Welcome123!` |

These credentials are intended exclusively for the local academic demonstration. They are not production accounts and must not be reused for real services.

Refer to [CUSTOMER-DEMO.md](CUSTOMER-DEMO.md) for further details.

---

## 9. API Endpoints

The backend exposes application endpoints for health checks, dataset management, model training, prediction, scheduling, and customer ordering.

### General Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health check |
| GET | `/api/state` | Application state |
| GET | `/api/models/status` | Model status |
| GET | `/api/dataset/summary` | Dataset summary |
| POST | `/api/dataset/generate` | Generate a dataset |
| POST | `/api/dataset/select` | Select a dataset |
| POST | `/api/models/train` | Train regression models |
| GET | `/api/models/evaluation` | Retrieve evaluation results |
| GET | `/api/models/comparison` | Compare models |
| GET | `/api/models/explainability` | Retrieve model explanations |
| POST | `/api/predict` | Generate a prediction |
| POST | `/api/predict/compare` | Compare predictions |
| GET | `/api/scenarios` | Retrieve sample scenarios |
| POST | `/api/simulate` | Run a kitchen simulation |

### Integration Endpoint

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/estimate` | Estimate whole-order readiness |

### Customer Ordering Endpoints

The customer ordering routes are available under `/api/shop`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/shop/login` | Test-user login |
| POST | `/api/shop/logout` | End the demo session |
| GET | `/api/shop/me` | Retrieve the current user |
| GET | `/api/shop/kitchen` | Retrieve kitchen settings |
| POST | `/api/shop/kitchen` | Update kitchen settings |
| GET | `/api/shop/products` | Retrieve sample products |
| POST | `/api/shop/orders` | Place a demonstration order |
| GET | `/api/shop/orders/{order_id}` | Retrieve an order |

Interactive API documentation is available at:

**http://127.0.0.1:8765/docs**

---

## 10. Dataset and Machine Learning Workflow

The current prototype uses a synthetic dataset for model development and experimentation.

Default dataset configuration:

| Parameter | Value |
|---|---|
| Random seed | 42 |
| Noise standard deviation | 1.35 minutes |
| Number of records | 6,000 |
| Training partition | 70% |
| Validation partition | 15% |
| Test partition | 15% |

The workflow consists of:

1. Synthetic dataset generation.
2. Data exploration and preprocessing.
3. Train, validation, and test partitioning.
4. Regression model training.
5. Model evaluation using MAE, MSE, RMSE, and R².
6. Model selection based on validation MAE.
7. Prediction and explainability.

The use of shared data partitions helps maintain consistency when comparing the models.

**Important:** Since the current dataset is synthetic, evaluation scores indicate how well the models reproduce patterns represented by the synthetic data. They do not establish prediction accuracy in real restaurant environments.

---

## 11. Running Automated Tests

The repository includes automated backend tests covering:

- Platform behavior.
- Kitchen scheduling.
- Order readiness estimation.
- Customer ordering.
- API integration.

Run the complete test suite from the repository root.

**Windows PowerShell**

```powershell
\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

**macOS / Linux**

```bash
.venv/bin/python -m unittest discover -s tests -v
```

The academic verification run recorded 46 passing automated tests and zero failures. The verification environment used Python 3.13, while the documented project rebuild requirement is Python 3.12.

A fresh test run should be performed in the target installation environment.

---

## 12. Current Implementation Scope and Limitations

The following distinctions are important when interpreting the project.

### Implemented in the Current Prototype

- React-based web interface.
- Python/FastAPI backend.
- Synthetic dataset generation and exploration.
- Five regression model implementations.
- Model comparison using four evaluation metrics.
- Prediction and explainability functionality.
- Kitchen scheduling simulation.
- Whole-order readiness estimation.
- Versioned integration API.
- Limited customer ordering demonstration.
- Local SQLite persistence.
- Automated backend test suite.

### Outside the Current Implementation

- Complete production multi-outlet management.
- Production customer onboarding and account management.
- Real payment gateway integration.
- Training and validation using real restaurant preparation records.
- Live POS, printer, kiosk, sensor, or kitchen hardware integration.
- Production workforce management.
- Production multi-tenant architecture and horizontally scaled deployment.
- Validated real-world restaurant prediction guarantees.

### Readiness Estimate Interpretation

The system estimates food preparation completion and the time when all items in an order are ready for pickup.

It does not calculate:

- Delivery-person travel time.
- GPS distance.
- Delivery duration.
- A recommended time for the customer to leave for the eatery.

---

## 13. Additional Project Documentation

The repository includes supporting documentation:

| File | Description |
|---|---|
| [PROJECT-BRIEF.md](PROJECT-BRIEF.md) | Project specification and implementation context |
| [CUSTOMER-DEMO.md](CUSTOMER-DEMO.md) | Instructions for the customer ordering demonstration |
| [INTEGRATION.md](INTEGRATION.md) | Readiness API contract and integration guidance |

---

## 14. Future Development Direction

The broader CampusBites concept can be extended beyond the current academic prototype.

Potential future development areas include:

- Collecting real kitchen preparation records for model training and validation.
- Improving prediction reliability across different kitchen conditions.
- Supporting complete multi-outlet food ordering workflows.
- Introducing production customer and vendor management.
- Integrating secure payment processing.
- Connecting with restaurant POS systems and kitchen operations.
- Planning production deployment, monitoring, security, and scalability.

These are future development directions and should not be interpreted as capabilities already implemented in this repository.

---

## Project Scope Statement

CampusBites demonstrates how machine learning, kitchen scheduling, and a customer ordering workflow can be brought together within a software application for managed food environments.

The current implementation focuses on demonstrating the technical feasibility of preparation-time prediction, resource-aware scheduling, whole-order readiness estimation, and application integration.

It provides a foundation for the broader CampusBites product vision while maintaining a clear distinction between the working academic prototype and future production capabilities.
