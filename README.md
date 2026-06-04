# KosmoInsight

Smart Health & PayGo Analytics Dashboard built with Next.js and FastAPI.

## Tech Stack
- **Frontend:** Next.js 16, TypeScript, Tailwind CSS, Recharts
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL (Supabase)
- **Auth:** JWT with role-based access (Admin, Staff, Analyst)

## Local Setup

### Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
# Create .env file with DATABASE_URL and SECRET_KEY
python seed.py
uvicorn app.main:app --reload --port 8000

### Frontend
cd frontend
npm install
# Create .env.local with NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev

## Login Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@kosmotive.rw | admin123 |
| Staff | grace@kosmotive.rw | staff123 |
| Analyst | eric@kosmotive.rw | analyst123 |