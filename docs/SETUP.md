# KosmoInsight AI — Complete Setup & Deployment Guide

## 🚀 Quick Start (Local Development)

### Prerequisites
- Python 3.10+
- Node.js 18+
- Git

---

## STEP 1 — Clone & Set Up Backend

```bash
git clone https://github.com/YOUR_USERNAME/kosmoinsight.git
cd kosmoinsight/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Seed sample data
python seed.py

# Run the API server
uvicorn app.main:app --reload --port 8000
```

API is now live at: http://localhost:8000
Interactive docs: http://localhost:8000/docs

**Default login credentials:**
- Admin: admin@kosmotive.rw / admin123
- Staff: grace@kosmotive.rw / staff123
- Analyst: eric@kosmotive.rw / analyst123

---

## STEP 2 — Set Up Frontend

```bash
cd ../frontend

# Create Next.js app (if starting fresh)
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir

# Install additional dependencies
npm install recharts @radix-ui/react-dialog lucide-react axios

# Set environment variable
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Copy the source files from this project into src/
# Then run:
npm run dev
```

Frontend at: http://localhost:3000

---

## STEP 3 — Deploy Backend to Render (FREE)

1. Push your code to GitHub
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repository
4. Configure:
   - **Name**: kosmoinsight-api
   - **Root Directory**: backend
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt && python seed.py`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add Environment Variables:
   - `SECRET_KEY` = (generate a random 32-char string)
   - `DATABASE_URL` = sqlite:///./kosmoinsight.db
6. Click **Create Web Service**

Your API URL will be: `https://kosmoinsight-api.onrender.com`

---

## STEP 4 — Deploy Frontend to Vercel (FREE)

1. Go to https://vercel.com → New Project
2. Import your GitHub repository
3. Set Root Directory to `frontend`
4. Add Environment Variable:
   - `NEXT_PUBLIC_API_URL` = https://kosmoinsight-api.onrender.com
5. Click **Deploy**

Your app will be live at: `https://kosmoinsight.vercel.app`

---

## Environment Variables Reference

### Backend (.env)
```
SECRET_KEY=your-super-secret-key-here-min-32-chars
DATABASE_URL=sqlite:///./kosmoinsight.db
CORS_ORIGINS=https://kosmoinsight.vercel.app
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://kosmoinsight-api.onrender.com
```

---

## API Endpoints Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/auth/login | POST | Login (returns JWT) |
| /api/auth/register | POST | Register new user |
| /api/auth/me | GET | Get current user |
| /api/customers | GET | List all customers |
| /api/customers | POST | Add customer |
| /api/customers/{id} | PATCH | Update customer |
| /api/customers/{id}/payments | GET | Customer payment history |
| /api/payments | GET | All payments |
| /api/analytics/dashboard | GET | KPI stats |
| /api/analytics/revenue-trend | GET | Monthly revenue |
| /api/analytics/ai-insights | GET | AI-generated insights |
| /api/predict/repayment-risk | POST | Risk prediction |
| /api/predict/batch-risk-update | POST | Batch update all risk scores |
| /api/predict/demand-forecast | POST | Demand forecast |
| /api/predict/segmentation | GET | Customer segments |
| /api/uploads/customers | POST | Upload CSV of customers |
| /api/reports/summary | GET | KPI summary report |
| /api/reports/donor | GET | Donor impact report |

---

## Project Structure

```
kosmoinsight/
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI app entry
│   │   ├── database.py          ← SQLAlchemy engine
│   │   ├── auth.py              ← JWT utilities
│   │   ├── models/
│   │   │   └── __init__.py      ← All DB models
│   │   ├── schemas/
│   │   │   └── __init__.py      ← Pydantic schemas
│   │   └── api/
│   │       ├── auth.py
│   │       ├── customers.py
│   │       ├── payments.py
│   │       ├── products.py
│   │       ├── health.py
│   │       ├── analytics.py
│   │       ├── predictions.py
│   │       ├── uploads.py
│   │       └── reports.py
│   ├── seed.py                  ← Sample data seeder
│   └── requirements.txt
└── frontend/
    └── src/
        ├── lib/
        │   ├── api.ts            ← API client
        │   └── auth-context.tsx  ← Auth provider
        └── app/                  ← Next.js pages
```

---

## Testing with curl

```bash
# Login
curl -X POST http://localhost:8000/api/auth/login \
  -d "username=admin@kosmotive.rw&password=admin123"

# Get dashboard stats (replace TOKEN)
curl http://localhost:8000/api/analytics/dashboard \
  -H "Authorization: Bearer TOKEN"

# Add a customer
curl -X POST http://localhost:8000/api/customers \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Customer","phone":"0781234567","region":"Kigali","product_type":"Menstrual Cup"}'

# Run demand forecast
curl -X POST http://localhost:8000/api/predict/demand-forecast \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_type":"menstrual_health","periods":3}'
```
