-- Brand My Daytona — initial schema
--
-- Written and reviewed by hand rather than generated, because the indexes and
-- the row-lock strategy are the load-bearing part of auction correctness and
-- deserve to be read in review.
--
-- Safe to re-run: every object is created conditionally.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE lot_status AS ENUM ('open', 'reserved', 'sold', 'withdrawn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bid_status AS ENUM ('active', 'outbid', 'accepted', 'rejected', 'withdrawn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- lots — mutable per-surface state only.
--
-- The immutable definition of a lot (name, print area, reserve, tier) lives in
-- application code so it moves through code review. This table exists purely to
-- hold the status, and to give bids a foreign key to lock against.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lots (
  panel_id    text PRIMARY KEY,
  status      lot_status  NOT NULL DEFAULT 'open',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- bids — append-only ledger.
--
-- Rows are never rewritten except for `status`, so the complete history of an
-- auction stays reconstructable. That is what settles a dispute.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bids (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id       text        NOT NULL REFERENCES lots (panel_id) ON DELETE RESTRICT,

  -- Integer minor units (pence/paise/cents). Never a float: a rounding error in
  -- an auction is a dispute, not a cosmetic bug.
  amount_minor   integer     NOT NULL,

  -- Published on the board.
  display_name   text        NOT NULL,

  -- Private. No public endpoint is allowed to serialise these.
  contact_name   text        NOT NULL,
  contact_email  text        NOT NULL,
  contact_phone  text,

  brand_url      text,
  message        text,

  status         bid_status  NOT NULL DEFAULT 'active',

  -- Salted hash, not a raw address: keeps the abuse-investigation value without
  -- retaining an identifier that is personal data under GDPR.
  ip_hash        text,
  user_agent     text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,

  CONSTRAINT bids_amount_positive CHECK (amount_minor > 0)
);

-- Hot path: the public board reads the top live bid per lot. Descending amount
-- with ascending time breaks ties in favour of whoever bid first, matching the
-- ordering the domain rules assume.
CREATE INDEX IF NOT EXISTS bids_panel_amount_idx
  ON bids (panel_id, amount_minor DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS bids_status_idx      ON bids (status);
CREATE INDEX IF NOT EXISTS bids_created_at_idx  ON bids (created_at DESC);

-- Lets the operator pull one bidder's history without a full scan.
CREATE INDEX IF NOT EXISTS bids_contact_email_idx ON bids (contact_email);

-- ---------------------------------------------------------------------------
-- bid_requests — idempotency ledger.
--
-- A retried or double-submitted bid resolves to the row it already created
-- instead of creating a second identical bid against the same lot.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bid_requests (
  idempotency_key text PRIMARY KEY,
  bid_id          uuid        NOT NULL REFERENCES bids (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bid_requests_bid_id_idx ON bid_requests (bid_id);

COMMIT;
