"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatMoney } from "@/lib/domain/money";
import type { PublicBidReceipt, PublicLot } from "@/lib/http/serialise";

interface BidDialogProps {
  lot: PublicLot | null;
  currency: string;
  locale: string;
  onClose: () => void;
  onPlaced: (lot: PublicLot, receipt: PublicBidReceipt) => void;
}

type FieldErrors = Record<string, string | undefined>;

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/** Server validation details arrive as `[{ field, message }]`; map them onto inputs. */
function toFieldErrors(details: unknown): FieldErrors {
  if (!Array.isArray(details)) return {};
  const errors: FieldErrors = {};
  for (const entry of details) {
    if (
      entry &&
      typeof entry === "object" &&
      "field" in entry &&
      "message" in entry &&
      typeof entry.field === "string" &&
      typeof entry.message === "string"
    ) {
      errors[entry.field] = entry.message;
    }
  }
  return errors;
}

/** A rejected bid reports the live next price so the form can re-offer it. */
function movedPrice(details: unknown): number | null {
  if (details && typeof details === "object" && "nextBidMinor" in details) {
    const next = (details as { nextBidMinor: unknown }).nextBidMinor;
    if (typeof next === "number" && Number.isFinite(next)) return next;
  }
  return null;
}

/**
 * Confirm-a-price dialog rather than an amount form.
 *
 * There is no number to type: every lot rises by one flat increment, so the
 * price is determined and the bidder's only decision is whether to take it.
 * That removes the single worst failure mode of a free-entry auction form —
 * an accidental extra zero — and it is why the price is stated as a fact at
 * the top instead of being asked for.
 *
 * The price the bidder saw is sent with the bid. If someone got there first the
 * server answers PRICE_MOVED with the live price, and the dialog re-offers at
 * the new number rather than silently committing them to it.
 */
