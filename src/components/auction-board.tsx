"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicBidReceipt, PublicLot } from "@/lib/http/serialise";
import { BidDialog } from "./bid-dialog";
import { BikeDiagram } from "./bike-diagram";
import { LotRow } from "./lot-row";

export interface BoardData {
  lots: PublicLot[];
  auction: {
    opensAt: string;
    closesAt: string;
    effectiveClosesAt: string;
    currency: string;
    locale: string;
    incrementMinor: number;
  };
  funding: { raisedMinor: number; targetMinor: number; percent: number };
  totals: { lotCount: number; totalAreaCm2: number; bidCount: number };
  driver: "memory" | "postgres";
}

/** How often the board re-reads live state while the tab is visible. */
const POLL_INTERVAL_MS = 20_000;

/**
 * Client owner of live auction state.
 *
 * Seeded from the server render, so the board and its numbers are in the HTML
 * for both the first paint and for crawlers, then kept fresh by polling.
 * Polling rather than a socket is a deliberate cost and complexity trade: at
 * this scale a 20-second refresh against a 5-second edge cache is a handful of
 * origin reads per minute regardless of how many people are watching, with no
 * connection state to manage. The upgrade path to SSE is in
 * docs/ARCHITECTURE.md.
 */
export function AuctionBoard({
  initial,
  historyLength,
}: {
  initial: BoardData;
  historyLength: number;
}) {
  const [board, setBoard] = useState<BoardData>(initial);
  const [selectedSurface, setSelectedSurface] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<readonly string[]>([]);
  const [dialogLot, setDialogLot] = useState<PublicLot | null>(null);
  const [stale, setStale] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  const { currency, locale } = board.auction;

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

  const handleSelectSurface = useCallback((zoneKey: string, panelIds: readonly string[]) => {
    setSelectedSurface(zoneKey);
    setHighlighted(panelIds);

    // Defer a frame so the highlight has rendered before we scroll to it.
    requestAnimationFrame(() => {
      const first = panelIds[0];
      if (!first) return;
      listRef.current
        ?.querySelector(`[data-lot="${first}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handlePlaced = useCallback(
    (updated: PublicLot, _receipt: PublicBidReceipt) => {
      // Fold the authoritative lot from the bid response into the board so the
      // row updates before the next poll comes round, then re-read for the
      // funding total, which depends on every other lot too.
      setBoard((previous) => ({
        ...previous,
        lots: previous.lots.map((lot) => (lot.id === updated.id ? updated : lot)),
      }));
      void refresh();
    },
    [refresh],
  );

  return (
    <>
      {board.driver === "memory" ? (
        <p className="notice notice--danger" style={{ marginBottom: "2.5rem" }}>
          <span aria-hidden="true">&#9888;</span>
          <span>
            <strong>Demo mode.</strong> This deployment is running the in-memory data store, so
            bids are not saved and are visible only to this server instance. Set{" "}
            <span className="num">DATA_DRIVER=postgres</span> before taking real bids.
          </span>
        </p>
      ) : null}

      <BikeDiagram
        lots={board.lots}
        selectedSurface={selectedSurface}
        onSelectSurface={handleSelectSurface}
      />

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          margin: "clamp(3rem, 6vw, 5rem) 0 1.5rem",
        }}
      >
        <h2 style={{ fontSize: "clamp(1.9rem, 4.5vw, 3.25rem)" }}>The spots, live.</h2>
        <p className="lede" style={{ maxWidth: "32ch", textAlign: "right" }}>
          Each row is a separate auction, with its current leader and bid history shown together.
          {stale ? " Reconnecting…" : ""}
        </p>
      </div>

      <div className="lots" ref={listRef}>
        {board.lots.map((lot, index) => (
          <LotRow
            key={lot.id}
            lot={lot}
            index={index}
            currency={currency}
            locale={locale}
            historyLength={historyLength}
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
