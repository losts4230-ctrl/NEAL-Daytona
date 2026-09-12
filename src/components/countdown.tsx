"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  opensAt: string;
  closesAt: string;
}

type Phase = "pre-open" | "open" | "closed";

interface Remaining {
  phase: Phase;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function compute(opensAt: Date, closesAt: Date, now: Date): Remaining {
  const phase: Phase = now < opensAt ? "pre-open" : now < closesAt ? "open" : "closed";
  const target = phase === "pre-open" ? opensAt : closesAt;
  const ms = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(ms / 1000);
  return {
    phase,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

const PHASE_COPY: Record<Phase, { label: string; dot: string }> = {
  "pre-open": { label: "Bidding opens in", dot: "pulse pulse--pending" },
  open: { label: "Bidding closes in", dot: "pulse" },
  closed: { label: "Bidding closed", dot: "pulse pulse--closed" },
};

/**
 * Live countdown.
 *
 * Rendered with `null` on the first client pass and filled in after mount. A
 * server-rendered clock is wrong the instant it reaches the browser, and any
 * value derived from `Date.now()` at render time is a hydration mismatch —
 * mounting first is the fix, not a workaround.
 */
export function Countdown({ opensAt, closesAt }: CountdownProps) {
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    const opens = new Date(opensAt);
    const closes = new Date(closesAt);

    const tick = () => setRemaining(compute(opens, closes, new Date()));
    tick();

    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [opensAt, closesAt]);

  const phase = remaining?.phase ?? "open";
  const copy = PHASE_COPY[phase];

  const cells: [string, number | null][] = [
    ["days", remaining?.days ?? null],
    ["hours", remaining?.hours ?? null],
    ["mins", remaining?.minutes ?? null],
    ["secs", remaining?.seconds ?? null],
  ];

  return (
    <div className="countdown">
      <p className="countdown__label">
        <span className={copy.dot} aria-hidden="true" />
        {copy.label}
      </p>

      <div className="countdown__clock" role="timer" aria-live="off">
        {cells.map(([unit, value]) => (
          <div className="countdown__cell" key={unit}>
            <span className="countdown__figure">
              {value === null ? "--" : String(value).padStart(2, "0")}
            </span>
            <span className="countdown__unit">{unit}</span>
          </div>
        ))}
      </div>

      <p className="countdown__note">
        Any bid in the final five minutes extends that lot by five minutes, so a
        last-second bid cannot win on timing alone.
      </p>
    </div>
  );
}
