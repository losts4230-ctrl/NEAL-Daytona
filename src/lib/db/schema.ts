import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Schema design notes
 *
 * The immutable definition of a lot (name, area, reserve, tier) lives in code,
 * in `domain/panels.ts`, because it is reviewable product data that should move
 * through pull request — not a row someone can edit in a console. The database
 * stores only what genuinely mutates: the per-lot status and the bid ledger.
 * That split removes an entire class of code/data drift bug.
 *
 * `bids` is an append-only ledger. A bid is never updated in place except for
 * its `status`, so the full history of an auction is always reconstructable —
 * which is what you need when a bidder disputes an outcome.
 */

export const lotStatus = pgEnum("lot_status", ["open", "reserved", "sold", "withdrawn"]);

export const bidStatus = pgEnum("bid_status", [
  "active",
  "outbid",
  "accepted",
  "rejected",
  "withdrawn",
]);

export const lots = pgTable("lots", {
  /** Business key, mirrors PanelDefinition.id. Never reassigned. */
  panelId: text("panel_id").primaryKey(),
  status: lotStatus("status").notNull().default("open"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bids = pgTable(
  "bids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    panelId: text("panel_id")
      .notNull()
      .references(() => lots.panelId, { onDelete: "restrict" }),

    /** Integer minor units. Never a float. See domain/money.ts. */
    amountMinor: integer("amount_minor").notNull(),

    /** Shown publicly on the lot card. */
    displayName: text("display_name").notNull(),

    /** Private. Never serialised to a public response. */
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),

    brandUrl: text("brand_url"),
    message: text("message"),

    status: bidStatus("status").notNull().default("active"),

    /** Abuse forensics. Salted hash, not a raw address — see http/client.ts. */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    /**
     * Serves the hot path: the public board reads the top live bid per lot.
     * Descending amount with ascending time breaks ties in favour of whoever
     * bid first, matching the ordering the domain rules assume.
     */
    index("bids_panel_amount_idx").on(t.panelId, t.amountMinor.desc(), t.createdAt.asc()),
    index("bids_status_idx").on(t.status),
    index("bids_created_at_idx").on(t.createdAt.desc()),
    /** Lets the admin view group a bidder's history without a full scan. */
    index("bids_contact_email_idx").on(t.contactEmail),
    check("bids_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

/**
 * Idempotency ledger. A retried or double-submitted bid resolves to the same
 * row rather than creating a second identical bid against the same lot.
 */
export const bidRequests = pgTable(
  "bid_requests",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    bidId: uuid("bid_id")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bid_requests_bid_id_idx").on(t.bidId)],
);
