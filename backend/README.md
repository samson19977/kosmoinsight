# Kosmotive Backend — KosmoPads Rwanda

Express + TypeScript backend for the KosmoPads PAYG e-commerce platform.  
Connects to **Supabase PostgreSQL**, sends emails via **Nodemailer (Gmail)**, and processes payments via **MTN MoMo API**.

**What changed in this update:**
- Products and orders now persist to **Supabase Postgres** via Drizzle (previously they lived in an in-memory array and were wiped every time the server restarted).
- New **admin login** (JWT, bcrypt-hashed passwords) protects every admin/dashboard endpoint.
- New **`GET /api/admin/dashboard`** endpoint: revenue (today / 7d / 30d / all-time), average order value, orders & payments by status, a 14-day revenue trend, top products by revenue, recent orders, and an "awaiting payment confirmation" queue.
- New **admin dashboard UI** at `/admin` — a self-contained page (login form + charts + tables) that calls the API above. No separate frontend project needed to see the numbers.
- Real product photos are now served from `/images/*.png` and seeded into the `products` table (matching the live catalogue on kosmopads.rw).
- `PATCH /api/orders/:orderNumber/status` to move an order through pending → confirmed → processing → shipped → delivered.

---

## 🚀 Quick Start (local)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and fill in your credentials
cp .env.example .env
# → Edit .env with your real values (Supabase DATABASE_URL is the important one)

# 3. Create the tables in Supabase
npm run db:push

# 4. Seed the real product catalogue + create your first admin login
npm run db:seed
# → creates admin: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env
#   (defaults to admin@kosmotive.rw / ChangeMe123! if not set — change this!)

# 5. Start the dev server
npm run dev
# API:       http://localhost:3000/api
# Dashboard: http://localhost:3000/admin
```

Log into `/admin` with the email/password you set as `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

---

## 📡 API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/products` | List active products |
| GET | `/api/products/:id` | Get single product |
| POST | `/api/products` 🔒 | Add a product (admin) |
| PATCH | `/api/products/:id` 🔒 | Update price/stock/description/active (admin) |
| POST | `/api/orders` | Create a new order |
| GET | `/api/orders/:orderNumber/status` | Get order status (public tracking) |
| GET | `/api/orders` 🔒 | List all orders (admin) |
| PATCH | `/api/orders/:orderNumber/confirm-payment` 🔒 | Confirm payment (admin) |
| PATCH | `/api/orders/:orderNumber/status` 🔒 | Update fulfilment status (admin) |
| POST | `/api/payments/momo/initiate` | Initiate MoMo payment |
| GET | `/api/payments/momo/status/:referenceId` | Check MoMo payment status |
| POST | `/api/payments/instructions` | Get manual payment instructions |
| POST | `/api/webhooks/momo` | MTN MoMo webhook callback |
| POST | `/api/test/email` | Send a test email |
| POST | `/api/admin/login` | Admin login → returns a JWT |
| GET | `/api/admin/me` 🔒 | Verify current admin session |
| GET | `/api/admin/dashboard` 🔒 | Revenue & business analytics (see below) |
| GET | `/admin` | The dashboard UI (login + charts) |

🔒 = requires `Authorization: Bearer <token>` from `/api/admin/login`.

### What `/api/admin/dashboard` returns

```json
{
  "revenue": { "today": 0, "last7Days": 0, "last30Days": 0, "allTime": 0, "averageOrderValueRwf": 0 },
  "counts": { "totalOrders": 0, "totalPaidOrders": 0, "totalCustomers": 0, "totalActiveProducts": 6, "pendingPaymentConfirmations": 0 },
  "ordersByStatus": { "pending": 0, "confirmed": 0 },
  "paymentsByStatus": { "pending": 0, "paid": 0 },
  "revenueTrend14Days": [ { "date": "2026-07-12", "revenueRwf": 0, "orders": 0 } ],
  "topProducts": [ { "name": "Medium Package", "quantity": 0, "revenueRwf": 0 } ],
  "recentOrders": [ ],
  "pendingConfirmation": [ ]
}
```

---

## 📦 Create Order — Request Body

