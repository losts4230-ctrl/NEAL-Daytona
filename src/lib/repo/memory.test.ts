import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { PANEL_CATALOGUE } from "@/lib/domain/panels";
import { MemoryAuctionRepository } from "./memory";
import { brandDomain, type PlaceBidInput } from "./types";

/**
 * These exercise the repository contract — idempotency, the price ratchet, the
 * history strip — against the in-memory adapter. The Postgres adapter
 * implements the same contract, so this file is the specification both drivers
 * are held to.
 */

const HERO = PANEL_CATALOGUE[0]!;
const INCREMENT = config.auction.incrementMinor;
const NOW = new Date("2026-10-01T12:00:00.000Z");

let repo: MemoryAuctionRepository;
let keySeed = 0;

function bid(overrides: Partial<PlaceBidInput> = {}): PlaceBidInput {
  keySeed += 1;
  return {
    panelId: HERO.id,
    expectedAmountMinor: INCREMENT,
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

/** Places `count` successive bids on a lot, each at the then-correct price. */
async function ladder(repository: MemoryAuctionRepository, panelId: string, count: number) {
  for (let i = 1; i <= count; i++) {
    const result = await repository.placeBid(
      bid({ panelId, expectedAmountMinor: INCREMENT * i, displayName: `Bidder ${i}` }),
      new Date(NOW.getTime() + i * 1000),
    );
    if (!result.ok) throw new Error(`bid ${i} rejected: ${result.decision.code}`);
  }
}

beforeEach(() => {
  repo = new MemoryAuctionRepository();
  keySeed = 0;
});

describe("listLots", () => {
  it("returns the whole catalogue in catalogue order", async () => {
    const lots = await repo.listLots();
    expect(lots).toHaveLength(PANEL_CATALOGUE.length);
    expect(lots.map((l) => l.panel.id)).toEqual(PANEL_CATALOGUE.map((p) => p.id));
  });

  it("starts every lot open, at zero, with no history", async () => {
    for (const lot of await repo.listLots()) {
      expect(lot.status).toBe("open");
      expect(lot.currentHighMinor).toBeNull();
      expect(lot.bidCount).toBe(0);
      expect(lot.lastBidAt).toBeNull();
      expect(lot.recentBids).toEqual([]);
    }
  });
});

describe("placeBid", () => {
  it("accepts the opening bid and reports it as the high bid", async () => {
    const result = await repo.placeBid(bid(), NOW);
    expect(result.ok).toBe(true);

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighMinor).toBe(INCREMENT);
    expect(lot?.currentHighDisplayName).toBe("Test Brand");
    expect(lot?.bidCount).toBe(1);
  });

  it("sets the amount from the server, not from the payload", async () => {
    const result = await repo.placeBid(bid({ expectedAmountMinor: INCREMENT }), NOW);
    expect(result.ok && result.bid.amountMinor).toBe(INCREMENT);
  });

  it("rejects a bid at a stale price", async () => {
    await repo.placeBid(bid(), NOW);
    const result = await repo.placeBid(bid({ expectedAmountMinor: INCREMENT }), NOW);
    expect(result).toMatchObject({ ok: false, decision: { code: "PRICE_MOVED" } });
  });

  it("keeps price equal to bid count times increment all the way up", async () => {
    await ladder(repo, HERO.id, 12);
    const lot = await repo.getLot(HERO.id);
    expect(lot?.bidCount).toBe(12);
    expect(lot?.currentHighMinor).toBe(12 * INCREMENT);
  });

  it("marks the previous leader outbid but keeps it counted", async () => {
    await ladder(repo, HERO.id, 2);

    const page = await repo.listBids({ limit: 50, offset: 0 });
    const statuses = Object.fromEntries(page.items.map((b) => [b.displayName, b.status]));
    expect(statuses).toEqual({ "Bidder 1": "outbid", "Bidder 2": "active" });

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighDisplayName).toBe("Bidder 2");
    // Outbid still counts: the price is the bid count times the increment.
    expect(lot?.bidCount).toBe(2);
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
    // Critically: the replay created no second bid and did not move the price.
    expect((await repo.listBids({ limit: 50, offset: 0 })).total).toBe(1);
    expect((await repo.getLot(HERO.id))?.currentHighMinor).toBe(INCREMENT);
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
    // The read-modify-write inside placeBid must not interleave. Fire a burst
    // at the same price: exactly one can legally win, and the losers must be
    // told the price moved rather than all being accepted at the same number.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        repo.placeBid(bid({ expectedAmountMinor: INCREMENT, displayName: `Racer ${i}` }), NOW),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const rejected of results.filter((r) => !r.ok)) {
      expect(rejected).toMatchObject({ decision: { code: "PRICE_MOVED" } });
    }

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighMinor).toBe(INCREMENT);
    expect(lot?.bidCount).toBe(1);
  });
});

describe("bid history", () => {
  it("returns the highest bids first, capped at the configured length", async () => {
    await ladder(repo, HERO.id, config.auction.historyLength + 4);

    const lot = await repo.getLot(HERO.id);
    expect(lot?.recentBids).toHaveLength(config.auction.historyLength);

    const amounts = lot!.recentBids.map((b) => b.amountMinor);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(amounts[0]).toBe(lot?.currentHighMinor);
  });

  it("carries no contact data, only what the bidder chose to publish", async () => {
    await repo.placeBid(bid({ brandUrl: "https://www.example.co.in/shop" }), NOW);

    const lot = await repo.getLot(HERO.id);
    const entry = lot!.recentBids[0]!;
    expect(Object.keys(entry).sort()).toEqual([
      "amountMinor",
      "brandDomain",
      "createdAt",
      "displayName",
    ]);
    expect(entry.brandDomain).toBe("example.co.in");
  });

  it("drops rejected bids from the price, the count and the history", async () => {
    const placed = await repo.placeBid(bid(), NOW);
    if (!placed.ok) throw new Error("expected the bid to be accepted");
    await repo.decideBid(placed.bid.id, "rejected");

    const lot = await repo.getLot(HERO.id);
    expect(lot?.currentHighMinor).toBeNull();
    expect(lot?.bidCount).toBe(0);
    expect(lot?.recentBids).toEqual([]);
  });
});

describe("brandDomain", () => {
  it("extracts and normalises a hostname", () => {
    expect(brandDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(brandDomain("http://sub.example.co.in")).toBe("sub.example.co.in");
  });

  it("returns null rather than throwing on absent or malformed input", () => {
    expect(brandDomain(null)).toBeNull();
    expect(brandDomain("")).toBeNull();
    expect(brandDomain("not a url")).toBeNull();
    expect(brandDomain("javascript:alert(1)")).toBeNull();
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
    expect(
      await repo.decideBid("00000000-0000-0000-0000-000000000000", "accepted"),
    ).toBeUndefined();
  });

  it("keeps an accepted bid as the standing high bid", async () => {
    const placed = await repo.placeBid(bid(), NOW);
    if (!placed.ok) throw new Error("expected the bid to be accepted");
    await repo.decideBid(placed.bid.id, "accepted");

    expect((await repo.getLot(HERO.id))?.currentHighMinor).toBe(INCREMENT);
  });

  it("paginates and filters the bid list", async () => {
    await ladder(repo, HERO.id, 5);

    const firstPage = await repo.listBids({ limit: 2, offset: 0 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(5);

    const active = await repo.listBids({ status: "active", limit: 50, offset: 0 });
    expect(active.items).toHaveLength(1);

    const scoped = await repo.listBids({ panelId: "not-a-lot", limit: 50, offset: 0 });
    expect(scoped.total).toBe(0);
  });
});
