"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/domain/money";

interface FundingBarProps {
  raisedMinor: number;
  targetMinor: number;
  percent: number;
  currency: string;
  locale: string;
  opensAt: string;
  closesAt: string;
}

type Phase = "pre-open" | "open" | "closed";

/**
 * Progress toward the purchase target, plus how long is left.
 *
 * This is the one number that explains why the site exists — the bike is not
 * bought yet — so it sits directly under the headline rather than in a stats
 * block further down.
 *
 * The remaining-time text renders empty until mounted. Anything derived from
 * `Date.now()` during render is a hydration mismatch, and a server-rendered
 * clock is wrong the instant it reaches the browser.
 */
export function FundingBar({
  raisedMinor,
  targetMinor,
  percent,
  currency,
  locale,
  opensAt,
  closesAt,
}: FundingBarProps) {
  const [remaining, setRemaining] = useState<{ phase: Phase; text: string } | null>(null);

  useEffect(() => {
    const opens = new Date(opensAt).getTime();
    const closes = new Date(closesAt).getTime();

    const tick = () => {
      const now = Date.now();
      const phase: Phase = now < opens ? "pre-open" : now < closes ? "open" : "closed";

      if (phase === "closed") {
        setRemaining({ phase, text: "Auction closed" });
        return;
      }

      const ms = Math.max(0, (phase === "pre-open" ? opens : closes) - now);
      const days = Math.floor(ms / 86_400_000);
      const hours = Math.floor((ms % 86_400_000) / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      const seconds = Math.floor((ms % 60_000) / 1000);

      // Days only matter while there are days; seconds only matter when there
      // are not, which is also when a visitor starts watching them.
      const text =
        days > 0
          ? `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`
          : `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(
              seconds,
            ).padStart(2, "0")}s`;

      setRemaining({ phase, text });
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [opensAt, closesAt]);

  const money = (minor: number) => formatMoney(minor, { currency, locale });

  return (
    <div className="funding">
      <div className="funding__head">
        <span className="funding__raised">{money(raisedMinor)}</span>
        <span className="funding__target">of {money(targetMinor)} purchase target</span>
      </div>

      <div
        className="funding__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Funding progress toward the purchase target"
      >
        <div className="funding__fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="funding__foot">
        <span className="num">{percent}% funded</span>
        <span>
          {remaining?.phase === "pre-open"
            ? "Opens in"
            : remaining?.phase === "closed"
              ? ""
              : "Ends in"}
        </span>
        <span className="funding__state">{remaining?.text ?? " "}</span>
      </div>
    </div>
  );
}
