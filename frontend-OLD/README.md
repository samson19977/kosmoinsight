# KosmoPads Frontend

React + TypeScript + Vite frontend for the KosmoPads menstrual health platform.

**What changed in this update:**
- Every product card, the cart drawer, and the homepage preview now show your **real product photos** (`public/images/*.png`) instead of emoji placeholders — via a shared `ProductImage` component that falls back to a soft gradient + emoji tile if a photo is ever missing.
- Homepage stats and testimonials now reflect the **real KosmoPads numbers and customer stories** from kosmopads.rw (800K+ lives impacted, 100% customer satisfaction, 88% cost savings) instead of placeholder figures.
- Removed an unused, insecure client-side admin password stub (`AuthContext` — the password was hardcoded and visible in the shipped JS bundle). The footer now links straight to the real, JWT-protected **admin dashboard** on the backend.
- Fixed a build-breaking bug: `import.meta.env` had no type declarations (missing `vite-env.d.ts`), so `npm run build` would fail on a clean checkout. Added the missing file — `npm run build` now succeeds.

**Latest round — product detail pages + finishing touches:**
- New **product detail page** (`/products/:id`) — full description, quantity stepper, trust badges, and a "You may also like" related-products strip. Product cards on the homepage and products grid now link through to it.
- **Skeleton loading states** replace the old spinner on the products grid and detail page, so the layout doesn't jump once data arrives.
- **FAQ accordion** on the homepage answering the questions buyers actually have (payment, delivery, tracking, reusability) — builds trust before checkout.
- **Floating WhatsApp button** for instant pre-sale questions, using the phone number already published in the footer.
- **Branded 404 page** for any unmatched route (previously would render a blank page).
- **Scroll-to-top on navigation** — clicking into a product from partway down a long list no longer leaves you scrolled mid-page.

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
```

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

