import { describe, expect, it } from "vitest";
import { toMinor } from "./money";
import { PANEL_CATALOGUE, type PanelDefinition } from "./panels";
import {
  ANTI_SNIPE_WINDOW_MS,
  bidIncrement,
  evaluateBid,
  extendedCloseAt,
  minimumBid,
  type BidContext,
} from "./bidding";

const panel: PanelDefinition = {
  id: "test-panel",
  name: "Test Panel",
  location: "Nowhere",
  tier: "standard",
  areaCm2: 100,
  reserveMinor: toMinor(200),
  notes: "",
  sortOrder: 1,
};

const OPENS = new Date("2026-01-01T00:00:00.000Z");
const CLOSES = new Date("2026-02-01T00:00:00.000Z");
const DURING = new Date("2026-01-15T00:00:00.000Z");

function ctx(overrides: Partial<BidContext> = {}): BidContext {
  return {
    panel,
    panelStatus: "open",
    currentHighMinor: null,
    lastBidAt: null,
    amountMinor: toMinor(200),
    now: DURING,
    opensAt: OPENS,
    closesAt: CLOSES,
    ...overrides,
  };
}

describe("bidIncrement", () => {
  it("uses the band the current amount falls into", () => {
    expect(bidIncrement(toMinor(0))).toBe(toMinor(10));
    expect(bidIncrement(toMinor(249))).toBe(toMinor(10));
    expect(bidIncrement(toMinor(250))).toBe(toMinor(25));
    expect(bidIncrement(toMinor(999))).toBe(toMinor(25));
    expect(bidIncrement(toMinor(1_000))).toBe(toMinor(100));
    expect(bidIncrement(toMinor(4_999))).toBe(toMinor(100));
    expect(bidIncrement(toMinor(5_000))).toBe(toMinor(250));
    expect(bidIncrement(toMinor(1_000_000))).toBe(toMinor(250));
  });

  it("never returns a non-positive increment", () => {
    for (const amount of [0, 1, 25_000, 100_000_000]) {
      expect(bidIncrement(amount)).toBeGreaterThan(0);
    }
  });
});

describe("minimumBid", () => {
  it("is the reserve when there is no standing bid", () => {
    expect(minimumBid(panel, null)).toBe(panel.reserveMinor);
  });

  it("adds the banded increment to the standing bid", () => {
    expect(minimumBid(panel, toMinor(200))).toBe(toMinor(210));
    expect(minimumBid(panel, toMinor(1_000))).toBe(toMinor(1_100));
  });

  it("is strictly increasing, so a lot can never stall", () => {
    let current = panel.reserveMinor;
    for (let i = 0; i < 200; i++) {
      const next = minimumBid(panel, current);
      expect(next).toBeGreaterThan(current);
      current = next;
    }
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
  it("accepts a first bid at exactly the reserve", () => {
    const decision = evaluateBid(ctx({ amountMinor: panel.reserveMinor }));
    expect(decision.ok).toBe(true);
  });

  it("rejects a first bid a single minor unit under the reserve", () => {
    const decision = evaluateBid(ctx({ amountMinor: panel.reserveMinor - 1 }));
    expect(decision).toMatchObject({ ok: false, code: "BELOW_MINIMUM" });
  });

  it("rejects a raise that does not clear the increment", () => {
    const decision = evaluateBid(
      ctx({ currentHighMinor: toMinor(200), amountMinor: toMinor(205) }),
    );
    expect(decision).toMatchObject({ ok: false, code: "BELOW_MINIMUM" });
    if (!decision.ok) expect(decision.minimumMinor).toBe(toMinor(210));
  });

  it("rejects bids before the auction opens", () => {
    const decision = evaluateBid(ctx({ now: new Date("2025-12-31T23:59:59.000Z") }));
    expect(decision).toMatchObject({ ok: false, code: "AUCTION_NOT_OPEN" });
  });

  it("rejects bids after the auction closes", () => {
    const decision = evaluateBid(ctx({ now: CLOSES }));
    expect(decision).toMatchObject({ ok: false, code: "AUCTION_CLOSED" });
  });

  it("accepts a bid in the extension granted by a late bid", () => {
    const lateBid = new Date(CLOSES.getTime() - 60_000);
    const decision = evaluateBid({
      ...ctx({ lastBidAt: lateBid, currentHighMinor: toMinor(200) }),
      now: new Date(CLOSES.getTime() + 60_000),
      amountMinor: toMinor(210),
    });
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

  it("rejects fractional and non-positive amounts", () => {
    for (const amount of [0, -1, 1.5, Number.NaN]) {
      expect(evaluateBid(ctx({ amountMinor: amount, currentHighMinor: null }))).toMatchObject({
        ok: false,
      });
    }
  });

  it("checks the auction window before the amount, so a closed lot never leaks a minimum raise", () => {
    const decision = evaluateBid(ctx({ now: CLOSES, amountMinor: 0 }));
    expect(decision).toMatchObject({ ok: false, code: "AUCTION_CLOSED" });
  });
});

describe("PANEL_CATALOGUE", () => {
  it("has unique ids", () => {
    const ids = PANEL_CATALOGUE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique sort orders", () => {
    const orders = PANEL_CATALOGUE.map((p) => p.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("prices every lot above zero and describes every lot", () => {
    for (const p of PANEL_CATALOGUE) {
      expect(p.reserveMinor).toBeGreaterThan(0);
      expect(p.areaCm2).toBeGreaterThan(0);
      expect(p.notes.length).toBeGreaterThan(0);
      expect(p.reserveMinor % 1).toBe(0);
    }
  });
});
