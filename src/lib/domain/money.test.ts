import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, toMajor, toMinor } from "./money";

const GBP = { currency: "GBP", locale: "en-GB" };

describe("minor/major conversion", () => {
  it("round-trips whole amounts", () => {
    for (const major of [0, 1, 250, 900, 1_000_000]) {
      expect(toMajor(toMinor(major))).toBe(major);
    }
  });

  it("always produces an integer number of minor units", () => {
    for (const major of [0.01, 0.1, 12.34, 99.995, 1234.567]) {
      expect(Number.isInteger(toMinor(major))).toBe(true);
    }
  });

  it("avoids the classic binary-float error", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in minor units it is 30.
    expect(toMinor(0.1) + toMinor(0.2)).toBe(30);
  });
});

describe("formatMoneyCompact", () => {
  /**
   * Guards the hydration bug this function exists to prevent: Intl's own
   * compact notation renders "£7K" under Node's ICU and "£7k" under Chromium's,
   * which tears down the React tree. The suffix here is a literal, so it cannot
   * vary by engine.
   */
  it("emits an uppercase suffix regardless of the host ICU build", () => {
    expect(formatMoneyCompact(toMinor(6_540), GBP)).toContain("K");
    expect(formatMoneyCompact(toMinor(6_540), GBP)).not.toContain("k");
    expect(formatMoneyCompact(toMinor(2_500_000), GBP)).toContain("M");
  });

  it("keeps one decimal below ten so it does not mislead", () => {
    // Intl compact with 0 fraction digits rounds this to "£7K".
    expect(formatMoneyCompact(toMinor(6_540), GBP)).toBe("£6.5K");
  });

  it("drops the decimal at ten and above", () => {
    expect(formatMoneyCompact(toMinor(65_400), GBP)).toBe("£65K");
  });

  it("leaves sub-thousand amounts in full", () => {
    expect(formatMoneyCompact(toMinor(900), GBP)).toBe(formatMoney(toMinor(900), GBP));
  });

  it("handles zero without a suffix", () => {
    expect(formatMoneyCompact(0, GBP)).toBe("£0");
  });

  it("scales millions and billions", () => {
    expect(formatMoneyCompact(toMinor(1_200_000), GBP)).toBe("£1.2M");
    expect(formatMoneyCompact(toMinor(3_400_000_000), GBP)).toBe("£3.4B");
  });

  it("works for a non-GBP currency", () => {
    const inr = formatMoneyCompact(toMinor(150_000), { currency: "INR", locale: "en-IN" });
    expect(inr).toContain("K");
    expect(inr).toContain("150");
  });
});
