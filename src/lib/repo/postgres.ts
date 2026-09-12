import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/lib/config";
import { evaluateBid } from "@/lib/domain/bidding";
import { PANEL_CATALOGUE, findPanel, type PanelStatus } from "@/lib/domain/panels";
import { bidRequests, bids, lots } from "@/lib/db/schema";
import {
  brandDomain,
  type AuctionRepository,
  type BidRecord,
  type BidStatus,
  type ListBidsOptions,
  type ListBidsPage,
  type LotState,
  type PlaceBidInput,
  type PlaceBidResult,
  type PublicBidEntry,
} from "./types";

/** Bid statuses that still count towards a lot's price and history. */
const COUNTED = sql`('active', 'outbid', 'accepted')`;

type Db = PostgresJsDatabase<Record<string, never>>;

/** `db.execute` constrains its row generic to Record<string, unknown>. */
interface LotAggregateRow extends Record<string, unknown> {
  panel_id: string;
  status: PanelStatus;
  high_amount_minor: number | null;
  high_display_name: string | null;
  high_brand_url: string | null;
  bid_count: number;
  last_bid_at: Date | null;
}

interface HistoryRow extends Record<string, unknown> {
  panel_id: string;
  display_name: string;
  brand_url: string | null;
  amount_minor: number;
  created_at: Date;
}

/**
 * Production repository.
 *
 * Two properties matter here and are worth the extra care:
 *
 *  1. The public board is served by TWO queries total, regardless of how many
 *     lots exist: one aggregate and one for every lot's bid history. Fetching
 *     history per lot would be an N+1 on the single most-requested endpoint.
 *  2. `placeBid` takes a row lock on the lot before reading the standing high
 *     bid, so concurrent bids on the same lot serialise. Without the lock, two
 *     bidders can read the same price and both be accepted at it — the classic
 *     lost-update race, and an auction-integrity failure.
 */
export class PostgresAuctionRepository implements AuctionRepository {
  readonly driver = "postgres" as const;

  constructor(private readonly db: Db) {}

  private async aggregate(panelId?: string): Promise<LotAggregateRow[]> {
    /**
     * `left join lateral` evaluates the top-bid subquery once per lot using the
     * (panel_id, amount_minor desc, created_at asc) index, so this stays an
     * index scan rather than aggregating the whole bid ledger. The window
     * functions inside the lateral are computed over the full matching set
     * before LIMIT 1, which lets one pass return the top bid, the bid count and
     * the most recent bid time together.
     */
    const rows = await this.db.execute<LotAggregateRow>(sql`
      select
        l.panel_id,
        l.status,
        b.amount_minor  as high_amount_minor,
        b.display_name  as high_display_name,
        b.brand_url     as high_brand_url,
        coalesce(b.bid_count, 0)::int as bid_count,
        b.last_bid_at
      from ${lots} l
      left join lateral (
        select
          amount_minor,
          display_name,
          brand_url,
          count(*) over ()        as bid_count,
          max(created_at) over () as last_bid_at
        from ${bids}
        where panel_id = l.panel_id
          and status in ${COUNTED}
        order by amount_minor desc, created_at asc
        limit 1
      ) b on true
      ${panelId ? sql`where l.panel_id = ${panelId}` : sql``}
    `);
    return rows as unknown as LotAggregateRow[];
  }

  /**
   * Top N bids for every lot in one query.
   *
   * `row_number()` partitioned by lot then filtered in an outer query is the
   * standard top-N-per-group form, and it is why the history strips cost one
   * round trip for the whole board instead of one per lot.
   */
  private async history(panelId?: string): Promise<Map<string, PublicBidEntry[]>> {
    const rows = (await this.db.execute<HistoryRow>(sql`
      select panel_id, display_name, brand_url, amount_minor, created_at
      from (
        select
          panel_id,
          display_name,
          brand_url,
          amount_minor,
          created_at,
          row_number() over (
            partition by panel_id
            order by amount_minor desc, created_at asc
          ) as rank
        from ${bids}
        where status in ${COUNTED}
          ${panelId ? sql`and panel_id = ${panelId}` : sql``}
      ) ranked
      where rank <= ${config.auction.historyLength}
      order by panel_id, amount_minor desc
    `)) as unknown as HistoryRow[];

    const byPanel = new Map<string, PublicBidEntry[]>();
    for (const row of rows) {
      const entries = byPanel.get(row.panel_id) ?? [];
      entries.push({
        displayName: row.display_name,
        brandDomain: brandDomain(row.brand_url),
        amountMinor: Number(row.amount_minor),
        createdAt: new Date(row.created_at),
      });
      byPanel.set(row.panel_id, entries);
    }
    return byPanel;
  }

  private static toLotState(
    row: LotAggregateRow,
    recentBids: PublicBidEntry[],
  ): LotState | undefined {
    const panel = findPanel(row.panel_id);
    if (!panel) return undefined; // A retired catalogue entry; not surfaced.
    return {
      panel,
      status: row.status,
      currentHighMinor: row.high_amount_minor ?? null,
      currentHighDisplayName: row.high_display_name ?? null,
      currentHighDomain: brandDomain(row.high_brand_url ?? null),
      bidCount: Number(row.bid_count ?? 0),
      lastBidAt: row.last_bid_at ? new Date(row.last_bid_at) : null,
      recentBids,
    };
  }

  /** A lot with no rows yet still renders, at the opening price. */
  private static emptyLot(panelId: string): LotState | undefined {
    const panel = findPanel(panelId);
    if (!panel) return undefined;
    return {
      panel,
      status: "open",
      currentHighMinor: null,
      currentHighDisplayName: null,
      currentHighDomain: null,
      bidCount: 0,
      lastBidAt: null,
      recentBids: [],
    };
  }

  async listLots(): Promise<LotState[]> {
    const [rows, historyByPanel] = await Promise.all([this.aggregate(), this.history()]);
    const byId = new Map(rows.map((r) => [r.panel_id, r]));

    // The catalogue drives order and completeness, so a lot with no database
    // row yet still appears on the board rather than silently vanishing.
    return PANEL_CATALOGUE.map((panel) => {
      const row = byId.get(panel.id);
      return row
        ? PostgresAuctionRepository.toLotState(row, historyByPanel.get(panel.id) ?? [])
        : PostgresAuctionRepository.emptyLot(panel.id);
    }).filter((l): l is LotState => l !== undefined);
  }

  async getLot(panelId: string): Promise<LotState | undefined> {
    if (!findPanel(panelId)) return undefined;
    const [rows, historyByPanel] = await Promise.all([
      this.aggregate(panelId),
      this.history(panelId),
    ]);
    const row = rows[0];
    if (!row) return PostgresAuctionRepository.emptyLot(panelId);
    return PostgresAuctionRepository.toLotState(row, historyByPanel.get(panelId) ?? []);
  }

