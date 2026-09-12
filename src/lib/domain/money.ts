/**
 * Money is stored and transported as an integer count of minor units (pence,
 * paise, cents). Floating point never touches a bid amount — a 0.01 rounding
 * error in an auction is a dispute, not a cosmetic bug.
 */
export type Minor = number;

export const MINOR_PER_MAJOR = 100;

export function toMinor(major: number): Minor {
  return Math.round(major * MINOR_PER_MAJOR);
}

export function toMajor(minor: Minor): number {
  return minor / MINOR_PER_MAJOR;
}

export function formatMoney(minor: Minor, opts: { currency: string; locale: string }): string {
  return new Intl.NumberFormat(opts.locale, {
    style: "currency",
    currency: opts.currency,
    maximumFractionDigits: 0,
  }).format(toMajor(minor));
}

/**
 * Abbreviated money, for metric tiles where the full figure would not fit.
 *
 * The scaling and the suffix are computed here rather than delegated to
 * `Intl` compact notation, which is NOT safe in server-rendered output: the
 * suffix casing is ICU-version dependent, so Node emits "£7K" while Chromium
 * emits "£7k" for the same input, and React tears the tree down on hydration.
 * (That was a real bug, found by checking the browser console rather than by
 * reading the code.) Only the numeric part goes through `Intl`, in standard
 * notation with explicit fraction digits, which is stable across engines.
 *
 * Keeping one significant decimal below 10 also avoids `Intl`'s habit of
 * rounding £6,540 to a misleading "£7K".
 */
const COMPACT_UNITS: readonly { threshold: number; suffix: string }[] = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" },
];

export function formatMoneyCompact(
  minor: Minor,
  opts: { currency: string; locale: string },
): string {
  const major = toMajor(minor);
  const magnitude = Math.abs(major);

  for (const unit of COMPACT_UNITS) {
    if (magnitude >= unit.threshold) {
      const scaled = major / unit.threshold;
      const fractionDigits = Math.abs(scaled) < 10 ? 1 : 0;
      const number = new Intl.NumberFormat(opts.locale, {
        style: "currency",
        currency: opts.currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(scaled);
      return `${number}${unit.suffix}`;
    }
  }

  return formatMoney(minor, opts);
}
