import { config } from "@/lib/config";
import type { Minor } from "./money";
import type { PanelStatus } from "./panels";

/**
 * Every bidding rule lives here as a pure function of its inputs. No database,
 * no request context — which is why these rules are the only part of the system
 * that can be exhaustively unit tested, and why the API layer must never
 * re-implement a threshold of its own.
 *
 * THE MECHANIC
 * ------------
 * Every lot starts at zero. Each bid raises it by exactly one flat increment.
 * A lot's price is therefore always (bid count x increment), and the next price
 * is never ambiguous or negotiable — there is no amount field to fill in, only
 * a price to accept.
 *
 * That is a deliberate trade against free-entry bidding. It gives up the jump
 * bid (a sponsor cannot pay over the odds to lock a panel early) and buys three
 * things worth more on a site like this: nobody can fat-finger an extra zero,
 * the price is legible at a glance without explaining reserves or increment
 * bands, and every bid is the same small step, so the ratchet keeps moving.
 */

/** The flat step. Configured once, read from here by everything else. */
export function bidIncrement(): Minor {
  return config.auction.incrementMinor;
}

/**
 * The exact price of the next bid on a lot. With no standing bid that is one
 * increment, which is what "every auction starts at zero" means in practice.
 */
export function nextBidAmount(currentHighMinor: Minor | null): Minor {
  return (currentHighMinor ?? 0) + bidIncrement();
}

/**
 * Anti-sniping: a bid inside the final window pushes the lot's close out, so a
 * last-second bid cannot win purely on timing. Applied per lot, not per auction.
 */
export const ANTI_SNIPE_WINDOW_MS = 5 * 60 * 1000;

export function extendedCloseAt(scheduledCloseAt: Date, lastBidAt: Date | null): Date {
  if (lastBidAt === null) return scheduledCloseAt;
  const extendedTo = lastBidAt.getTime() + ANTI_SNIPE_WINDOW_MS;
  return extendedTo > scheduledCloseAt.getTime() ? new Date(extendedTo) : scheduledCloseAt;
}

export type BidRejectionCode =
  | "AUCTION_NOT_OPEN"
  | "AUCTION_CLOSED"
  | "PANEL_UNAVAILABLE"
  | "PRICE_MOVED";

export type BidDecision =
  | { ok: true; amountMinor: Minor }
  | { ok: false; code: BidRejectionCode; message: string; nextAmountMinor: Minor };

export interface BidContext {
  panelStatus: PanelStatus;
  currentHighMinor: Minor | null;
  lastBidAt: Date | null;
  /**
   * The price the bidder was shown when they clicked.
   *
   * Checked against the live price rather than trusted: without it, a bidder who
   * loaded the page at a lower price and clicked minutes later would silently be
   * committed to whatever the price had climbed to. If it has moved they are
   * told the new price and asked again.
   */
  expectedAmountMinor: Minor;
  now: Date;
  opensAt: Date;
  closesAt: Date;
}

/** The single authority on whether a bid is acceptable. */
export function evaluateBid(ctx: BidContext): BidDecision {
  const nextAmountMinor = nextBidAmount(ctx.currentHighMinor);

  if (ctx.now < ctx.opensAt) {
    return {
      ok: false,
      code: "AUCTION_NOT_OPEN",
      message: "Bidding has not opened yet.",
      nextAmountMinor,
    };
  }

  if (ctx.now >= extendedCloseAt(ctx.closesAt, ctx.lastBidAt)) {
    return {
      ok: false,
      code: "AUCTION_CLOSED",
      message: "Bidding on this lot has closed.",
      nextAmountMinor,
    };
  }

  if (ctx.panelStatus !== "open") {
    return {
      ok: false,
      code: "PANEL_UNAVAILABLE",
      message: `This lot is no longer accepting bids (${ctx.panelStatus}).`,
      nextAmountMinor,
    };
  }

  if (ctx.expectedAmountMinor !== nextAmountMinor) {
    return {
      ok: false,
      code: "PRICE_MOVED",
      message: "Someone bid first. The price has moved.",
      nextAmountMinor,
    };
  }

  return { ok: true, amountMinor: nextAmountMinor };
}

/** Progress toward the purchase target, clamped so the bar cannot overflow. */
export function fundingPercent(committedMinor: Minor, targetMinor: Minor): number {
  if (targetMinor <= 0) return 0;
  return Math.min(100, Math.max(0, (committedMinor / targetMinor) * 100));
}
