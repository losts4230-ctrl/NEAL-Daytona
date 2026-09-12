import { describe, expect, it } from "vitest";
import { PANEL_CATALOGUE } from "@/lib/domain/panels";
import type { BidRecord, LotState } from "@/lib/repo/types";
import { toAdminBid, toPublicBidReceipt, toPublicLot } from "./serialise";

const PANEL = PANEL_CATALOGUE[0]!;

const lot: LotState = {
  panel: PANEL,
  status: "open",
  currentHighMinor: 120_000,
  currentHighDisplayName: "Some Brand",
  bidCount: 3,
  lastBidAt: new Date("2026-10-01T12:00:00.000Z"),
};

const record: BidRecord = {
  id: "11111111-2222-3333-4444-555555555555",
  panelId: PANEL.id,
  amountMinor: 120_000,
  displayName: "Some Brand",
  contactName: "Private Person",
  contactEmail: "private@example.com",
  contactPhone: "+44 7700 900000",
  brandUrl: "https://example.com",
  message: "Private note",
  status: "active",
  ipHash: "deadbeef",
  userAgent: "Mozilla/5.0",
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  decidedAt: null,
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
  it("exposes only the chosen public display name", () => {
    const serialised = JSON.stringify(toPublicLot(lot));
    expect(serialised).toContain("Some Brand");
    for (const value of PRIVATE_VALUES) {
      expect(serialised).not.toContain(value);
    }
  });

  it("derives the minimum bid rather than trusting a client", () => {
    const fresh = toPublicLot({ ...lot, currentHighMinor: null, currentHighDisplayName: null });
    expect(fresh.minimumBidMinor).toBe(PANEL.reserveMinor);

    const raised = toPublicLot(lot);
    expect(raised.minimumBidMinor).toBeGreaterThan(lot.currentHighMinor!);
  });
});

describe("toPublicBidReceipt", () => {
  it("leaks no contact detail back to the bidder's own receipt", () => {
    const serialised = JSON.stringify(toPublicBidReceipt(record));
    for (const value of PRIVATE_VALUES) {
      expect(serialised).not.toContain(value);
    }
  });
});

describe("toAdminBid", () => {
  it("does include contact detail, which is the point of the admin view", () => {
    const admin = toAdminBid(record);
    expect(admin.contactEmail).toBe(record.contactEmail);
    expect(admin.contactName).toBe(record.contactName);
  });

  it("still withholds the abuse-forensics fields", () => {
    const serialised = JSON.stringify(toAdminBid(record));
    expect(serialised).not.toContain(record.ipHash);
    expect(serialised).not.toContain(record.userAgent);
  });
});
