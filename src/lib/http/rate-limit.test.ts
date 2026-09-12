import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "./rate-limit";

beforeEach(() => resetRateLimits());

describe("checkRateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("a", now, 3, 60).allowed).toBe(true);
    }
    expect(checkRateLimit("a", now, 3, 60).allowed).toBe(false);
  });

  it("reports a usable retry-after once blocked", () => {
    const now = 1_000_000;
    checkRateLimit("b", now, 1, 60);
    const blocked = checkRateLimit("b", now + 10_000, 1, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("opens a fresh window after expiry", () => {
    const now = 1_000_000;
    checkRateLimit("c", now, 1, 60);
    expect(checkRateLimit("c", now + 61_000, 1, 60).allowed).toBe(true);
  });

  it("keys are independent, so one bidder cannot block another", () => {
    const now = 1_000_000;
    checkRateLimit("d", now, 1, 60);
    expect(checkRateLimit("e", now, 1, 60).allowed).toBe(true);
  });

  it("counts down remaining allowance", () => {
    const now = 1_000_000;
    expect(checkRateLimit("f", now, 3, 60).remaining).toBe(2);
    expect(checkRateLimit("f", now, 3, 60).remaining).toBe(1);
    expect(checkRateLimit("f", now, 3, 60).remaining).toBe(0);
  });
});
