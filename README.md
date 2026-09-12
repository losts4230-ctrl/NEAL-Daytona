# Brand My Daytona

A sponsorship auction for branding space on a Triumph Daytona 675R race build.
Eleven surfaces, each its own auction. **Every lot starts at zero and each bid
raises it by a flat ₹5,000**, so a lot's price is always its bid count times the
increment. The bike has not been bought yet — the auction is what funds the
₹10,00,000 purchase target, and a funding bar in the hero says so.

- **Public board** — interactive side elevation; tap a surface to jump to its
  lot. Live leader, full bid history per lot, funding bar, countdown.
- **Bidding** — no amount to type: you accept the next price or you do not.
  Server-authoritative, race-safe, idempotent. Bids are non-binding offers and
  no payment details are ever collected.
- **Bidder identity** — the icon of the site a bidder gives, proxied through
  this origin so no visitor is disclosed to a third-party favicon service.
- **Operator console** — `/admin`, accept or reject bids, open and close lots.

Run it with no database at all:

```bash
npm install
npm run dev          # http://localhost:3000
```

That uses the in-memory store, which is fine for development and demos and is
**not** safe for real bids — see *Going live* below.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run verify` | Typecheck, unit tests, production build. Run before pushing |
| `npm test` | Unit tests (70 tests) |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply `drizzle/` migrations to `DATABASE_URL` |
| `npm run db:seed` | Create a `lots` row per catalogue entry (idempotent) |

## Configuration

Copy `.env.example` to `.env.local` and edit. Every variable is documented
there. The ones that matter:

| Variable | Notes |
|---|---|
| `DATA_DRIVER` | `memory` (dev/demo) or `postgres` (production) |
| `DATABASE_URL` | Required for `postgres`. Use a **pooled** endpoint on serverless |
| `ADMIN_API_TOKEN` | 32+ chars. `openssl rand -base64 48`. Admin API fails closed without it |
| `IP_HASH_SALT` | `openssl rand -hex 32`. Set explicitly in production |
| `AUCTION_OPENS_AT` / `AUCTION_CLOSES_AT` | ISO 8601 **with timezone** |
| `CURRENCY` / `LOCALE` | `INR` / `en-IN` by default |
| `BID_INCREMENT` | The flat step, in major units. Default `5000` |
| `PURCHASE_TARGET` | What the build needs to raise. Default `1000000` |

Configuration is validated once at import. A malformed value fails the build; a
missing secret fails the dependent feature closed and is reported in the
`warnings` array of `GET /api/health`.

---

## Customising it for your bike

Everything you are likely to want to change is in one of four places.

**1. The lots — `src/lib/domain/panels.ts`**

The catalogue is code, not database rows, so changing it is a reviewable diff.
Each entry has a name, a one-line descriptor, a print area and a sort order.
There are no per-lot prices: **the order is the pricing signal**, since every
lot starts at zero and the market decides the rest. Position 01 should be the
panel the camera cannot avoid.

> Lot `id` values are the business key: they appear in the database, in URLs and
> in the SVG diagram. **Never rename an id once bids exist against it.** Adding
> and removing lots is safe.

**2. The bike drawing — `src/components/bike-geometry.ts`**

A hand-drawn SVG side elevation. The file opens with the full coordinate system
(axle positions, wheel radius, ground line) and the shared outline vertices. If
you add a lot, add a zone with its `panelIds`, a path that tiles into the
existing silhouette, and a `focus` view box (400×250) centred on it — that box
is what crops the thumbnail on the lot row.

Geometry lives here, separate from the components, so the big diagram and the
small thumbnails cannot drift apart.

**3. Copy, spec and FAQ — `src/app/page.tsx`**

The `SPEC`, `STEPS` and `FAQ` constants near the top of the file.

**4. Money — `CURRENCY`, `LOCALE`, `BID_INCREMENT`, `PURCHASE_TARGET`**

`PURCHASE_TARGET / BID_INCREMENT` is how many bids the auction needs to hit
target: 200 at the defaults. That ratio is the thing to reason about — a smaller
increment is more accessible and more gamified but needs far more bids, a larger
one reaches target sooner but prices out small sponsors.

Changing `CURRENCY` does **not** convert either figure; they are plain numbers.

### Copy that needs your real details before launch

These are honest placeholders, deliberately written as intent rather than as
commitments — but they are still mine, not yours:

- `SPEC` in `src/app/page.tsx` is the **target** specification for a stock
  675R, and the page says so. Replace with the real bike's figures once bought.
- The FAQ answers on artwork formats, branding duration and the 90-day void
  window describe a reasonable default policy. Make sure you agree with all of
  it, because bidders will hold you to it.
- `src/app/terms/page.tsx` is written to match how the auction actually behaves.
  **It is not legal advice.** Have it reviewed before you take a single bid.
- There are no contact details anywhere yet. The footer and FAQ both point at
  "the organiser" — add a real email address.

---

## API

Versioned under `/api/v1`. Every response is `{ data }` or
`{ error: { code, message, details? } }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/lots` | public | Full board: lots, history, funding, window |
| `POST` | `/api/v1/bids` | public | Place a bid at the lot's next price |
| `GET` | `/api/v1/brand-icon?domain=` | public | A bidder's site icon, or a generated monogram |
| `GET` | `/api/v1/admin/bids` | bearer | All bids including bidder contact details |
| `PATCH` | `/api/v1/admin/bids/:id` | bearer | `{"status":"accepted"\|"rejected"}` |
| `PATCH` | `/api/v1/admin/lots/:panelId` | bearer | `{"status":"open"\|"reserved"\|"sold"\|"withdrawn"}` |
| `GET` | `/api/health` | public | Liveness, readiness, config warnings |

Bid rejection codes: `PRICE_MOVED`, `AUCTION_NOT_OPEN`, `AUCTION_CLOSED`,
`PANEL_UNAVAILABLE` (all HTTP 409), `VALIDATION_FAILED`, `UNKNOWN_PANEL`
(HTTP 400), `RATE_LIMITED` (429). A `PRICE_MOVED` response carries the live
`nextBidMinor`, so a client can re-offer without a second round trip.

```bash
curl -X POST http://localhost:3000/api/v1/bids \
  -H 'content-type: application/json' \
  -d '{
    "panelId": "upper-fairing-left",
    "expectedAmountMinor": 500000,
    "displayName": "Apex Coffee Roasters",
    "brandUrl": "https://apexcoffee.in",
    "contactName": "Sam Reed",
    "contactEmail": "sam@example.com",
    "acceptedTerms": true,
    "idempotencyKey": "a-unique-key-per-attempt"
  }'
