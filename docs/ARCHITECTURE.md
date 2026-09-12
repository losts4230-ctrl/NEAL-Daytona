# Architecture review — Brand My Daytona

A sponsorship auction where bidders bid, per panel, for branding space on a
Triumph Daytona 675R that **has not been bought yet**. The auction is what funds
the purchase.

This document is the design record: what was built, what was deliberately left
out, and what has to change before each next step. It is written to be read by
whoever maintains this in two years, including me.

---

## 1. The decision that shapes everything else

**Bids are non-binding offers. No payment instrument is collected.**

This was chosen over a real-money auction with card holds, and it is the single
highest-leverage decision in the system.

| | Offers (chosen) | Card holds / escrow |
|---|---|---|
| Scope | One service, one database | Payments provider, webhooks, reconciliation, refunds, disputes |
| Regulatory | None beyond data protection | PCI scope (SAQ-A at best), consumer auction rules, possible money-transmission questions |
| Failure cost of a bug | A wrong number on a page | Someone is wrongly charged |
| Conversion | Lower friction to bid, weaker commitment | Higher commitment, far fewer bids |
| Bad-debt risk | Winner can walk away | Largely covered |

The bike not existing yet decides it. Taking money — even a hold — against a
motorcycle that may never be bought is the kind of thing that ends up on a
consumer-rights forum. Every lot is explicitly void if the bike is not acquired,
and that condition is stated in the hero, in the FAQ, next to the accept
checkbox, and in the terms.

The accepted cost is non-payment by a winning bidder. The mitigation is
commercial, not technical: the operator confirms in writing and invoices before
any vinyl is cut.

**When to revisit:** if more than roughly a fifth of won lots go unpaid, add a
Stripe deposit at bid time on hero lots only. The bid ledger is already
append-only and carries a status field, so that is an additive change.

---

## 2. Architecture

```
Browser
  │  SSR HTML (board state already rendered — SEO + instant first paint)
  │  GET /api/v1/lots   every 20s while the tab is visible
  │  POST /api/v1/bids
  ▼
Next.js (App Router)
  ├── app/page.tsx ........ server component, reads the repository directly
  ├── app/api/v1/* ........ route handlers: transport concerns only
  ├── middleware.ts ....... per-request nonce + CSP
  │
  ├── lib/domain/ ......... pure auction rules. No clock, no I/O, no framework.
  ├── lib/http/ ........... validation, serialisation, rate limit, auth
  └── lib/repo/ ........... persistence behind one interface
                              ├── memory (dev/demo)
                              └── postgres (production)
```

### Layering rule

`domain` knows nothing about HTTP or SQL. `http` knows nothing about SQL.
`repo` is the only layer that touches a database. The rule that matters most:

> **No bidding threshold is implemented anywhere except `domain/bidding.ts`.**

A route handler that re-checked "is this bid high enough?" would be a second
source of truth, and the two would diverge the first time an increment changed.
`evaluateBid` is called in exactly one place — inside the repository's write
transaction — which is also the only place it *can* be called without a race.

### Why a repository interface rather than calling Drizzle directly

Three concrete returns, not abstraction for its own sake:

1. The app runs and is fully testable with no database (`DATA_DRIVER=memory`).
   `npm run dev` works on a clean clone.
2. `memory.test.ts` is a specification both drivers are held to, so the
   Postgres adapter has a defined contract rather than implied behaviour.
3. Moving to a different Postgres host — or putting an API in front — touches
   one file.

The cost is one extra indirection and the risk of driver drift. Drift is
contained by the shared test file; the `memory` driver is never a production
target, and the app renders a visible banner when it is running.

### Data ownership

This service owns its operational database outright. Nothing else reads these
tables directly. If the bids need to reach a warehouse for analysis, that goes
out as events or a scheduled export, never as a second consumer of the
operational schema — a reporting query holding locks on `bids` during the final
minutes of an auction is exactly the failure this rule prevents.

Two things stay out of the database on purpose:

- **The lot catalogue** (`domain/panels.ts`) is code. Name, print area, reserve
  and tier are product decisions that should move through review with a diff,
  not be edited in a database console at 11pm. The database holds only the
  mutable `status`.
- **Money** is always an integer count of minor units. `formatMoney` is the only
  place a value becomes a string.

---

## 3. Auction correctness

The two hard problems in any auction are the same two problems:

### Concurrent bids on one lot

Read-the-high-bid then write-a-higher-one is a lost-update race. Two bidders
read £900, both bid £925, both are told they lead.

`PostgresAuctionRepository.placeBid` opens a transaction, takes
`SELECT ... FOR UPDATE` on the lot row **before** reading the standing high bid,
and inserts inside the same transaction. Bids on the same lot serialise; bids on
different lots do not contend at all, since the lock is per lot.

The memory driver relies on Node's single-threaded event loop: there is no
`await` between its read and its write. `memory.test.ts` fires twelve
simultaneous identical bids and asserts exactly one wins.

### Duplicate submissions