export function BidDialog({ lot, currency, locale, onClose, onPlaced }: BidDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [receipt, setReceipt] = useState<PublicBidReceipt | null>(null);

  /** The price on offer in this dialog. Re-offered higher after a PRICE_MOVED. */
  const [priceMinor, setPriceMinor] = useState(0);

  /**
   * One key per attempt-series. A retry after a network timeout reuses it, so a
   * bid that actually landed is returned rather than duplicated; a fresh bid
   * gets a fresh key because the dialog regenerates it on open.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const money = (minor: number) => formatMoney(minor, { currency, locale });

  // Drive the native dialog from the `lot` prop so Escape, focus trapping and
  // the top layer come from the platform rather than a hand-rolled modal.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (lot && !dialog.open) {
      setFormError(null);
      setFieldErrors({});
      setReceipt(null);
      setPriceMinor(lot.nextBidMinor);
      setIdempotencyKey(crypto.randomUUID());
      dialog.showModal();
    } else if (!lot && dialog.open) {
      dialog.close();
    }
  }, [lot]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot || submitting) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/v1/bids", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          panelId: lot.id,
          expectedAmountMinor: priceMinor,
          displayName: String(form.get("displayName") ?? "").trim(),
          contactName: String(form.get("contactName") ?? "").trim(),
          contactEmail: String(form.get("contactEmail") ?? "").trim(),
          contactPhone: String(form.get("contactPhone") ?? "").trim() || undefined,
          brandUrl: String(form.get("brandUrl") ?? "").trim() || undefined,
          message: String(form.get("message") ?? "").trim() || undefined,
          acceptedTerms: form.get("acceptedTerms") === "on",
          website: String(form.get("website") ?? ""),
          idempotencyKey,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as
        | ApiErrorBody
        | { data: { bid: PublicBidReceipt; lot: PublicLot } };

      if (!response.ok) {
        const error = (body as ApiErrorBody).error;
        setFieldErrors(toFieldErrors(error?.details));

        const next = movedPrice(error?.details);
        if (error?.code === "PRICE_MOVED" && next !== null) {
          // Re-offer at the live price, and take a new idempotency key: this is
          // now a different bid, not a retry of the one that was rejected.
          setPriceMinor(next);
          setIdempotencyKey(crypto.randomUUID());
          setFormError(`Someone bid first. The price is now ${money(next)} — bid again to take it.`);
          return;
        }

        setFormError(error?.message ?? "That bid could not be placed.");
        return;
      }

      const { bid, lot: updatedLot } = (
        body as { data: { bid: PublicBidReceipt; lot: PublicLot } }
      ).data;
      setReceipt(bid);
      onPlaced(updatedLot, bid);
    } catch {
      setFormError(
        "We could not reach the auction server. Your bid was not placed — please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog className="dialog" ref={dialogRef} aria-labelledby={`${baseId}-title`}>
      {lot ? (
        <>
          <div className="dialog__head">
            <div>
              <p className="eyebrow eyebrow--soft">
                {lot.areaCm2} cm&sup2;{lot.bothSides ? " · both sides" : ""}
              </p>
              <h2 className="dialog__title" id={`${baseId}-title`}>
                {lot.name}
              </h2>
            </div>
            <button
              type="button"
              className="dialog__close"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <div className="dialog__body">
            {receipt ? (
              <div className="success">
                <div className="success__mark" aria-hidden="true">
                  &#10003;
                </div>
                <h3 className="success__title">You are the leading bidder</h3>
                <p className="success__body">
                  {money(receipt.amountMinor)} on {lot.name}, under the name{" "}
                  <strong>{receipt.displayName}</strong>.
                </p>
                <p className="success__body">
                  Reference <span className="num">{receipt.id.slice(0, 8)}</span>. This is an offer,
                  not a payment &mdash; nothing has been charged, and you will be contacted by
                  email if it wins.
                </p>
                <div className="dialog__foot">
                  <button
                    type="button"
                    className="btn btn--solid btn--block btn--lg"
                    onClick={() => dialogRef.current?.close()}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="pricebox">
                  <p className="pricebox__label">Your bid</p>
                  <p className="pricebox__value">{money(priceMinor)}</p>
                  <p className="pricebox__note">
                    {lot.currentHighMinor === null
                      ? "This lot has no bids. The first bid takes it."
                      : `Beats the current ${money(lot.currentHighMinor)} by one increment.`}
                  </p>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor={`${baseId}-display`}>
                    Public name <span className="field__req">*</span>
                  </label>
                  <input
                    id={`${baseId}-display`}
                    name="displayName"
                    className="input"
                    type="text"
                    maxLength={60}
                    required
                    placeholder="Your brand, as it should appear on the board"
                    aria-invalid={fieldErrors.displayName ? "true" : undefined}
                  />
                  {fieldErrors.displayName ? (
                    <p className="field__error">{fieldErrors.displayName}</p>
                  ) : null}
                </div>

                <div className="field">
                  <label className="field__label" htmlFor={`${baseId}-url`}>
                    Website
                  </label>
                  <input
                    id={`${baseId}-url`}
                    name="brandUrl"
                    className="input"
                    type="url"
                    placeholder="https://"
                    maxLength={512}
                    aria-invalid={fieldErrors.brandUrl ? "true" : undefined}
                  />
                  <p className="field__hint">
                    Optional, but your site&apos;s icon appears next to your name on the board.
                  </p>
                  {fieldErrors.brandUrl ? (
                    <p className="field__error">{fieldErrors.brandUrl}</p>
                  ) : null}
                </div>

                <div className="field field--grid">
                  <div>
                    <label className="field__label" htmlFor={`${baseId}-contact`}>
                      Contact name <span className="field__req">*</span>
                    </label>
                    <input
                      id={`${baseId}-contact`}
                      name="contactName"
                      className="input"
                      type="text"
                      autoComplete="name"
                      maxLength={80}
                      required
                      aria-invalid={fieldErrors.contactName ? "true" : undefined}
                    />
                    {fieldErrors.contactName ? (
                      <p className="field__error">{fieldErrors.contactName}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="field__label" htmlFor={`${baseId}-email`}>
                      Email <span className="field__req">*</span>
                    </label>
                    <input
                      id={`${baseId}-email`}
                      name="contactEmail"
                      className="input"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                      aria-invalid={fieldErrors.contactEmail ? "true" : undefined}
                    />
                    {fieldErrors.contactEmail ? (
                      <p className="field__error">{fieldErrors.contactEmail}</p>
                    ) : null}
                  </div>
                </div>

                <div className="field field--grid">
                  <div>
                    <label className="field__label" htmlFor={`${baseId}-phone`}>
                      Phone
                    </label>
                    <input
                      id={`${baseId}-phone`}
                      name="contactPhone"
                      className="input"
                      type="tel"
                      autoComplete="tel"
                      maxLength={32}
                    />
                  </div>
                  <div>
                    <label className="field__label" htmlFor={`${baseId}-message`}>
                      Artwork notes
                    </label>
                    <input
                      id={`${baseId}-message`}
                      name="message"
                      className="input"
                      type="text"
                      maxLength={1000}
                      placeholder="Logo format, colours"
                    />
                  </div>
                </div>

                {/* Honeypot: off-screen, unlabelled, never focusable by a human. */}
                <div className="honeypot" aria-hidden="true">
                  <label htmlFor={`${baseId}-website`}>Leave this empty</label>
                  <input
                    id={`${baseId}-website`}
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                <div className="field">
                  <label className="check">
                    <input type="checkbox" name="acceptedTerms" required />
                    <span>
                      I understand this is a non-binding offer, that nothing is charged now, and
                      that the <a href="/terms">bidding terms</a> apply &mdash; including that all
                      lots are void if the bike is not acquired.
                    </span>
                  </label>
                  {fieldErrors.acceptedTerms ? (
                    <p className="field__error">{fieldErrors.acceptedTerms}</p>
                  ) : null}
                </div>

                <div className="dialog__foot">
                  {formError ? (
                    <p className="formerror" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="btn btn--solid btn--block btn--lg"
                    disabled={submitting}
                  >
                    {submitting ? "Placing bid…" : `Bid ${money(priceMinor)}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      ) : null}
    </dialog>
  );
}