```

`expectedAmountMinor` is the price the bidder was shown, in minor units — **not
a price they choose**. The server recomputes the real next price and rejects a
mismatch, so the amount written to the ledger is always the server's.

`idempotencyKey` is required: a retry with the same key returns the original bid
(HTTP 200) instead of creating a second one.

---

## Going live

The in-memory driver is per-process. On any horizontally scaled or serverless
host, different visitors see different bids and everything is lost on cold start.
The site renders a warning banner whenever it is active. Do not take real bids on
it.

**Checklist:**

1. Provision Postgres (Supabase, Neon or RDS). Use the **pooled** connection
   string — the app caps its pool at 5, but serverless multiplies that by
   instance count.
2. `npm run db:migrate && npm run db:seed`
3. Set `DATA_DRIVER=postgres`, `DATABASE_URL`, `ADMIN_API_TOKEN`, `IP_HASH_SALT`,
   and the real `AUCTION_OPENS_AT` / `AUCTION_CLOSES_AT`.
4. Deploy. Verify `GET /api/health` returns `"driver":"postgres"` and an **empty**
   `warnings` array.
5. Place a test bid, check it in `/admin`, then reject it.
6. Replace the placeholder copy listed above, and add a contact email.
7. Get the terms reviewed.

### Known gaps before you take real money

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §4 for the full review. The
three that matter most:

- **Bidder emails are not verified.** Anyone can bid under any address. This is
  the largest integrity gap and the cheapest to close.
- **Rate limiting is per instance**, so it is advisory on a serverless fleet.
- **Admin auth is one shared token** with no per-user identity or audit of who
  acted. Fine for one operator; replace before a second gets access.

---

## How it is built

```
src/
  app/                  routes, API handlers, pages
  components/           client components (board, diagram, dialog, countdown)
  lib/
    domain/             pure auction rules — no clock, no I/O, no framework
    http/               validation, serialisation, rate limit, auth
    repo/               persistence behind one interface (memory | postgres)
    db/schema.ts        Drizzle schema
  middleware.ts         per-request nonce + CSP
drizzle/                hand-written, reviewed SQL migrations
docs/ARCHITECTURE.md    design record, security review, runbook, risks
```

Next.js 15, React 19, TypeScript strict, Drizzle + Postgres, Zod, Vitest. Plain
CSS with design tokens — no UI framework, no web fonts, so nothing third-party
sits on the critical path or in the CSP.

Four invariants worth knowing before you change anything:

1. **Bidding rules live only in `domain/bidding.ts`.** A handler that re-checks a
   threshold creates a second source of truth that will diverge.
2. **`evaluateBid` is called inside the repository's write transaction**, after a
   `SELECT ... FOR UPDATE` on the lot. That lock is what stops two bidders on one
   lot both being told they won. Never validate then write as separate steps.
3. **The bid amount is the server's.** A client sends the price it saw, never a
   price it wants. `placeBid` writes `decision.amountMinor`, nothing else.
4. **Money is always integer minor units.** Never a float, never a string until
   it reaches `formatMoney` — and never `Intl` compact notation in
   server-rendered output (see `formatMoneyCompact` for why).

`docs/ARCHITECTURE.md` also records what was deliberately left out and what a
reviewer should push back on.
