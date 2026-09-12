"use client";

import { formatMoney } from "@/lib/domain/money";
import type { PublicLot } from "@/lib/http/serialise";

interface LotCardProps {
  lot: PublicLot;
  currency: string;
  locale: string;
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

export function LotCard({
  lot,
  currency,
  locale,
  highlighted,
  biddingOpen,
  onBid,
}: LotCardProps) {
  const money = (minor: number) => formatMoney(minor, { currency, locale });
  const closed = lot.status !== "open";
  const canBid = biddingOpen && !closed;

  return (
    <article
      className={[
        "lot",
        highlighted ? "lot--selected" : "",
        closed ? "lot--closed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      id={`lot-${lot.id}`}
      /* Anchors the scroll target when a diagram zone is selected. */
      data-lot={lot.id}
    >
      <div className="lot__head">
        <div>
          <h3 className="lot__name">{lot.name}</h3>
          <p className="lot__location">{lot.location}</p>
        </div>
        <span className={`tag tag--${closed ? "sold" : lot.tier}`}>
          {closed ? STATUS_LABEL[lot.status] : lot.tierLabel}
        </span>
      </div>

      <div className="lot__spec">
        <div className="lot__specitem">
          <p className="lot__speclabel">Print area</p>
          <p className="lot__specvalue">
            {lot.areaCm2} cm<sup>2</sup>
          </p>
        </div>
        <div className="lot__specitem">
          <p className="lot__speclabel">Reserve</p>
          <p className="lot__specvalue">{money(lot.reserveMinor)}</p>
        </div>
        <div className="lot__specitem">
          <p className="lot__speclabel">{lot.currentHighMinor === null ? "Opening bid" : "Next bid"}</p>
          <p className="lot__specvalue lot__specvalue--ember">{money(lot.minimumBidMinor)}</p>
        </div>
      </div>

      <p className="lot__notes">{lot.notes}</p>

      {lot.currentHighMinor !== null && lot.currentHighDisplayName ? (
        <p className="lot__leader">
          Leading: <strong>{money(lot.currentHighMinor)}</strong> &mdash;{" "}
          {lot.currentHighDisplayName}
        </p>
      ) : (
        <p className="lot__leader">No bids yet. The first bid at reserve takes the lead.</p>
      )}

      <div className="lot__foot">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => onBid(lot)}
          disabled={!canBid}
        >
          {closed ? STATUS_LABEL[lot.status] : biddingOpen ? "Place bid" : "Not yet open"}
        </button>
        <span className="lot__bidcount">
          {lot.bidCount === 1 ? "1 bid" : `${lot.bidCount} bids`}
        </span>
      </div>
    </article>
  );
}
