"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoneyCompact } from "@/lib/domain/money";
import type { PublicBidReceipt, PublicLot } from "@/lib/http/serialise";
import { BidDialog } from "./bid-dialog";
import { BikeDiagram } from "./bike-diagram";
import { LotCard } from "./lot-card";

export interface BoardData {
  lots: PublicLot[];
  auction: {
    opensAt: string;
    closesAt: string;
    effectiveClosesAt: string;
    currency: string;
    locale: string;
  };
  totals: {
    lotCount: number;
    totalReserveMinor: number;
    committedMinor: number;
    bidCount: number;
  };
  driver: "memory" | "postgres";
}

type TierFilter = "all" | "hero" | "premium" | "standard" | "available";

const FILTERS: readonly { key: TierFilter; label: string }[] = [
  { key: "all", label: "All lots" },
  { key: "hero", label: "Hero" },
  { key: "premium", label: "Premium" },
  { key: "standard", label: "Standard" },
  { key: "available", label: "Available only" },
];

/** How often the board re-reads live state while the tab is visible. */
const POLL_INTERVAL_MS = 20_000;

/**
 * Client owner of live auction state.
 *
 * Seeded from the server render, so the board and its numbers are in the HTML
 * for both the first paint and for crawlers, then kept fresh by polling. Polling
 * rather than a socket is a deliberate cost and complexity trade: at this scale
 * a 20-second refresh against a 5-second edge cache is a handful of origin reads
 * per minute regardless of how many people are watching, with no connection
 * state to manage. The upgrade path to SSE is noted in docs/ARCHITECTURE.md.
 */
export function AuctionBoard({ initial }: { initial: BoardData }) {
  const [board, setBoard] = useState<BoardData>(initial);
  const [filter, setFilter] = useState<TierFilter>("all");
  const [selectedSurface, setSelectedSurface] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<readonly string[]>([]);
  const [dialogLot, setDialogLot] = useState<PublicLot | null>(null);
  const [stale, setStale] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);

  const { currency, locale } = board.auction;
  const moneyCompact = useCallback(
    (minor: number) => formatMoneyCompact(minor, { currency, locale }),
    [currency, locale],
  );

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/v1/lots", { signal, cache: "no-store" });
      if (!response.ok) {
        setStale(true);
        return;
      }
      const body = (await response.json()) as { data: BoardData };
      setBoard(body.data);
      setStale(false);
    } catch (error) {
      // An aborted fetch is the component unmounting, not a failure.
      if ((error as Error)?.name !== "AbortError") setStale(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    const schedule = () => {
      timer = window.setTimeout(async () => {
        // Skip the request entirely on a hidden tab: a background tab polling
        // forever is pure cost with nobody looking at the result.
        if (document.visibilityState === "visible") await refresh(controller.signal);
        schedule();
      }, POLL_INTERVAL_MS);
    };
    schedule();

    // Catch up immediately when the visitor comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const biddingOpen = useMemo(() => {
    const now = Date.now();
    return (
      now >= new Date(board.auction.opensAt).getTime() &&
      now < new Date(board.auction.effectiveClosesAt).getTime()
    );
  }, [board.auction.opensAt, board.auction.effectiveClosesAt]);

  const visibleLots = useMemo(() => {
    switch (filter) {
      case "all":
        return board.lots;
      case "available":
        return board.lots.filter((lot) => lot.status === "open");
      default:
        return board.lots.filter((lot) => lot.tier === filter);
    }
  }, [board.lots, filter]);

  const handleSelectSurface = useCallback(
    (zoneKey: string, panelIds: readonly string[]) => {
      setSelectedSurface(zoneKey);
      setHighlighted(panelIds);
      // Clear any filter that would hide the surface the visitor just tapped.
      setFilter("all");

      // Defer to the next frame so the scroll target exists after the filter reset.
      requestAnimationFrame(() => {
        const first = panelIds[0];
        if (!first) return;
        gridRef.current
          ?.querySelector(`[data-lot="${first}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [],
  );

  const handlePlaced = useCallback(
    (updated: PublicLot, _receipt: PublicBidReceipt) => {
      // Optimistically fold the authoritative lot from the bid response into the
      // board so the card updates before the next poll comes round.
      setBoard((previous) => ({
        ...previous,
        lots: previous.lots.map((lot) => (lot.id === updated.id ? updated : lot)),
      }));
      void refresh();
    },
    [refresh],
  );

  const soldOut = board.lots.every((lot) => lot.status !== "open");

  return (
    <>
      {board.driver === "memory" ? (
        <p className="notice notice--danger" style={{ marginBottom: "2rem" }}>
          <span aria-hidden="true">&#9888;</span>
          <span>
            <strong>Demo mode.</strong> This deployment is running the in-memory data store, so bids
            are not saved and are visible only to this server instance. Set{" "}
            <span className="num">DATA_DRIVER=postgres</span> before taking real bids.
          </span>
        </p>
      ) : null}

      <div className="split" style={{ marginBottom: "clamp(2.5rem, 5vw, 4rem)" }}>
        <BikeDiagram
          lots={board.lots}
          selectedSurface={selectedSurface}
          onSelectSurface={handleSelectSurface}
        />
        <div>
          <div className="metrics">
            <div className="metric">
              <p className="metric__label">Lots</p>
              <p className="metric__value num">{board.totals.lotCount}</p>
            </div>
            <div className="metric">
              <p className="metric__label">Bids</p>
              <p className="metric__value num">{board.totals.bidCount}</p>
            </div>
            <div className="metric">
              <p className="metric__label">Committed</p>
              <p className="metric__value metric__value--ember num">
                {moneyCompact(board.totals.committedMinor)}
              </p>
            </div>
            <div className="metric">
              <p className="metric__label">Total reserve</p>
              <p className="metric__value metric__value--gold num">
                {moneyCompact(board.totals.totalReserveMinor)}
              </p>
            </div>
          </div>
          <div className="notice" style={{ marginTop: "1rem" }}>
            <span aria-hidden="true">&#9432;</span>
            <span>
              Every lot is an individual auction with its own reserve, and left and right sides sell
              separately. Bid on as many as you like.
              {soldOut ? " All lots are currently closed." : ""}
            </span>
          </div>
          <p className="countdown__note" style={{ marginTop: "1rem" }}>
            <strong style={{ color: "var(--text-dim)" }}>Committed</strong> is the sum of the
            leading bids across every lot. <strong style={{ color: "var(--text-dim)" }}>Total
            reserve</strong> is what the build needs the auction to clear.
          </p>
        </div>
      </div>

      <div className="filters">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            className="chip"
            aria-pressed={filter === option.key}
            onClick={() => {
              setFilter(option.key);
              setSelectedSurface(null);
              setHighlighted([]);
            }}
          >
            {option.label}
          </button>
        ))}
        <span className="filters__spacer" />
        <span className="filters__status" aria-live="polite">
          {stale ? "Reconnecting..." : `${visibleLots.length} shown`}
        </span>
      </div>

      <div className="lots" ref={gridRef}>
        {visibleLots.map((lot) => (
          <LotCard
            key={lot.id}
            lot={lot}
            currency={currency}
            locale={locale}
            highlighted={highlighted.includes(lot.id)}
            biddingOpen={biddingOpen}
            onBid={setDialogLot}
          />
        ))}
      </div>

      <BidDialog
        lot={dialogLot}
        currency={currency}
        locale={locale}
        onClose={() => setDialogLot(null)}
        onPlaced={handlePlaced}
      />
    </>
  );
}