A double-clicked button or a retried request after a timeout must not create two
bids. The client generates an idempotency key per attempt-series; a successful
bid records it in `bid_requests`. A replay returns the original bid with HTTP 200
instead of 201. A *failed* attempt records nothing, so raising a rejected bid
correctly creates a new one.

### Sniping

A bid inside the last five minutes extends that lot by five minutes from the
time of the bid (`extendedCloseAt`). Applied per lot, so a late bid on the
swingarm does not extend the hero panels. This makes the winner the highest
bidder rather than whoever had the best connection.

### Auditability

`bids` is append-only. Nothing is ever rewritten except `status`
(`active` → `outbid` / `accepted` / `rejected`). The full history of an auction
is reconstructable, which is what settles a dispute about who bid what and when.

---

## 4. Security review

### What is implemented

| Area | Control |
|---|---|
| Input validation | Zod at every boundary, `.strict()` so unknown keys are rejected outright |
| Injection | Parameterised queries throughout (Drizzle); no string-built SQL |
| XSS | React escaping, plus a nonce-based CSP with `strict-dynamic` |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| Transport | HSTS with a two-year max-age and preload |
| PII exposure | Public DTOs are built field by field, never by spreading a record |
| IP handling | Salted SHA-256 prefix stored; the address itself is never persisted |
| Abuse | Per-IP rate limit, honeypot field, length caps, control-character rejection |
| Admin auth | Bearer token compared with `timingSafeEqual`; fails closed if unset |
| Secrets | Environment only; `.env*` gitignored; `.env.example` carries no values |
| Error leakage | Internal errors are logged and answered with a generic message |

Two details worth their own note, because both were bugs during the build:

- **The public/private boundary is structural.** `toPublicLot` and
  `toPublicBidReceipt` construct their output field by field. A private column
  added to the schema tomorrow cannot leak through them today, because it would
  have to be added by hand. `serialise.test.ts` asserts no private value appears
  in any public payload.
- **The honeypot must not name itself.** The first version validated `website`
  as `z.literal("")`, so filling it produced a validation error *naming the
  `website` field* — handing a bot the exact information the trap exists to
  withhold. The schema now accepts any string and the route handler rejects a
  non-empty value with the same generic error as any other failure.

### Known limitations, accepted for launch

1. **Admin auth is a single shared token.** No per-user identity, no revocation
   short of rotating the secret, no record of who accepted which bid. Adequate
   for exactly one operator.
   → *Before a second person gets access:* real SSO, and the Admin / Manager /
   Viewer roles below. Authentication and authorisation stay separate concerns;
   RBAC first, and ABAC only if a real case for it appears.

   | Role | Read bids + contacts | Accept / reject | Change lot status | Rotate secrets |
   |---|---|---|---|---|
   | Viewer | yes | no | no | no |
   | Manager | yes | yes | yes | no |
   | Admin | yes | yes | yes | yes |

2. **Rate limiting is per instance and in memory.** On a serverless fleet the
   effective limit is the configured limit times the instance count, and it
   resets on cold start. It stops a naive script and a stuck submit button, not
   a distributed attacker.
   → *Fix:* a shared counter (Upstash Redis, Cloudflare Durable Object) behind
   the existing `checkRateLimit` signature. No caller changes.

3. **Bidder email is unverified.** Anyone can bid under anyone's address.
   → *Fix:* a magic-link confirmation before a bid counts. The schema already
   has room for a `verified_at` column; the bid would enter as `pending` and
   only become `active` on confirmation.

4. **`x-forwarded-for` is trusted.** Correct behind Vercel or Cloudflare, which
   overwrite it. Behind a raw origin it is attacker-controlled and the rate
   limit becomes advisory.
   → *Fix:* if the deployment changes, read the platform's signed header
   instead, or trust only a known proxy hop count.

5. **`style-src 'unsafe-inline'`.** Required by Next's hydration-time inline
   style attributes. Inline styles are not a script-execution vector, and
   everything that can execute is nonce-gated.

---

## 5. Scalability and performance

Realistic load: a few thousand visitors over an auction window, with spikes when
a link circulates. Write volume is trivially small — a few hundred bids total.
The read path is what matters, and it is designed around that asymmetry.

| Concern | Design | Headroom |
|---|---|---|
| Board reads | **One** SQL query for all lots. A `LEFT JOIN LATERAL` with window functions returns the top bid, the bid count and the last-bid time per lot in a single pass, on the `(panel_id, amount_minor DESC, created_at ASC)` index | The obvious N+1 — one query per lot — is the thing this explicitly avoids |
| Traffic spikes | `s-maxage=5, stale-while-revalidate=25` on `/api/v1/lots` | Origin reads stay near-constant regardless of concurrent viewers |
| Live updates | 20s polling, paused on hidden tabs | No connection state; SSE is the upgrade if sub-second latency is ever wanted |
| Connections | Pool capped at `max: 5`, `prepare: false` for transaction-mode poolers | A pooled endpoint (pgbouncer / Neon pooler / RDS Proxy) is **required** on serverless |
| Write contention | Row lock is per lot, so 16 lots take bids in parallel | Contention only within a single hot lot |
| Payload | Public DTOs carry no private fields, so responses stay small | — |
| Client JS | ~110 kB first load. No web fonts, no chart library, no UI framework | Nothing to trim yet |

