# KosmoPads Frontend

React + TypeScript + Vite frontend for the KosmoPads menstrual health platform.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env to point VITE_API_URL at your backend

# Start dev server
npm run dev
# → http://localhost:5173

# Lint and test
npm run lint
npm test
```

## Project layout

```
src/
  pages/            One file per route — customer-facing pages at the top
                     level, agent-portal pages under pages/agent/
  components/       common/ (shared widgets), ui/ (presentational),
                     layout/ (header/footer/shell), agent/ (agent-portal UI)
  context/          CartContext (cart state), AgentAuthContext (agent session)
  services/         Thin API wrappers, one per backend resource
  utils/            Pure logic with no React/DOM dependency — this is
                     where new business logic should go so it stays testable
  hooks/            React Query hooks
tests/              Vitest unit tests (pure logic only — see below)
```

## Key design decisions

**Cart and referral-attribution logic live in `src/utils/`, not inside
the React Context files.** `CartContext.tsx` and the referral-capture
call sites only wire pure functions into React state/localStorage — the
actual rules (the 100-per-item cap, first-touch referral attribution)
are plain functions in `utils/cart.ts` and `utils/referral.ts` that can
be unit-tested directly, without mounting a component. Keep new business
rules that don't strictly need React in that layer.

**Auth tokens are stored in `localStorage`** (`agent.service.ts`), not an
httpOnly cookie. This is a known, accepted trade-off rather than an
oversight: it makes the token readable to any script running on the
page (an XSS risk), but the alternative (httpOnly cookies) needs
coordinated backend changes — cookie issuance, `SameSite`/`Secure`
config, CSRF protection — out of scope for a frontend-only change.
Worth revisiting if the agent portal's data ever gets more sensitive
than it is today. `AgentAuthContext` already re-validates the token
against the server on every load, so a revoked/suspended agent is still
caught immediately regardless of where the token lives.

**A few files intentionally export a hook or shared constants alongside
a component** (`CartContext.tsx`'s `useCart`, `AgentAuthContext.tsx`'s
`useAgentAuth`, `ProductImage.tsx`'s color/emoji/photo maps). ESLint's
`react-refresh/only-export-components` rule flags this — it only affects
hot-reload behavior in dev, not runtime correctness — and the lint
script's `--max-warnings` threshold is set to match the current, known
count (6) rather than silencing the rule outright, so a *new* violation
elsewhere still fails CI.

## Testing

`tests/cart.test.ts` and `tests/referral.test.ts` cover the two pieces
of client-side logic with real business consequences: the per-item
quantity cap and the first-touch rule that decides which agent gets
commission credit for a sale.

This is a starting point, not full coverage — there is no
component-level or integration testing yet (e.g. checkout form
validation, the agent registration flow).

## Notable fixes made alongside this documentation pass

- The cart sidebar's +/- quantity buttons called `setState` directly and
  could push a line's quantity past the 100-per-item cap that
  `addToCart` enforced elsewhere — both paths now go through the same
  capped logic in `utils/cart.ts`.
- `eslint` itself was never installed even though
  `@typescript-eslint/eslint-plugin`/`parser` were present as
  devDependencies — `npm run lint` had likely never actually run
  successfully before now. Installed `eslint@8` with a matching
  `.eslintrc.cjs`, fixed the 8 real errors that surfaced (a `let` that
  should've been `const`, a stale disable-comment, and the same regex
  typo — an unnecessary escape in a name-validation pattern — copy-pasted
  across three files), and cleaned up unused imports.

## CI

`.github/workflows/ci.yml` runs lint, tests, and a production build on
every push and PR against `main`.

## 🏗️ Build for Production

```bash
npm run build
# → ./dist/ folder (deploy to Netlify, Vercel, or Render Static Site)
```

## 📦 Pages

| Route | Page |
|---|---|
| `/` | Landing page with hero, stats, product preview, testimonials |
| `/products` | Full product grid with search and filter |
| `/products/:id` | Product detail page with quantity picker and related products |
| `/checkout` | Order form with customer details + MTN MoMo / Cash |
| `/order-confirmation/:orderNumber` | Order success with payment instructions |
| `/order-status` | Track any order by number |

The **admin dashboard** (revenue, orders, top products) lives on the backend at `/admin` — linked from the footer — not in this repo.

## ⚙️ Environment Variables

```env
VITE_API_URL=https://your-backend.onrender.com/api
VITE_MOMO_MERCHANT_CODE=675566
```

## 🌐 Deploy to Render (Static Site)

1. Push to GitHub
2. Render → **New Static Site** → connect repo
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Set `VITE_API_URL` to your Render backend URL

## 🛠️ Stack

- **React 18** + TypeScript
- **Vite 5** (build tool)
- **Tailwind CSS 3** (styling)
- **Framer Motion** (animations)
- **React Router DOM 6** (routing)
- **TanStack React Query** (data fetching)
- **React Hot Toast** (notifications)
- **Lucide React** (icons)
- **Axios** (HTTP client)

## Changelog

**Product photos + trust content:**
- Every product card, the cart drawer, and the homepage preview show real product photos (`public/images/*.png`) instead of emoji placeholders — via a shared `ProductImage` component that falls back to a soft gradient + emoji tile if a photo is ever missing.
- Homepage stats and testimonials reflect the real KosmoPads numbers and customer stories from kosmopads.rw (800K+ lives impacted, 100% customer satisfaction, 88% cost savings) instead of placeholder figures.
- Removed an unused, insecure client-side admin password stub (`AuthContext` — the password was hardcoded and visible in the shipped JS bundle). The footer now links straight to the real, JWT-protected admin dashboard on the backend.
- Fixed a build-breaking bug: `import.meta.env` had no type declarations (missing `vite-env.d.ts`), so `npm run build` would fail on a clean checkout. Added the missing file.

**Product detail pages + finishing touches:**
- New product detail page (`/products/:id`) — full description, quantity stepper, trust badges, and a "You may also like" related-products strip.
- Skeleton loading states replace the old spinner on the products grid and detail page.
- FAQ accordion on the homepage answering the questions buyers actually have (payment, delivery, tracking, reusability).
- Floating WhatsApp button for instant pre-sale questions.
- Branded 404 page for any unmatched route.
- Scroll-to-top on navigation.

**Testing, linting, and cart-cap fix (this pass):** see "Notable fixes made alongside this documentation pass" above.


