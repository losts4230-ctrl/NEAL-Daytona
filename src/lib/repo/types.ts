import type { BidDecision } from "@/lib/domain/bidding";
import type { Minor } from "@/lib/domain/money";
import type { PanelDefinition, PanelStatus } from "@/lib/domain/panels";

/** Full server-side view of a lot: catalogue definition plus live state. */
export interface LotState {
  panel: PanelDefinition;
  status: PanelStatus;
  currentHighMinor: Minor | null;
  currentHighDisplayName: string | null;
  bidCount: number;
  lastBidAt: Date | null;
}

export type BidStatus = "active" | "outbid" | "accepted" | "rejected" | "withdrawn";

/**
 * A bid as stored. Contact fields are private by construction: nothing in the
 * public API path is allowed to accept this type — see serialise.ts.
 */
export interface BidRecord {
  id: string;
  panelId: string;
  amountMinor: Minor;
  displayName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  brandUrl: string | null;
  message: string | null;
  status: BidStatus;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface PlaceBidInput {
  panelId: string;
  amountMinor: Minor;
  displayName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  brandUrl: string | null;
  message: string | null;
  ipHash: string | null;
  userAgent: string | null;
  /** Deduplicates retries of the same logical submission. */
  idempotencyKey: string;
}

export type PlaceBidResult =
  | { ok: true; bid: BidRecord; lot: LotState; deduplicated: boolean }
  | { ok: false; decision: Extract<BidDecision, { ok: false }> }
  | { ok: false; decision: { code: "UNKNOWN_PANEL"; message: string; minimumMinor: 0 } };

export interface ListBidsOptions {
  panelId?: string;
  status?: BidStatus;
  limit: number;
  offset: number;
}

export interface ListBidsPage {
  items: BidRecord[];
  total: number;
}

/**
 * Persistence boundary.
 *
 * `placeBid` deliberately owns both the validation and the write: the read of
 * the standing high bid and the insert of the new one must be one serialised
 * operation, or two bidders racing on the same lot can both be told they won.
 * Callers must never validate-then-insert through separate methods.
 */
export interface AuctionRepository {
  readonly driver: "memory" | "postgres";
  listLots(): Promise<LotState[]>;
  getLot(panelId: string): Promise<LotState | undefined>;
  placeBid(input: PlaceBidInput, now: Date): Promise<PlaceBidResult>;
  listBids(options: ListBidsOptions): Promise<ListBidsPage>;
  decideBid(bidId: string, status: Extract<BidStatus, "accepted" | "rejected">): Promise<BidRecord | undefined>;
  setLotStatus(panelId: string, status: PanelStatus): Promise<LotState | undefined>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}
