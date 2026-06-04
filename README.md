# KosmoInsight 🏥

<div align="center">

![KosmoInsight Banner](https://img.shields.io/badge/KosmoInsight-Smart%20Health%20Analytics-blue?style=for-the-badge&logo=heart&logoColor=white)

**Africa's Smart Health & PayGo Analytics Dashboard**

[![Live Demo](https://img.shields.io/badge/🚀%20Live%20Demo-kosmoinsight.vercel.app-green?style=for-the-badge)](https://kosmoinsight.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-336791?style=for-the-badge&logo=postgresql)](https://supabase.com/)

**Built by [Samson Niyizurugero](https://github.com/samson19977)**

</div>

---

## ✨ Features

- 📊 **Real-time Analytics** — Interactive dashboards with charts and KPIs
- 🔐 **Role-Based Access Control** — Admin, Staff, and Analyst roles
- 💳 **PayGo Payment Tracking** — Monitor customer payment sessions
- 🤖 **AI-Powered Insights** — Smart health and business recommendations
- 📱 **Fully Responsive** — Works on desktop and mobile
- ⚡ **Fast & Modern** — Built with Next.js 16 App Router and Tailwind CSS

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Charts | Recharts |
| Backend | FastAPI, SQLAlchemy |
| Database | PostgreSQL (Supabase) |
| Auth | JWT Tokens |
| Deployment | Vercel (Frontend) |

---

## 🚀 Live Demo

👉 **[https://kosmoinsight.vercel.app/](https://kosmoinsight.vercel.app/)**

| Role | Email | Password |
|------|-------|----------|
| 🔴 Admin | admin@kosmotive.rw | admin123 |
| 🟡 Staff | grace@kosmotive.rw | staff123 |
| 🟢 Analyst | eric@kosmotive.rw | analyst123 |

---

## 🖥️ Local Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- Git

### 1. Clone the repo
```bash
git clone https://github.com/samson19977/kosmoinsight.git
cd kosmoinsight
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:
```env
DATABASE_URL=your_postgresql_url
SECRET_KEY=your_secret_key
CORS_ORIGINS=http://localhost:3000
```

```bash
python seed.py
uvicorn app.main:app --reload --port 8000
```

Backend running at → **http://localhost:8000**
API Docs at → **http://localhost:8000/docs**

### 3. Frontend Setup
```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
npm run dev
```

App running at → **http://localhost:3000** ✅

---

## 📁 Project Structure

```
kosmoinsight/
├── backend/
│   ├── app/
│   │   ├── api/        # Route handlers
│   │   ├── models/     # Database models
│   │   ├── schemas/    # Pydantic schemas
│   │   └── main.py     # FastAPI entry point
│   ├── seed.py         # Database seeder
│   └── requirements.txt
└── frontend/
    ├── app/            # Next.js App Router pages
    ├── components/     # Reusable UI components
    └── lib/            # Utilities and API calls
```

---

## 👨‍💻 Author

**Samson Niyizurugero**

[![GitHub](https://img.shields.io/badge/GitHub-samson19977-181717?style=flat&logo=github)](https://github.com/samson19977)

---

<div align="center">

⭐ If you found this project useful, please give it a star!

</div>
