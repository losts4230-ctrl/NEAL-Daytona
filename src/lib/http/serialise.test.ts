import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { PANEL_CATALOGUE } from "@/lib/domain/panels";
import type { BidRecord, LotState } from "@/lib/repo/types";
import { toAdminBid, toPublicBidReceipt, toPublicLot } from "./serialise";

const PANEL = PANEL_CATALOGUE[0]!;
const INCREMENT = config.auction.incrementMinor;

const record: BidRecord = {
  id: "11111111-2222-3333-4444-555555555555",
  panelId: PANEL.id,
  amountMinor: INCREMENT * 3,
  displayName: "Some Brand",
  contactName: "Private Person",
  contactEmail: "private@example.com",
  contactPhone: "+91 90000 00000",
  brandUrl: "https://example.com",
  message: "Private note about artwork",
  status: "active",
  ipHash: "deadbeefdeadbeef",
  userAgent: "Mozilla/5.0 (private)",
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  decidedAt: null,
};

const lot: LotState = {
  panel: PANEL,
  status: "open",
  currentHighMinor: INCREMENT * 3,
  currentHighDisplayName: "Some Brand",
  currentHighDomain: "example.com",
  bidCount: 3,
  lastBidAt: new Date("2026-10-01T12:00:00.000Z"),
  recentBids: [
    {
      displayName: "Some Brand",
      brandDomain: "example.com",
      amountMinor: INCREMENT * 3,
      createdAt: new Date("2026-10-01T12:00:00.000Z"),
    },
  ],
};

/** The private fields that must never appear in a public response body. */
const PRIVATE_VALUES = [
  record.contactName,
  record.contactEmail,
  record.contactPhone,
  record.message,
  record.ipHash,
  record.userAgent,
] as const;

describe("toPublicLot", () => {
  it("exposes only the name and domain the bidder chose to publish", () => {
    const serialised = JSON.stringify(toPublicLot(lot));
    expect(serialised).toContain("Some Brand");
    expect(serialised).toContain("example.com");
    for (const value of PRIVATE_VALUES) {
      expect(serialised).not.toContain(value);
    }
  });

  it("derives the next price server-side rather than trusting a client", () => {
    expect(toPublicLot({ ...lot, currentHighMinor: null }).nextBidMinor).toBe(INCREMENT);
    expect(toPublicLot(lot).nextBidMinor).toBe(INCREMENT * 4);
  });

  it("publishes the history strip with no contact data in it", () => {
    const publicLot = toPublicLot(lot);
    expect(publicLot.recentBids).toHaveLength(1);
    expect(Object.keys(publicLot.recentBids[0]!).sort()).toEqual([
      "amountMinor",
      "brandDomain",
      "createdAt",
      "displayName",
    ]);
  });
});

describe("toPublicBidReceipt", () => {
  it("leaks no contact detail back into the bidder's own receipt", () => {
    const serialised = JSON.stringify(toPublicBidReceipt(record));
    for (const value of PRIVATE_VALUES) {
      expect(serialised).not.toContain(value);
    }
  });

  it("returns the domain rather than the raw URL", () => {
    const receipt = toPublicBidReceipt(record);
    expect(receipt.brandDomain).toBe("example.com");
    expect(JSON.stringify(receipt)).not.toContain("https://example.com");
  });
});

describe("toAdminBid", () => {
  it("does include contact detail, which is the point of the admin view", () => {
    const admin = toAdminBid(record);
    expect(admin.contactEmail).toBe(record.contactEmail);
    expect(admin.contactName).toBe(record.contactName);
    expect(admin.message).toBe(record.message);
  });

  it("still withholds the abuse-forensics fields", () => {
    const serialised = JSON.stringify(toAdminBid(record));
    expect(serialised).not.toContain(record.ipHash);
    expect(serialised).not.toContain(record.userAgent);
  });
});
