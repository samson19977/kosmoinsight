# KosmoInsight AI — Backend v2.0

**FastAPI · PostgreSQL · Redis · Celery · WebSocket**

PayGo + Credit + Payment Tracking SaaS backend for East Africa.

---

## What's New in v2

| Feature | v1 | v2 |
|---|---|---|
| Installment schedule generation | ❌ | ✅ Auto-generate daily/weekly/monthly |
| Mobile money abstraction | ❌ | ✅ MTN MoMo / Airtel stubs, plug-in ready |
| Notification engine | ❌ | ✅ SMS / Email / WhatsApp / in-app queue |
| Celery background workers | ❌ | ✅ Reminders, risk recalc, overdue detection |
| Audit logging | ❌ | ✅ Every create/update/delete tracked |
| Rate limiting | ❌ | ✅ Per-IP, configurable |
| API versioning | ❌ | ✅ `/api/v1/` (old `/api/` still works) |
| WebSocket dashboard | ❌ | ✅ `/ws/dashboard` |
| Debt tracking (auto-sync) | ❌ | ✅ `total_debt` updated on every payment |
| User management | basic | ✅ Admin CRUD, last login, activate/deactivate |
| Product stock alerts | ❌ | ✅ `low_stock_alert` threshold per product |
| Docker-ready | ❌ | ✅ Dockerfile + docker-compose |

---

## Quick Start

```bash
# 1. Copy env file
cp .env.example .env
# Edit .env — set DATABASE_URL, SECRET_KEY, etc.

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run API
uvicorn app.main:app --reload

# 4. (Optional) Run background workers (requires Redis)
celery -A app.workers.celery_app worker --loglevel=info
celery -A app.workers.celery_app beat --loglevel=info
```

Or with Docker:
```bash
docker-compose up --build
```

API docs: http://localhost:8000/docs

---

## Project Structure

```
app/
├── api/
│   ├── auth.py           # Register, login, user management
│   ├── customers.py      # Customer CRUD + debt summary
│   ├── payments.py       # Payment recording + mobile money hook
│   ├── installments.py   # PayGo schedule generation (NEW)
│   ├── products.py       # Product + distribution + stock alerts
│   ├── health.py         # Health sessions + attendance
│   ├── analytics.py      # Dashboard, trends, insights
│   ├── predictions.py    # AI risk scoring + demand forecast
│   ├── notifications.py  # Notification queue (NEW)
│   ├── audit.py          # Audit trail (NEW)
│   ├── uploads.py        # CSV/Excel bulk import
│   └── reports.py        # CSV export + donor/KPI reports
│
├── models/
│   └── __init__.py       # All SQLAlchemy models
│
├── schemas/
│   └── __init__.py       # All Pydantic schemas
│
├── services/
│   ├── payment_provider.py   # MTN / Airtel / Bank abstraction (NEW)
│   └── notification.py       # SMS / Email / WhatsApp dispatcher (NEW)
│
├── workers/
│   ├── celery_app.py     # Celery + Beat scheduler (NEW)
│   └── tasks.py          # Background job definitions (NEW)
│
├── middleware/
│   └── rate_limit.py     # slowapi rate limiter (NEW)
│
├── auth.py               # JWT + role guards + audit helper
├── database.py           # Engine + session
└── main.py               # FastAPI app, routers, WebSocket
```

---

## API Endpoints (v1)

All routes available at `/api/v1/` (and legacy `/api/` for backward compat).

### Auth
- `POST /auth/register` — create user
- `POST /auth/login` — get JWT token
- `GET  /auth/me` — current user
- `GET  /auth/users` — list users (admin)
- `PATCH /auth/users/{id}` — update user (admin)

### Customers
- `GET  /customers/` — list with filters (search, region, status, risk)
- `POST /customers/` — create (staff+)
- `GET  /customers/{id}` — detail with payment summary
- `PATCH /customers/{id}` — update
- `DELETE /customers/{id}` — admin only
- `GET  /customers/{id}/payments` — payment history
- `GET  /customers/{id}/installments` — installment schedule

### Payments
- `GET  /payments/` — list (filter by customer, status, method)
- `POST /payments/` — record payment
- `PATCH /payments/{id}` — update
- `DELETE /payments/{id}` — admin only
- `POST /payments/initiate-mobile-money` — trigger MTN/Airtel payment

### Installments (NEW)
- `POST /installments/generate` — auto-generate schedule
- `GET  /installments/` — list with overdue filter
- `PATCH /installments/{id}/mark-paid` — mark as paid
- `GET  /installments/overdue-summary` — overdue by customer

### Analytics
- `GET /analytics/dashboard` — full dashboard stats
- `GET /analytics/revenue-trend` — monthly revenue (N months)
- `GET /analytics/repayment-trend` — repayment rate over time
- `GET /analytics/risk-distribution` — risk chart data
- `GET /analytics/region-distribution` — by region
- `GET /analytics/product-performance` — revenue by product
- `GET /analytics/ai-insights` — smart text insights
- `GET /analytics/debt-collection-summary` — debt overview

### AI Predictions
- `POST /predict/repayment-risk` — score one customer
- `POST /predict/batch-risk-update` — recalculate all
- `POST /predict/demand-forecast` — product demand forecast
- `GET  /predict/segmentation` — Champions/At Risk/High Risk/New
- `GET  /predict/prediction-history?customer_id=` — past predictions

### Notifications (NEW)
- `GET  /notifications/` — list queue
- `POST /notifications/` — manually queue
- `GET  /notifications/unread-count` — badge count

### Audit (NEW)
- `GET /audit/` — full audit trail (admin only)

### Reports
- `GET /reports/summary` — JSON KPI report
- `GET /reports/summary/csv` — download KPIs as CSV
- `GET /reports/customers/csv` — all customers CSV
- `GET /reports/payments/csv` — all payments CSV
- `GET /reports/donor` — donor/impact report

---

## Payment Provider Integration

To plug in MTN MoMo:
1. Get credentials from https://momodeveloper.mtn.com/
2. Add to `.env`: `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`, `ACTIVE_PROVIDER=mtn_momo`
3. Implement `MTNMoMoProvider.initiate_payment()` in `app/services/payment_provider.py`

Same pattern for Airtel Money.

---

## Role Permissions

| Action | Admin | Staff | Analyst |
|---|---|---|---|
| View all data | ✅ | ✅ | ✅ |
| Create customers/payments | ✅ | ✅ | ❌ |
| Update records | ✅ | ✅ | ❌ |
| Delete records | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |
