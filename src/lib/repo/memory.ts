import { randomUUID } from "node:crypto";
import { config } from "@/lib/config";
import { evaluateBid } from "@/lib/domain/bidding";
import { PANEL_CATALOGUE, findPanel, type PanelStatus } from "@/lib/domain/panels";
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

/**
 * In-process repository for local development, tests and preview builds.
 *
 * NOT production-safe: state is per-process, so any horizontally scaled or
 * serverless deployment will show different bids to different visitors and lose
 * everything on cold start. The app surfaces a visible banner whenever this
 * driver is active so that can never be mistaken for a real auction.
 *
 * Node's single-threaded event loop is what makes the read-modify-write inside
 * placeBid atomic here; there is no await between the read and the write.
 */
export class MemoryAuctionRepository implements AuctionRepository {
  readonly driver = "memory" as const;

  private readonly lotStatus = new Map<string, PanelStatus>();
  private readonly bids: BidRecord[] = [];
  private readonly idempotency = new Map<string, string>();

  constructor() {
    for (const panel of PANEL_CATALOGUE) this.lotStatus.set(panel.id, "open");
  }

  /**
   * Bids that still count towards a lot, highest first, ties broken in favour
   * of the earlier bid.
   *
   * "Outbid" counts. A lot's price is (bid count x increment), so dropping
   * superseded bids would make the count disagree with the price. It also keeps
   * this driver's filter identical to the Postgres one — a divergence here
   * would make the two drivers answer differently for the same data, which is
   * exactly what the shared test suite exists to prevent.
   */
  private countedBidsFor(panelId: string): BidRecord[] {
    return this.bids
      .filter(
        (b) =>
          b.panelId === panelId &&
          (b.status === "active" || b.status === "outbid" || b.status === "accepted"),
      )
      .sort(
        (a, b) => b.amountMinor - a.amountMinor || a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  private static toEntry(bid: BidRecord): PublicBidEntry {
    return {
      displayName: bid.displayName,
      brandDomain: brandDomain(bid.brandUrl),
      amountMinor: bid.amountMinor,
      createdAt: bid.createdAt,
    };
  }

  private buildLot(panelId: string): LotState | undefined {
    const panel = findPanel(panelId);
    if (!panel) return undefined;

    const counted = this.countedBidsFor(panelId);
    const top = counted[0];
    const lastBidAt = counted.reduce<Date | null>(
      (latest, b) => (latest === null || b.createdAt > latest ? b.createdAt : latest),
      null,
    );

    return {
      panel,
      status: this.lotStatus.get(panelId) ?? "open",
      currentHighMinor: top?.amountMinor ?? null,
      currentHighDisplayName: top?.displayName ?? null,
      currentHighDomain: top ? brandDomain(top.brandUrl) : null,
      bidCount: counted.length,
      lastBidAt,
      recentBids: counted
        .slice(0, config.auction.historyLength)
        .map(MemoryAuctionRepository.toEntry),
    };
  }

  async listLots(): Promise<LotState[]> {
    return PANEL_CATALOGUE.map((p) => this.buildLot(p.id)).filter(
      (l): l is LotState => l !== undefined,
    );
  }

  async getLot(panelId: string): Promise<LotState | undefined> {
    return this.buildLot(panelId);
  }

  async placeBid(input: PlaceBidInput, now: Date): Promise<PlaceBidResult> {
    const existingBidId = this.idempotency.get(input.idempotencyKey);
    if (existingBidId) {
      const bid = this.bids.find((b) => b.id === existingBidId);
      const lot = this.buildLot(input.panelId);
      if (bid && lot) return { ok: true, bid, lot, deduplicated: true };
    }

    const lot = this.buildLot(input.panelId);
    if (!lot) {
      return {
        ok: false,
        decision: { code: "UNKNOWN_PANEL", message: "Unknown lot.", nextAmountMinor: 0 },
      };
    }

    const decision = evaluateBid({
      panelStatus: lot.status,
      currentHighMinor: lot.currentHighMinor,
      lastBidAt: lot.lastBidAt,
      expectedAmountMinor: input.expectedAmountMinor,
      now,
      opensAt: config.auction.opensAt,
      closesAt: config.auction.closesAt,
    });
    if (!decision.ok) return { ok: false, decision };

    for (const previous of this.countedBidsFor(input.panelId)) {
      if (previous.status === "active") previous.status = "outbid";
    }

    const bid: BidRecord = {
      id: randomUUID(),
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
      decidedAt: null,
    };
    this.bids.push(bid);
    this.idempotency.set(input.idempotencyKey, bid.id);

    const updated = this.buildLot(input.panelId);
    return { ok: true, bid, lot: updated ?? lot, deduplicated: false };
  }

  async listBids(options: ListBidsOptions): Promise<ListBidsPage> {
    const filtered = this.bids
      .filter((b) => (options.panelId ? b.panelId === options.panelId : true))
      .filter((b) => (options.status ? b.status === options.status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: filtered.slice(options.offset, options.offset + options.limit),
      total: filtered.length,
    };
  }

  async decideBid(
    bidId: string,
    status: Extract<BidStatus, "accepted" | "rejected">,
  ): Promise<BidRecord | undefined> {
    const bid = this.bids.find((b) => b.id === bidId);
    if (!bid) return undefined;
    bid.status = status;
    bid.decidedAt = new Date();
    return bid;
  }

  async setLotStatus(panelId: string, status: PanelStatus): Promise<LotState | undefined> {
    if (!findPanel(panelId)) return undefined;
    this.lotStatus.set(panelId, status);
    return this.buildLot(panelId);
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: "in-process store; not durable" };
  }
}
