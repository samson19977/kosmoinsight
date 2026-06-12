# KosmoInsight Frontend — v2 Upgrade Changelog

## What changed and why

### New pages (3)

#### `/dashboard/installments`
- Full PayGo schedule viewer — list all installments with filters by customer and status
- "Generate Schedule" modal — pick customer, total amount, installment count, frequency, start date
- Live per-installment "Mark Paid" button with amount prompt
- Overdue summary card: top overdue customers with amounts
- KPIs: total schedules, paid, pending, missed, total collected vs due

#### `/dashboard/notifications`
- Queue viewer for SMS / email / WhatsApp / in-app notifications
- Channel breakdown widget (4 counters)
- "New Notification" modal with channel selector, customer search, message field, and quick templates
- Failed notifications alert with setup guidance

#### `/dashboard/audit` *(admin only)*
- Full audit trail table: action, resource, ID, user email, IP address, detail, timestamp
- Admin-only route guard — non-admin users are redirected automatically
- Recent activity card (last 10 events, color-coded)
- Filter by action type and resource; free-text search

---

### Updated: `lib/api.ts`
- All routes now use `/api/v1/*` (backend v2 prefix)
- New API groups: `api.installments`, `api.notifications`, `api.audit`, `api.users`
- `api.products` extended: `lowStock()`, `update()`, `delete()`
- HTTP 429 (rate limit) now shows a human-readable error
- `connectDashboardWS()` helper for WebSocket live updates
- All TypeScript types updated for v2 models: `Installment`, `OverdueSummary`, `Notification`, `AuditLog`, `User`
- `DashboardStats` extended: `outstanding_debt`, `overdue_installments`, `medium_risk_count`

---

### Updated: `lib/auth-context.tsx`
- Login endpoint changed to `/api/v1/auth/login`

---

### Updated: `components/ui.tsx`
- Sidebar nav now includes Installments (📅), Notifications (🔔), and Audit Log (🔍 — admin only)
- Notification bell badge: polls `/api/v1/notifications/unread-count` every 60 seconds; shows red badge with count
- Admin-only nav items only appear when `user.role === "admin"`
- New components: `EmptyState`, `ErrorBanner`
- `Btn` now accepts `size="sm"` for compact table actions
- `Card` now accepts an optional `action` prop (renders a button/element top-right)

---

### Updated: `app/dashboard/page.tsx`
- WebSocket connection to `/ws/dashboard` — stats update live when backend pushes changes
- Three new KPI cards (conditionally shown when data > 0):
  - Outstanding Debt (💸)
  - Overdue Installments (⏰)
  - Medium Risk Count (⚡)

---

### Unchanged pages (kept as-is, API paths auto-updated)
- `/dashboard/customers` — no changes needed
- `/dashboard/paygo` — no changes needed
- `/dashboard/health` — no changes needed
- `/dashboard/ai` — no changes needed
- `/dashboard/upload` — upload endpoint patched to `/api/v1/uploads/customers`
- `/dashboard/reports` — no changes needed
- `/app/login` — no changes needed

---

## How to run

```bash
cd frontend_v2
npm install
npm run dev
```

Make sure `.env.local` has:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