```json
{
  "customer": {
    "firstName": "Amina",
    "lastName": "Uwase",
    "phone": "0788123456",
    "email": "amina@example.com",
    "district": "Kigali",
    "village": "Kimironko"
  },
  "items": [
    { "name": "Large Package", "quantity": 1, "price": 2000 }
  ],
  "paymentMethod": "Mobile Money (MTN / Airtel)",
  "notes": "Please deliver in the evening"
}
```

---

## 🗄️ Database (Supabase)

```bash
# Push schema (create tables in Supabase)
npm run db:push

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

Tables created: `products`, `customers`, `orders`, `order_items`, `payments`

---

## 🌐 Deploy to Render (Free)

1. Push this folder to GitHub:
   ```bash
   git init
   git add .
   git commit -m "initial backend"
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

2. Go to [render.com](https://render.com) → **New Web Service** → Connect your GitHub repo

3. Render auto-detects `render.yaml` — just set your secret environment variables in the Render dashboard:
   - `DATABASE_URL`
   - `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `ADMIN_EMAIL`
   - `MOMO_API_KEY`, `MOMO_API_SECRET`, `MOMO_SUBSCRIPTION_KEY`, `MOMO_MERCHANT_CODE`
   - `JWT_SECRET` — use a long random string, not the placeholder
   - `ALLOWED_ORIGINS` (your frontend URL, e.g. `https://kosmopads.rw`)
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (used only when you run the seed once — pick a real password)

4. Click **Deploy** — Render will build and start the server automatically.

5. After the first deploy, run the schema push + seed once (Render Shell tab, or locally against the same `DATABASE_URL`):
   ```bash
   npm run db:push
   npm run db:seed
   ```

6. Health check URL: `https://your-app.onrender.com/api/health`
   Dashboard: `https://your-app.onrender.com/admin`

---

## 📧 Gmail Setup (App Password)

1. Enable 2-Factor Authentication on your Google account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create an App Password for "Mail"
4. Copy the 16-character password → paste as `SMTP_PASS` in `.env`

---

## 📱 MTN MoMo Setup

- Sandbox: Use [momodeveloper.mtn.com](https://momodeveloper.mtn.com) to get credentials
- Production: Apply for production access via MTN Rwanda
- The backend gracefully falls back to **manual payment instructions** (USSD code) if the MoMo API is not reachable

---

## 🧪 Test Locally

```bash
# Health check
curl http://localhost:3000/api/health

# Send test email
curl -X POST http://localhost:3000/api/test/email \
  -H "Content-Type: application/json" \
  -d '{"to":"you@gmail.com","message":"Hello from Kosmotive!"}'

# Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "firstName": "Amina",
      "lastName": "Uwase",
      "phone": "0788536350",
      "email": "amina@example.com"
    },
    "items": [{"name":"Large Package","quantity":1,"price":2000}],
    "paymentMethod": "Mobile Money (MTN / Airtel)"
  }'
```

---

## 🗂️ Project Structure

```
kosmotive-backend/
├── public/
│   ├── admin/index.html           ← Admin dashboard UI (served at /admin)
│   └── images/*.png               ← Real product photos (served at /images/*.png)
├── src/
│   ├── app.ts                     ← Express app entry point
│   ├── config/
│   │   └── database.ts            ← Drizzle + Supabase pool
│   ├── db/
│   │   ├── schema/index.ts        ← Drizzle table definitions (+ admins table)
│   │   └── seed.ts                ← Seeds products + first admin account
│   ├── services/
│   │   ├── email.service.ts       ← Nodemailer email service
│   │   └── momo.service.ts        ← MTN MoMo payment service
│   ├── routes/
│   │   ├── products.ts            ← DB-backed, admin can add/update
│   │   ├── orders.ts               ← DB-backed (was in-memory before)
│   │   ├── payments.ts
│   │   ├── admin-auth.ts          ← POST /login, GET /me
│   │   └── admin-dashboard.ts     ← GET /api/admin/dashboard
│   ├── middleware/
│   │   ├── validate.ts            ← Zod validation middleware
│   │   └── auth.ts                ← JWT requireAdmin middleware
│   └── lib/
│       └── validation/
│           └── schemas.ts         ← All Zod schemas
├── .env.example                   ← Copy to .env and fill values
├── .gitignore
├── drizzle.config.ts
├── package.json
├── render.yaml                    ← Render deployment config
├── tsconfig.json
└── README.md
```
