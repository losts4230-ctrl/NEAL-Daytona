import type { BidDecision } from "@/lib/domain/bidding";
import type { Minor } from "@/lib/domain/money";
import type { PanelDefinition, PanelStatus } from "@/lib/domain/panels";

/** A bid as shown in a lot's public history strip. Contact data is absent by construction. */
export interface PublicBidEntry {
  displayName: string;
  /** Hostname of the bidder's supplied URL, or null. Drives the brand icon. */
  brandDomain: string | null;
  amountMinor: Minor;
  createdAt: Date;
}

/** Full server-side view of a lot: catalogue definition plus live state. */
export interface LotState {
  panel: PanelDefinition;
  status: PanelStatus;
  currentHighMinor: Minor | null;
  currentHighDisplayName: string | null;
  currentHighDomain: string | null;
  bidCount: number;
  lastBidAt: Date | null;
  /** Most recent live bids, newest first. Length capped by config. */
  recentBids: PublicBidEntry[];
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
  /**
   * The price the bidder was shown. The server recomputes the real next price
   * and rejects a mismatch rather than charging whatever the price has become.
   */
  expectedAmountMinor: Minor;
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
  | { ok: false; decision: { code: "UNKNOWN_PANEL"; message: string; nextAmountMinor: 0 } };

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
  decideBid(
    bidId: string,
    status: Extract<BidStatus, "accepted" | "rejected">,
  ): Promise<BidRecord | undefined>;
  setLotStatus(panelId: string, status: PanelStatus): Promise<LotState | undefined>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

/**
 * Hostname of a bidder-supplied URL, or null if absent or unparseable.
 *
 * Kept here rather than in the UI so both drivers and both serialisers derive it
 * identically, and so a malformed URL can never reach a template. `www.` is
 * stripped because the domain is displayed, and "www.example.com" reads as noise
 * next to a brand name.
 */
export function brandDomain(brandUrl: string | null): string | null {
  if (!brandUrl) return null;
  try {
    const url = new URL(brandUrl);

    // `new URL` happily parses "javascript:alert(1)" and "mailto:a@b.c", both of
    // which have an empty hostname. Returning "" there would put a value that
    // is not a domain into a field every consumer treats as one, so anything
    // without a real host is simply absent.
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host.length === 0) return null;

    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}
