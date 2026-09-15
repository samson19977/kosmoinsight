# KosmoPads Backend

Express + TypeScript backend for **kosmopads.rw** — Kosmotive's e-commerce
platform for reusable sanitary pads, including **PayGo**, an embedded
installment-financing feature.

Three channels (web, USSD, and field agents) all call the same order and
loan logic, so a sale is recorded and reconciled identically no matter
where it came from.

For the full architecture, database schema, API reference, checkout/PayGo
flow diagrams, and the security write-up, see the project's technical
documentation (kept outside this repo today — see "Documentation" below
for where that should live).

## Stack

- **Runtime:** Express + TypeScript, deployed on Render
- **Database:** PostgreSQL (Supabase), via Drizzle ORM
- **Payments:** MTN MoMo Collections API
- **Email:** Resend · **SMS:** dedicated gateway
- **Validation:** Zod on every mutating endpoint
- **Auth:** bcrypt password hashing, scope-tagged JWTs (admin vs. agent)

## Getting started

```bash
npm install
cp .env.example .env   # fill in real credentials — never commit .env
npm run dev             # local dev server
npm run build            # production build (tsc)
npm test                 # run the test suite (vitest)
npm run db:generate      # generate a drizzle migration after a schema change
npm run db:migrate       # apply pending migrations
```

## Project layout

```
src/
  app.ts              Express app: middleware, webhook handlers, startup
  db/schema/          Drizzle schema — 18 tables (see below)
  lib/                Pure, dependency-free logic — loan math, encryption,
                       rate limiting, validation schemas, logger
  middleware/         Auth (admin/agent JWT), rate limiting
  routes/             One file per resource — thin, calls into services/
  services/           Business logic — loans, payments, agents, ledger,
                       credit scoring, MoMo/email/SMS integration
drizzle/              Generated SQL migrations (never hand-edit these)
tests/                Vitest unit tests
```

## Database (18 tables)

Grouped by purpose:

- **Catalogue & sales** — `products`, `orders`, `order_items`, `payments`
- **PayGo lending** — `loans`, `installments`, `loan_transactions`, `loan_agreements`
- **Customers & identity** — `customers`, `rw_districts`/`rw_sectors`/`rw_cells`/`rw_villages`
- **Agents** — `agents`, `agent_commissions`
- **Back office & audit** — `admins`, `stock_movements`, `admin_audit_log`, `ledger_entries`, `settings`

Every account balance (agent commission owed, ledger balance, revenue) is
computed live with a `SUM(...)` over its source rows — none of it is a
separately-stored running total that could drift out of sync.

## Key design decisions

**No stored procedures.** All business logic lives in the TypeScript
service layer via Drizzle ORM rather than in the database. This is a
deliberate choice, not an oversight: application-layer logic is easier to
unit-test, code-review, and version alongside the rest of the codebase
than SQL stored procedures would be. The trade-off is accepted; nothing
here needs the transactional guarantees only a stored procedure could
give (row-level locking inside a service-layer transaction covers the
one case — PayGo loan creation — where a race condition genuinely
mattered).

**No message queue.** MoMo webhook processing and email/SMS sending are
synchronous/inline rather than going through Redis/BullMQ/SQS. Fine at
current volume; if webhook or notification volume grows enough that a
slow downstream call starts blocking request handling, that's the signal
to introduce one — not before.

**Payment confirmation is atomic and idempotent by construction**, not by
convention. A payment can be confirmed from four independent triggers
(MoMo webhook, the customer's status poll, the order-status page
self-healing, or an admin manual confirm) — the database transition that
marks an order/installment paid only succeeds once, so whichever trigger
arrives first wins and the rest are safe no-ops.

## Testing

`tests/loanMath.test.ts` covers the PayGo calculation core: down
payment/interest math, installment-schedule rounding (the classic "does
this sum back to the total exactly" bug), and the late-payment penalty
calculation — extracted into `src/lib/loanMath.ts` specifically so this
logic is testable without a live database.

This is a starting point, not full coverage. The next-highest-value
additions are the payment-reconciliation atomicity logic and the PayGo
sequencing/fraud-check guards in `loan.service.ts`, both of which
currently are only exercised end-to-end.

## CI

`.github/workflows/ci.yml` runs type-checking, the test suite, and a
production build on every push and PR against `main`.

## Documentation

The full technical/security documentation (architecture diagrams, every
endpoint, every table, the security model) is currently maintained as a
standalone document outside this repository. Recommendation: keep a copy
of it under `/docs` in this repo so it stays versioned alongside the code
it describes, rather than living somewhere it can silently go stale.
