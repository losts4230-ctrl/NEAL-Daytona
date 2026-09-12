# Brand My Daytona

A sponsorship auction for branding space on a Triumph Daytona 675R race build.
Every panel on the bike is a separate lot with its own reserve price, print area
and bid history. The bike has not been bought yet — the auction is what funds it.

- **Public board** — interactive side elevation of the bike; tap a surface to
  jump to its lots. Live leading bids, per-lot minimums, countdown.
- **Bidding** — server-authoritative, race-safe, idempotent. Bids are
  non-binding offers; no payment details are ever collected.
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
| `npm test` | Unit tests (56 tests) |
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
| `CURRENCY` / `LOCALE` | `GBP` / `en-GB` by default |

Configuration is validated once at import. A malformed value fails the build; a
missing secret fails the dependent feature closed and is reported in the
`warnings` array of `GET /api/health`.

---

## Customising it for your bike

Everything you are likely to want to change is in one of four places.

**1. The lots — `src/lib/domain/panels.ts`**

The catalogue is code, not database rows, so repricing a lot is a reviewable
one-line diff. Each entry has a name, location, tier, print area and reserve.

> Lot `id` values are the business key: they appear in the database, in URLs and
> in the SVG diagram. **Never rename an id once bids exist against it.** Adding
> and removing lots is safe.

**2. The bike diagram — `src/components/bike-diagram.tsx`**

A hand-drawn SVG side elevation. The file opens with the full coordinate system
(axle positions, wheel radius, ground line) and the shared outline vertices. If
you add a lot, add a zone with its `panelIds` and a path that tiles into the
existing silhouette.

**3. Copy, spec and FAQ — `src/app/page.tsx`**

The `SPEC`, `STEPS` and `FAQ` constants near the top of the file.

**4. Currency — `CURRENCY` / `LOCALE`**

Changing currency does **not** convert the reserves in `panels.ts`; they are
plain numbers. Review them when you switch.

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
| `GET` | `/api/v1/lots` | public | Full board: lots, auction window, totals |
| `POST` | `/api/v1/bids` | public | Place a bid |
| `GET` | `/api/v1/admin/bids` | bearer | All bids including bidder contact details |
| `PATCH` | `/api/v1/admin/bids/:id` | bearer | `{"status":"accepted"\|"rejected"}` |
| `PATCH` | `/api/v1/admin/lots/:panelId` | bearer | `{"status":"open"\|"reserved"\|"sold"\|"withdrawn"}` |
| `GET` | `/api/health` | public | Liveness, readiness, config warnings |

Bid rejection codes: `BELOW_MINIMUM`, `AUCTION_NOT_OPEN`, `AUCTION_CLOSED`,
`PANEL_UNAVAILABLE` (all HTTP 409), `VALIDATION_FAILED`, `UNKNOWN_PANEL`
(HTTP 400), `RATE_LIMITED` (429).

```bash
curl -X POST http://localhost:3000/api/v1/bids \
  -H 'content-type: application/json' \
  -d '{
    "panelId": "upper-fairing-left",
    "amount": 900,
    "displayName": "Apex Coffee Co",
    "contactName": "Sam Reed",
    "contactEmail": "sam@example.com",
    "acceptedTerms": true,
    "idempotencyKey": "a-unique-key-per-attempt"
  }'
```

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

Three invariants worth knowing before you change anything:

1. **Bidding rules live only in `domain/bidding.ts`.** A handler that re-checks a
   threshold creates a second source of truth that will diverge.
2. **`evaluateBid` is called inside the repository's write transaction**, after a
   `SELECT ... FOR UPDATE` on the lot. That lock is what stops two bidders on one
   lot both being told they won. Never validate then write as separate steps.
3. **Money is always integer minor units.** Never a float, never a string until
   it reaches `formatMoney`.

`docs/ARCHITECTURE.md` also records what was deliberately left out and what a
reviewer should push back on.
