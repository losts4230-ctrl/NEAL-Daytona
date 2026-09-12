import { minimumBid } from "@/lib/domain/bidding";
import type { BidRecord, LotState } from "@/lib/repo/types";
import { TIER_LABEL } from "@/lib/domain/panels";

/**
 * Public wire format for a lot. Note what is absent: no bidder email, name,
 * phone, IP hash or user agent. The only identity exposed is `displayName`,
 * which the bidder chose knowing it would be published.
 */
export interface PublicLot {
  id: string;
  name: string;
  location: string;
  tier: string;
  tierLabel: string;
  areaCm2: number;
  reserveMinor: number;
  notes: string;
  status: LotState["status"];
  currentHighMinor: number | null;
  currentHighDisplayName: string | null;
  minimumBidMinor: number;
  bidCount: number;
  lastBidAt: string | null;
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
    location: lot.panel.location,
    tier: lot.panel.tier,
    tierLabel: TIER_LABEL[lot.panel.tier],
    areaCm2: lot.panel.areaCm2,
    reserveMinor: lot.panel.reserveMinor,
    notes: lot.panel.notes,
    status: lot.status,
    currentHighMinor: lot.currentHighMinor,
    currentHighDisplayName: lot.currentHighDisplayName,
    minimumBidMinor: minimumBid(lot.panel, lot.currentHighMinor),
    bidCount: lot.bidCount,
    lastBidAt: lot.lastBidAt ? lot.lastBidAt.toISOString() : null,
  };
}

/** Receipt returned to the bidder. Echoes only what they themselves submitted. */
export interface PublicBidReceipt {
  id: string;
  panelId: string;
  amountMinor: number;
  displayName: string;
  status: BidRecord["status"];
  createdAt: string;
}

export function toPublicBidReceipt(bid: BidRecord): PublicBidReceipt {
  return {
    id: bid.id,
    panelId: bid.panelId,
    amountMinor: bid.amountMinor,
    displayName: bid.displayName,
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
