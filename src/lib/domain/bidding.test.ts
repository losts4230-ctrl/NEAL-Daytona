import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { PANEL_CATALOGUE } from "./panels";
import {
  ANTI_SNIPE_WINDOW_MS,
  bidIncrement,
  evaluateBid,
  extendedCloseAt,
  fundingPercent,
  nextBidAmount,
  type BidContext,
} from "./bidding";

const INCREMENT = config.auction.incrementMinor;

const OPENS = new Date("2026-01-01T00:00:00.000Z");
const CLOSES = new Date("2026-02-01T00:00:00.000Z");
const DURING = new Date("2026-01-15T00:00:00.000Z");

function ctx(overrides: Partial<BidContext> = {}): BidContext {
  return {
    panelStatus: "open",
    currentHighMinor: null,
    lastBidAt: null,
    expectedAmountMinor: INCREMENT,
    now: DURING,
    opensAt: OPENS,
    closesAt: CLOSES,
    ...overrides,
  };
}

describe("nextBidAmount", () => {
  it("opens a lot at one increment, which is what 'starts at zero' means", () => {
    expect(nextBidAmount(null)).toBe(INCREMENT);
  });

  it("adds exactly one increment to the standing bid, at any level", () => {
    for (const multiple of [1, 2, 17, 200]) {
      expect(nextBidAmount(INCREMENT * multiple)).toBe(INCREMENT * (multiple + 1));
    }
  });

  it("keeps price and bid count in lockstep, so price = count x increment", () => {
    // The property the whole mechanic rests on, and the one a reader of the
    // board is implicitly checking when they see "180 bids".
    let price: number | null = null;
    for (let count = 1; count <= 250; count++) {
      price = nextBidAmount(price);
      expect(price).toBe(count * INCREMENT);
    }
  });

  it("uses a positive increment", () => {
    expect(bidIncrement()).toBeGreaterThan(0);
    expect(Number.isInteger(bidIncrement())).toBe(true);
  });
});

describe("extendedCloseAt", () => {
  it("leaves the schedule alone when no bid has landed", () => {
    expect(extendedCloseAt(CLOSES, null).getTime()).toBe(CLOSES.getTime());
  });

  it("leaves the schedule alone for a bid well before the close", () => {
    expect(extendedCloseAt(CLOSES, DURING).getTime()).toBe(CLOSES.getTime());
  });

  it("pushes the close out for a bid inside the anti-snipe window", () => {
    const lateBid = new Date(CLOSES.getTime() - 60_000);
    expect(extendedCloseAt(CLOSES, lateBid).getTime()).toBe(
      lateBid.getTime() + ANTI_SNIPE_WINDOW_MS,
    );
  });
});

describe("evaluateBid", () => {
  it("accepts a first bid at exactly the opening price", () => {
    expect(evaluateBid(ctx()).ok).toBe(true);
  });

  it("accepts a raise at exactly one increment above the standing bid", () => {
    const decision = evaluateBid(
      ctx({ currentHighMinor: INCREMENT, expectedAmountMinor: INCREMENT * 2 }),
    );
    expect(decision).toEqual({ ok: true, amountMinor: INCREMENT * 2 });
  });

  it("rejects a stale price and reports the live one", () => {
    // The bidder loaded the page at one increment, someone bid, they clicked.
    const decision = evaluateBid(
      ctx({ currentHighMinor: INCREMENT * 3, expectedAmountMinor: INCREMENT * 2 }),
    );
    expect(decision).toMatchObject({ ok: false, code: "PRICE_MOVED" });
    if (!decision.ok) expect(decision.nextAmountMinor).toBe(INCREMENT * 4);
  });

  it("rejects an over-payment as firmly as an under-payment", () => {
    // A client cannot opt into a higher price: the amount is the server's to set,
    // so a tampered or fat-fingered payload is refused rather than honoured.
    const decision = evaluateBid(ctx({ expectedAmountMinor: INCREMENT * 50 }));
    expect(decision).toMatchObject({ ok: false, code: "PRICE_MOVED" });
  });

  it("never returns an accepted amount the caller supplied", () => {
    const decision = evaluateBid(ctx({ currentHighMinor: INCREMENT * 7, expectedAmountMinor: INCREMENT * 8 }));
    expect(decision.ok && decision.amountMinor).toBe(INCREMENT * 8);
  });

  it("rejects bids before the auction opens", () => {
    expect(evaluateBid(ctx({ now: new Date("2025-12-31T23:59:59.000Z") }))).toMatchObject({
      ok: false,
      code: "AUCTION_NOT_OPEN",
    });
  });

  it("rejects bids after the auction closes", () => {
    expect(evaluateBid(ctx({ now: CLOSES }))).toMatchObject({
      ok: false,
      code: "AUCTION_CLOSED",
    });
  });

  it("accepts a bid in the extension granted by a late bid", () => {
    const lateBid = new Date(CLOSES.getTime() - 60_000);
    const decision = evaluateBid(
      ctx({
        lastBidAt: lateBid,
        currentHighMinor: INCREMENT,
        expectedAmountMinor: INCREMENT * 2,
        now: new Date(CLOSES.getTime() + 60_000),
      }),
    );
    expect(decision.ok).toBe(true);
  });

  it("rejects bids on a lot that is not open", () => {
    for (const status of ["reserved", "sold", "withdrawn"] as const) {
      expect(evaluateBid(ctx({ panelStatus: status }))).toMatchObject({
        ok: false,
        code: "PANEL_UNAVAILABLE",
      });
    }
  });

  it("checks the window before the price, so a closed lot reports closed", () => {
    const decision = evaluateBid(ctx({ now: CLOSES, expectedAmountMinor: 1 }));
    expect(decision).toMatchObject({ ok: false, code: "AUCTION_CLOSED" });
  });

  it("always reports the live next price on a rejection", () => {
    const decision = evaluateBid(ctx({ now: CLOSES, currentHighMinor: INCREMENT * 4 }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.nextAmountMinor).toBe(INCREMENT * 5);
  });
});

describe("fundingPercent", () => {
  it("is zero at nothing raised", () => {
    expect(fundingPercent(0, 1_000_000)).toBe(0);
  });

  it("is proportional in between", () => {
    expect(fundingPercent(250_000, 1_000_000)).toBe(25);
  });

  it("clamps at 100 so an over-funded bar cannot overflow its track", () => {
    expect(fundingPercent(5_000_000, 1_000_000)).toBe(100);
  });

  it("does not divide by zero on a missing target", () => {
    expect(fundingPercent(100, 0)).toBe(0);
  });
});

describe("PANEL_CATALOGUE", () => {
  it("has unique ids", () => {
    const ids = PANEL_CATALOGUE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique, contiguous sort orders starting at 1", () => {
    const orders = PANEL_CATALOGUE.map((p) => p.sortOrder).sort((a, b) => a - b);
    expect(orders).toEqual(PANEL_CATALOGUE.map((_, i) => i + 1));
  });

  it("is already in presentation order, since the order is the pricing signal", () => {
    const orders = PANEL_CATALOGUE.map((p) => p.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("describes and measures every lot", () => {
    for (const p of PANEL_CATALOGUE) {
      expect(p.areaCm2).toBeGreaterThan(0);
      expect(p.descriptor.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});
