import { randomUUID } from "node:crypto";
import { config } from "@/lib/config";
import { evaluateBid } from "@/lib/domain/bidding";
import { PANEL_CATALOGUE, findPanel, type PanelStatus } from "@/lib/domain/panels";
import type {
  AuctionRepository,
  BidRecord,
  BidStatus,
  ListBidsOptions,
  ListBidsPage,
  LotState,
  PlaceBidInput,
  PlaceBidResult,
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

  private liveBidsFor(panelId: string): BidRecord[] {
    return this.bids
      .filter((b) => b.panelId === panelId && (b.status === "active" || b.status === "accepted"))
      .sort(
        (a, b) =>
          b.amountMinor - a.amountMinor || a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  private buildLot(panelId: string): LotState | undefined {
    const panel = findPanel(panelId);
    if (!panel) return undefined;
    const live = this.liveBidsFor(panelId);
    const top = live[0];
    const lastBidAt = live.reduce<Date | null>(
      (latest, b) => (latest === null || b.createdAt > latest ? b.createdAt : latest),
      null,
    );
    return {
      panel,
      status: this.lotStatus.get(panelId) ?? "open",
      currentHighMinor: top?.amountMinor ?? null,
      currentHighDisplayName: top?.displayName ?? null,
      bidCount: live.length,
      lastBidAt,
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
        decision: { code: "UNKNOWN_PANEL", message: "Unknown lot.", minimumMinor: 0 },
      };
    }

    const decision = evaluateBid({
      panel: lot.panel,
      panelStatus: lot.status,
      currentHighMinor: lot.currentHighMinor,
      lastBidAt: lot.lastBidAt,
      amountMinor: input.amountMinor,
      now,
      opensAt: config.auction.opensAt,
      closesAt: config.auction.closesAt,
    });
    if (!decision.ok) return { ok: false, decision };

    for (const previous of this.liveBidsFor(input.panelId)) {
      if (previous.status === "active") previous.status = "outbid";
    }

    const bid: BidRecord = {
      id: randomUUID(),
      panelId: input.panelId,
      amountMinor: input.amountMinor,
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