**The scaling cliff, named explicitly:** a single hot lot in the closing
minutes. Every bid on it serialises behind one row lock. At a few bids per second
that is fine. At hundreds it is not, and the answer would be a queue per lot with
an async receipt — not a bigger database.

---

## 6. Operational considerations

- **Health:** `GET /api/health` returns 503 when the data store is unreachable,
  so a probe fails rather than a page rendering an empty board. It also reports
  the active driver, the auction phase, and any configuration warnings.
- **Logging:** structured single-line JSON on stdout, parseable by any platform
  without a custom ingest rule. Every bid attempt is logged with its outcome and
  duration; accept/reject decisions are logged at `info` because they are
  auditable commercial actions. Bidder emails are never logged.
- **Configuration:** validated once at import. Malformed values throw and fail
  the build. Missing *secrets* do not throw — `next build` runs with
  `NODE_ENV=production` on a machine that should never hold production secrets,
  so requiring them at build time would be the wrong coupling. The dependent
  feature fails closed and the gap is reported on `/api/health`.
- **Migrations:** hand-written, reviewed SQL in `drizzle/`, idempotent and
  re-runnable. The indexes and the locking strategy are the load-bearing part of
  auction correctness and deserve to be read in review, not generated.
- **Demo mode:** if the memory driver is ever live in production, the site shows
  a banner saying bids are not being saved. A silently non-durable auction is
  the worst possible failure, so it is made loud.

### Runbook: what can actually go wrong

| Symptom | Likely cause | Action |
|---|---|---|
| `/api/health` 503 | Database unreachable, or connections exhausted | Check the provider; confirm `DATABASE_URL` is the **pooled** endpoint |
| Board empty, health OK | `DATA_DRIVER=memory` in production | Set `postgres` + `DATABASE_URL`, redeploy |
| Admin returns 401 with the right token | `ADMIN_API_TOKEN` unset in this environment | Check `/api/health` `warnings`; set and redeploy |
| Bids rejected `AUCTION_NOT_OPEN` | Auction window misconfigured | Check `AUCTION_OPENS_AT` / `AUCTION_CLOSES_AT` are ISO 8601 **with timezone** |
| Bidder says they were double-charged a bid | Idempotency replay | `bid_requests` maps their key to one bid id; there is only one row |
| Two bidders claim the same lot | Should be impossible | Query `bids` for that `panel_id` ordered by amount; the ledger is authoritative |

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bike is never bought | Medium | Reputational | Void condition stated in four places; no money taken, so nothing to refund |
| Winning bidder does not pay | Medium | Low per lot | Written confirmation and invoice before vinyl is applied; re-offer to the next bidder |
| Fake or abusive bids inflate the board | Medium | Medium | Rate limit, honeypot, operator reject. **Email verification is the real fix and is not built** |
| Reserves are wrong | Medium | Medium | Reserves are code; a repriced lot is a reviewed one-line diff |
| Trademark complaint over "Triumph"/"Daytona" | Low | Medium | Nominative descriptive use only, with a disclaimer in the footer; no Triumph logos or livery |
| Terms are unenforceable | Medium | Medium | `app/terms/page.tsx` is written to match actual behaviour but is **not legal advice** — have it reviewed |
| Memory driver in production | Low | High | Startup warning, health warning, on-page banner |

---

## 8. Future improvements, in the order I would do them

1. **Email verification of bidders.** The largest remaining integrity gap, and
   cheap: magic link, `pending` → `active` on confirmation.
2. **Transactional email.** Bid receipt, outbid notice, won-lot notice. Outbid
   notices are also the strongest driver of repeat bidding.
3. **Shared-store rate limiting.** Drop-in behind `checkRateLimit`.
4. **Real admin auth and RBAC.** Required before a second operator.
5. **Artwork upload.** Presigned S3/R2 PUT, size and MIME allow-list, no
   server-side image processing on the request path.
6. **SSE for live updates.** Only if polling latency becomes a real complaint.
7. **Stripe deposits on hero lots.** Only if non-payment proves material.
8. **Warehouse export.** A nightly append of the bid ledger, for pricing the
   next season's lots. Events or a scheduled export — never a direct reader on
   the operational tables.

## 9. Things a reviewer should push back on

Stated plainly, because pretending they are settled would be worse:

- **The memory driver may be over-engineering.** It earns its place today by
  making the app runnable and testable with zero infrastructure. If the team
  only ever runs against Postgres, delete it and its test file.
- **Polling instead of SSE** is a real latency compromise. For a 16-lot auction
  over weeks it is the right trade; for a 60-second closing sprint it is not.
- **The lot catalogue in code** means a price change needs a deploy. That is a
  deliberate choice in favour of reviewability, and it is the wrong choice the
  moment a non-technical operator needs to reprice lots themselves.
- **No pagination on the public board.** Fine at 16 lots, wrong at 200.