  async placeBid(input: PlaceBidInput, now: Date): Promise<PlaceBidResult> {
    const panel = findPanel(input.panelId);
    if (!panel) {
      return {
        ok: false,
        decision: { code: "UNKNOWN_PANEL", message: "Unknown lot.", nextAmountMinor: 0 },
      };
    }

    const inserted = await this.db.transaction(async (tx) => {
      const replay = await tx
        .select({ bidId: bidRequests.bidId })
        .from(bidRequests)
        .where(eq(bidRequests.idempotencyKey, input.idempotencyKey))
        .limit(1);

      const replayed = replay[0];
      if (replayed) {
        const [bid] = await tx.select().from(bids).where(eq(bids.id, replayed.bidId)).limit(1);
        if (bid) return { kind: "replay" as const, bid: toBidRecord(bid) };
      }

      // Materialise the lot row if this is its first bid, then lock it. The
      // lock is what serialises concurrent bidders on the same lot.
      await tx.insert(lots).values({ panelId: input.panelId }).onConflictDoNothing();
      const lockedRows = (await tx.execute<{ status: PanelStatus }>(
        sql`select status from ${lots} where panel_id = ${input.panelId} for update`,
      )) as unknown as { status: PanelStatus }[];
      const lotStatus: PanelStatus = lockedRows[0]?.status ?? "open";

      const standingRows = (await tx.execute<{
        amount_minor: number;
        last_bid_at: Date | null;
      }>(sql`
        select
          amount_minor,
          max(created_at) over () as last_bid_at
        from ${bids}
        where panel_id = ${input.panelId}
          and status in ${COUNTED}
        order by amount_minor desc, created_at asc
        limit 1
      `)) as unknown as { amount_minor: number; last_bid_at: Date | null }[];
      const standing = standingRows[0];

      const decision = evaluateBid({
        panelStatus: lotStatus,
        currentHighMinor: standing ? Number(standing.amount_minor) : null,
        lastBidAt: standing?.last_bid_at ? new Date(standing.last_bid_at) : null,
        expectedAmountMinor: input.expectedAmountMinor,
        now,
        opensAt: config.auction.opensAt,
        closesAt: config.auction.closesAt,
      });
      if (!decision.ok) return { kind: "rejected" as const, decision };

      await tx
        .update(bids)
        .set({ status: "outbid" })
        .where(and(eq(bids.panelId, input.panelId), eq(bids.status, "active")));

      const [row] = await tx
        .insert(bids)
        .values({
          panelId: input.panelId,
          amountMinor: decision.amountMinor,
          displayName: input.displayName,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          brandUrl: input.brandUrl,
          message: input.message,
          status: "active",
          ipHash: input.ipHash,
          userAgent: input.userAgent,
          createdAt: now,
        })
        .returning();

      if (!row) throw new Error("Bid insert returned no row.");

      await tx
        .insert(bidRequests)
        .values({ idempotencyKey: input.idempotencyKey, bidId: row.id });

      return { kind: "inserted" as const, bid: toBidRecord(row) };
    });

    if (inserted.kind === "rejected") return { ok: false, decision: inserted.decision };

    // Re-read outside the transaction so the caller gets the same lot shape the
    // board serves, history strip included, without duplicating that SQL here.
    const lot = await this.getLot(input.panelId);
    if (!lot) throw new Error("Lot vanished immediately after a successful bid.");

    return {
      ok: true,
      bid: inserted.bid,
      lot,
      deduplicated: inserted.kind === "replay",
    };
  }

  async listBids(options: ListBidsOptions): Promise<ListBidsPage> {
    const filters = [
      options.panelId ? eq(bids.panelId, options.panelId) : undefined,
      options.status ? eq(bids.status, options.status) : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [items, totals] = await Promise.all([
      this.db
        .select()
        .from(bids)
        .where(where)
        .orderBy(desc(bids.createdAt), asc(bids.id))
        .limit(options.limit)
        .offset(options.offset),
      this.db.select({ total: count() }).from(bids).where(where),
    ]);

    return { items: items.map(toBidRecord), total: Number(totals[0]?.total ?? 0) };
  }

  async decideBid(
    bidId: string,
    status: Extract<BidStatus, "accepted" | "rejected">,
  ): Promise<BidRecord | undefined> {
    const [updated] = await this.db
      .update(bids)
      .set({ status, decidedAt: new Date() })
      .where(and(eq(bids.id, bidId), inArray(bids.status, ["active", "outbid", "accepted"])))
      .returning();
    return updated ? toBidRecord(updated) : undefined;
  }

  async setLotStatus(panelId: string, status: PanelStatus): Promise<LotState | undefined> {
    if (!findPanel(panelId)) return undefined;
    await this.db
      .insert(lots)
      .values({ panelId, status, updatedAt: new Date() })
      .onConflictDoUpdate({ target: lots.panelId, set: { status, updatedAt: new Date() } });
    return this.getLot(panelId);
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.db.execute(sql`select 1`);
      return { ok: true, detail: "postgres reachable" };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "unknown error" };
    }
  }
}

type BidRow = typeof bids.$inferSelect;

function toBidRecord(row: BidRow): BidRecord {
  return {
    id: row.id,
    panelId: row.panelId,
    amountMinor: Number(row.amountMinor),
    displayName: row.displayName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    brandUrl: row.brandUrl,
    message: row.message,
    status: row.status,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

/**
 * One pool per process, reused across invocations. `max: 5` keeps a serverless
 * fleet from exhausting Postgres connection slots; a pooled connection string
 * (Supabase pgbouncer, Neon pooler, RDS Proxy) is still required at real scale.
 */
let cachedClient: postgres.Sql | undefined;

export function createPostgresRepository(url: string): PostgresAuctionRepository {
  cachedClient ??= postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Required for transaction-mode connection poolers.
  });
  return new PostgresAuctionRepository(drizzle(cachedClient));
}
