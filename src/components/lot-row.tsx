"use client";

import { formatMoney } from "@/lib/domain/money";
import type { PublicLot } from "@/lib/http/serialise";
import { BrandMark } from "./brand-mark";
import { LotThumbnail } from "./lot-thumbnail";

interface LotRowProps {
  lot: PublicLot;
  index: number;
  currency: string;
  locale: string;
  historyLength: number;
  highlighted: boolean;
  biddingOpen: boolean;
  onBid: (lot: PublicLot) => void;
}

const STATUS_LABEL: Record<PublicLot["status"], string> = {
  open: "Open",
  reserved: "Reserved",
  sold: "Sold",
  withdrawn: "Withdrawn",
};

/**
 * One lot, as a full-width row with its bid history beneath it.
 *
 * Rows rather than cards because every lot carries the same five facts —
 * surface, holder, price, bid count, next price — and a row puts those in
 * aligned columns you can scan straight down. A grid of cards makes the reader
 * re-find each figure in every tile.
 *
 * The history strip is published deliberately: on a flat-increment auction the
 * price only means something if you can see the climb that produced it, and a
 * visible ladder of real names is the strongest reason to join it.
 */
export function LotRow({
  lot,
  index,
  currency,
  locale,
  historyLength,
  highlighted,
  biddingOpen,
  onBid,
}: LotRowProps) {
  const money = (minor: number) => formatMoney(minor, { currency, locale });
  const closed = lot.status !== "open";
  const canBid = biddingOpen && !closed;
  const hasBids = lot.currentHighMinor !== null;

  return (
    <article
      className={["lot", closed ? "lot--closed" : ""].filter(Boolean).join(" ")}
      id={`lot-${lot.id}`}
      data-lot={lot.id}
      /* The diagram sets this when a surface is selected; it drives nothing but
         the scroll target and an outline, so it stays a data attribute. */
      data-highlighted={highlighted ? "true" : undefined}
      style={
        highlighted
          ? { boxShadow: "inset 3px 0 0 0 var(--ember)", background: "var(--paper-sunk)" }
          : undefined
      }
    >
      <div className="lot__main">
        <LotThumbnail panelId={lot.id} label={lot.name} />

        <div>
          <p className="lot__index num">{String(index + 1).padStart(2, "0")}</p>
          <h3 className="lot__name">{lot.name}</h3>
          <p className="lot__descriptor">{lot.descriptor}</p>
          <p className="lot__meta">
            {lot.areaCm2} cm&sup2;
            {lot.bothSides ? " · both sides" : ""}
          </p>
        </div>

        {hasBids && lot.currentHighDisplayName ? (
          <div className="lot__holder">
            <BrandMark domain={lot.currentHighDomain} name={lot.currentHighDisplayName} />
            <div style={{ minWidth: 0 }}>
              <p className="lot__holderlabel">Held by</p>
              <p className="lot__holdername">{lot.currentHighDisplayName}</p>
            </div>
          </div>
        ) : (
          <div className="lot__holder">
            <p className="lot__descriptor">No bids yet</p>
          </div>
        )}

        <div className="lot__price">
          <p className="lot__pricelabel">{hasBids ? "Current bid" : "Opens at"}</p>
          <p className="lot__pricevalue">
            {money(hasBids ? lot.currentHighMinor! : lot.nextBidMinor)}
          </p>
          <p className="lot__bidcount">
            {lot.bidCount === 1 ? "1 bid" : `${lot.bidCount} bids`}
          </p>
        </div>

        <button type="button" className="bidbtn" onClick={() => onBid(lot)} disabled={!canBid}>
          <span className="bidbtn__label">
            {closed ? STATUS_LABEL[lot.status] : hasBids ? "Outbid" : "Bid"}
          </span>
          <span className="bidbtn__price num">{money(lot.nextBidMinor)}</span>
          <span className="bidbtn__arrow" aria-hidden="true">
            &rarr;
          </span>
        </button>
      </div>

      <div className="history">
        <p className="history__label">
          Bid history
          <br />
          {lot.recentBids.length === 0
            ? "No entries"
            : `${lot.recentBids.length} of ${lot.bidCount}`}
        </p>

        {lot.recentBids.length === 0 ? (
          <p className="history__empty">
            Nobody has bid on this surface yet. The first bid takes it at{" "}
            {money(lot.nextBidMinor)}.
          </p>
        ) : (
          lot.recentBids.slice(0, historyLength).map((bid) => (
            <div className="history__cell" key={`${bid.createdAt}-${bid.amountMinor}`}>
              <BrandMark domain={bid.brandDomain} name={bid.displayName} size="sm" />
              <span className="history__who">
                <span className="history__name">{bid.displayName}</span>
                <span className="history__domain">{bid.brandDomain ?? "—"}</span>
              </span>
              <span className="history__amount num">{money(bid.amountMinor)}</span>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
