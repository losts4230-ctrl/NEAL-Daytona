import { nextBidAmount } from "@/lib/domain/bidding";
import type { BidRecord, LotState, PublicBidEntry } from "@/lib/repo/types";
import { brandDomain } from "@/lib/repo/types";

/** One row of a lot's public bid history. */
export interface PublicBid {
  displayName: string;
  brandDomain: string | null;
  amountMinor: number;
  createdAt: string;
}

/**
 * Public wire format for a lot. Note what is absent: no bidder email, name,
 * phone, IP hash or user agent. The only identity exposed is `displayName` and
 * the hostname of a URL the bidder chose to publish.
 */
export interface PublicLot {
  id: string;
  name: string;
  descriptor: string;
  areaCm2: number;
  bothSides: boolean;
  status: LotState["status"];
  currentHighMinor: number | null;
  currentHighDisplayName: string | null;
  currentHighDomain: string | null;
  /** Exact price of the next bid. There is no amount to choose. */
  nextBidMinor: number;
  bidCount: number;
  lastBidAt: string | null;
  recentBids: PublicBid[];
}

function toPublicBid(entry: PublicBidEntry): PublicBid {
  return {
    displayName: entry.displayName,
    brandDomain: entry.brandDomain,
    amountMinor: entry.amountMinor,
    createdAt: entry.createdAt.toISOString(),
  };
}

/**
 * The single chokepoint between stored bids and any public response.
 *
 * Building the DTO field by field — rather than spreading the record and
 * deleting the private keys — means a new private column added to the schema
 * tomorrow cannot accidentally become public today.
 */
export function toPublicLot(lot: LotState): PublicLot {
  return {
    id: lot.panel.id,
    name: lot.panel.name,
    descriptor: lot.panel.descriptor,
    areaCm2: lot.panel.areaCm2,
    bothSides: lot.panel.bothSides,
    status: lot.status,
    currentHighMinor: lot.currentHighMinor,
    currentHighDisplayName: lot.currentHighDisplayName,
    currentHighDomain: lot.currentHighDomain,
    nextBidMinor: nextBidAmount(lot.currentHighMinor),
    bidCount: lot.bidCount,
    lastBidAt: lot.lastBidAt ? lot.lastBidAt.toISOString() : null,
    recentBids: lot.recentBids.map(toPublicBid),
  };
}

/** Receipt returned to the bidder. Echoes only what they themselves submitted. */
export interface PublicBidReceipt {
  id: string;
  panelId: string;
  amountMinor: number;
  displayName: string;
  brandDomain: string | null;
  status: BidRecord["status"];
  createdAt: string;
}

export function toPublicBidReceipt(bid: BidRecord): PublicBidReceipt {
  return {
    id: bid.id,
    panelId: bid.panelId,
    amountMinor: bid.amountMinor,
    displayName: bid.displayName,
    brandDomain: brandDomain(bid.brandUrl),
    status: bid.status,
    createdAt: bid.createdAt.toISOString(),
  };
}

/** Admin wire format. Contact fields are intentionally present here. */
export interface AdminBid extends PublicBidReceipt {
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  brandUrl: string | null;
  message: string | null;
  decidedAt: string | null;
}

export function toAdminBid(bid: BidRecord): AdminBid {
  return {
    ...toPublicBidReceipt(bid),
    contactName: bid.contactName,
    contactEmail: bid.contactEmail,
    contactPhone: bid.contactPhone,
    brandUrl: bid.brandUrl,
    message: bid.message,
    decidedAt: bid.decidedAt ? bid.decidedAt.toISOString() : null,
  };
}
