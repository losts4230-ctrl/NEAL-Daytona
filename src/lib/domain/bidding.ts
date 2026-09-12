import { type Minor, toMinor } from "./money";
import type { PanelDefinition, PanelStatus } from "./panels";

/**
 * Every bidding rule lives here as a pure function of its inputs. No clock, no
 * database, no request context — which is why these rules are the only part of
 * the system that can be exhaustively unit tested, and why the API layer must
 * never re-implement a threshold of its own.
 */

/** Minimum raise, tiered so low lots stay accessible and hero lots move fast. */
const INCREMENT_BANDS: readonly { upTo: Minor; incrementMinor: Minor }[] = [
  { upTo: toMinor(250), incrementMinor: toMinor(10) },
  { upTo: toMinor(1_000), incrementMinor: toMinor(25) },
  { upTo: toMinor(5_000), incrementMinor: toMinor(100) },
  { upTo: Number.POSITIVE_INFINITY, incrementMinor: toMinor(250) },
];

export function bidIncrement(currentMinor: Minor): Minor {
  for (const band of INCREMENT_BANDS) {
    if (currentMinor < band.upTo) return band.incrementMinor;
  }
  // Unreachable: the final band is unbounded. Kept for exhaustiveness.
  return toMinor(250);
}

/**
 * The smallest amount that would be accepted right now. With no standing bid
 * this is the reserve itself, so the first bidder can take a lot at reserve.
 */
export function minimumBid(panel: PanelDefinition, currentHighMinor: Minor | null): Minor {
  if (currentHighMinor === null) return panel.reserveMinor;
  return currentHighMinor + bidIncrement(currentHighMinor);
}

/**
 * Anti-sniping: a bid inside the final window pushes the lot's close out, so a
 * last-second bid cannot win purely on timing. Applied per lot, not per auction.
 */
export const ANTI_SNIPE_WINDOW_MS = 5 * 60 * 1000;

export function extendedCloseAt(
  scheduledCloseAt: Date,
  lastBidAt: Date | null,
): Date {
  if (lastBidAt === null) return scheduledCloseAt;
  const extendedTo = lastBidAt.getTime() + ANTI_SNIPE_WINDOW_MS;
  return extendedTo > scheduledCloseAt.getTime() ? new Date(extendedTo) : scheduledCloseAt;
}

export type BidRejectionCode =
  | "AUCTION_NOT_OPEN"
  | "AUCTION_CLOSED"
  | "PANEL_UNAVAILABLE"
  | "INVALID_AMOUNT"
  | "BELOW_MINIMUM";

export type BidDecision =
  | { ok: true; amountMinor: Minor }
  | { ok: false; code: BidRejectionCode; message: string; minimumMinor: Minor };

export interface BidContext {
  panel: PanelDefinition;
  panelStatus: PanelStatus;
  currentHighMinor: Minor | null;
  lastBidAt: Date | null;
  amountMinor: Minor;
  now: Date;
  opensAt: Date;
  closesAt: Date;
}

/** The single authority on whether a bid is acceptable. */
export function evaluateBid(ctx: BidContext): BidDecision {
  const minimumMinor = minimumBid(ctx.panel, ctx.currentHighMinor);

  if (ctx.now < ctx.opensAt) {
    return {
      ok: false,
      code: "AUCTION_NOT_OPEN",
      message: "Bidding has not opened yet.",
      minimumMinor,
    };
  }

  if (ctx.now >= extendedCloseAt(ctx.closesAt, ctx.lastBidAt)) {
    return {
      ok: false,
      code: "AUCTION_CLOSED",
      message: "Bidding on this lot has closed.",
      minimumMinor,
    };
  }

  if (ctx.panelStatus !== "open") {
    return {
      ok: false,
      code: "PANEL_UNAVAILABLE",
      message: `This lot is no longer accepting bids (${ctx.panelStatus}).`,
      minimumMinor,
    };
  }

  if (!Number.isInteger(ctx.amountMinor) || ctx.amountMinor <= 0) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message: "Bid amount must be a positive whole number of minor units.",
      minimumMinor,
    };
  }

  if (ctx.amountMinor < minimumMinor) {
    return {
      ok: false,
      code: "BELOW_MINIMUM",
      message: "Bid is below the minimum for this lot.",
      minimumMinor,
    };
  }

  return { ok: true, amountMinor: ctx.amountMinor };
}
