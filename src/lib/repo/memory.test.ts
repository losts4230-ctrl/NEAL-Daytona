import { beforeEach, describe, expect, it } from "vitest";
import { toMinor } from "@/lib/domain/money";
import { PANEL_CATALOGUE } from "@/lib/domain/panels";
import { MemoryAuctionRepository } from "./memory";
import type { PlaceBidInput } from "./types";

/**
 * These exercise the repository contract — idempotency, outbid transitions, the
 * standing-high-bid calculation — against the in-memory adapter. The Postgres
 * adapter implements the same contract, so this file is the specification both
 * drivers are held to.
 */

const HERO = PANEL_CATALOGUE[0]!;
const NOW = new Date("2026-10-01T12:00:00.000Z");

let repo: MemoryAuctionRepository;
let keySeed = 0;

function bid(overrides: Partial<PlaceBidInput> = {}): PlaceBidInput {
  keySeed += 1;
  return {
    panelId: HERO.id,
    amountMinor: HERO.reserveMinor,
    displayName: "Test Brand",
    contactName: "Test Person",
    contactEmail: "bidder@example.com",
    contactPhone: null,
    brandUrl: null,
    message: null,
    ipHash: "hash",
    userAgent: "vitest",
    idempotencyKey: `key-${keySeed}-abcdefgh`,
    ...overrides,
  };
}

beforeEach(() => {
  repo = new MemoryAuctionRepository();
});

describe("listLots", () => {
  it("returns the whole catalogue in catalogue order", async () => {
    const lots = await repo.listLots();
    expect(lots).toHaveLength(PANEL_CATALOGUE.length);
    expect(lots.map((l) => l.panel.id)).toEqual(PANEL_CATALOGUE.map((p) => p.id));
  });

  it("starts every lot open with no bids", async () => {
    for (const lot of await repo.listLots()) {
      expect(lot.status).toBe("open");
      expect(lot.currentHighMinor).toBeNull();
      expect(lot.bidCount).toBe(0);
      expect(lot.lastBidAt).toBeNull();
    }
  });
});

describe("placeBid", () => {
  it("accepts a first bid at reserve and reports it as the high bid", async () => {
    const result = await repo.placeBid(bid(), NOW);
    expect(result.ok).toBe(true);

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighMinor).toBe(HERO.reserveMinor);
    expect(lot?.currentHighDisplayName).toBe("Test Brand");
    expect(lot?.bidCount).toBe(1);
  });

  it("rejects a second bid that does not clear the increment", async () => {
    await repo.placeBid(bid(), NOW);
    const result = await repo.placeBid(bid({ amountMinor: HERO.reserveMinor }), NOW);
    expect(result).toMatchObject({ ok: false, decision: { code: "BELOW_MINIMUM" } });
  });

  it("marks the previous leader outbid and keeps it in the ledger", async () => {
    await repo.placeBid(bid({ displayName: "First" }), NOW);
    await repo.placeBid(
      bid({ displayName: "Second", amountMinor: HERO.reserveMinor + toMinor(100) }),
      NOW,
    );

    const page = await repo.listBids({ limit: 50, offset: 0 });
    expect(page.total).toBe(2);

    const statuses = Object.fromEntries(page.items.map((b) => [b.displayName, b.status]));
    expect(statuses).toEqual({ First: "outbid", Second: "active" });

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighDisplayName).toBe("Second");
    // The outbid bid no longer counts towards the live total.
    expect(lot?.bidCount).toBe(1);
  });

  it("returns the original bid for a replayed idempotency key", async () => {
    const input = bid();
    const first = await repo.placeBid(input, NOW);
    const second = await repo.placeBid(input, NOW);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.deduplicated).toBe(true);
      expect(second.bid.id).toBe(first.bid.id);
    }
    // Critically: the replay created no second bid.
    expect((await repo.listBids({ limit: 50, offset: 0 })).total).toBe(1);
  });

  it("rejects a bid on an unknown lot", async () => {
    const result = await repo.placeBid(bid({ panelId: "not-a-lot" }), NOW);
    expect(result).toMatchObject({ ok: false, decision: { code: "UNKNOWN_PANEL" } });
  });

  it("keeps lots independent", async () => {
    const other = PANEL_CATALOGUE[1]!;
    await repo.placeBid(bid(), NOW);

    const otherLot = await repo.getLot(other.id);
    expect(otherLot?.currentHighMinor).toBeNull();
    expect(otherLot?.bidCount).toBe(0);
  });

  it("serialises a burst of concurrent bids into exactly one winner", async () => {
    // The read-modify-write inside placeBid must not interleave. Fire a burst at
    // the same amount: exactly one can legally win, and the losers must be told
    // they were below the minimum rather than all being accepted.
    const amount = HERO.reserveMinor;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        repo.placeBid(bid({ amountMinor: amount, displayName: `Bidder ${i}` }), NOW),
      ),
    );

    const accepted = results.filter((r) => r.ok);
    expect(accepted).toHaveLength(1);

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighMinor).toBe(amount);
    expect(lot?.bidCount).toBe(1);
  });
});

describe("lot and bid administration", () => {
  it("closes a lot to further bids when marked sold", async () => {
    await repo.setLotStatus(HERO.id, "sold");
    const result = await repo.placeBid(bid(), NOW);
    expect(result).toMatchObject({ ok: false, decision: { code: "PANEL_UNAVAILABLE" } });
  });

  it("returns undefined for an unknown lot status change", async () => {
    expect(await repo.setLotStatus("not-a-lot", "sold")).toBeUndefined();
  });

  it("records an accept decision with a timestamp", async () => {
    const placed = await repo.placeBid(bid(), NOW);
    if (!placed.ok) throw new Error("expected the bid to be accepted");

    const decided = await repo.decideBid(placed.bid.id, "accepted");
    expect(decided?.status).toBe("accepted");
    expect(decided?.decidedAt).toBeInstanceOf(Date);
  });

  it("returns undefined when deciding a bid that does not exist", async () => {
    expect(await repo.decideBid("00000000-0000-0000-0000-000000000000", "accepted")).toBeUndefined();
  });

  it("keeps an accepted bid as the standing high bid", async () => {
    const placed = await repo.placeBid(bid(), NOW);
    if (!placed.ok) throw new Error("expected the bid to be accepted");
    await repo.decideBid(placed.bid.id, "accepted");

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighMinor).toBe(HERO.reserveMinor);
  });

  it("drops a rejected bid out of the standing high bid", async () => {
    const placed = await repo.placeBid(bid(), NOW);
    if (!placed.ok) throw new Error("expected the bid to be accepted");
    await repo.decideBid(placed.bid.id, "rejected");

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighMinor).toBeNull();
    expect(lot?.bidCount).toBe(0);
  });

  it("paginates and filters the bid list", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.placeBid(
        bid({ amountMinor: HERO.reserveMinor + toMinor(100 * i), displayName: `B${i}` }),
        new Date(NOW.getTime() + i * 1000),
      );
    }

    const firstPage = await repo.listBids({ limit: 2, offset: 0 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(5);

    const active = await repo.listBids({ status: "active", limit: 50, offset: 0 });
    expect(active.items).toHaveLength(1);

    const scoped = await repo.listBids({ panelId: "not-a-lot", limit: 50, offset: 0 });
    expect(scoped.total).toBe(0);
  });
});
