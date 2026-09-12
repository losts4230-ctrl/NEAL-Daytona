"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatMoney, toMajor } from "@/lib/domain/money";
import type { PublicBidReceipt, PublicLot } from "@/lib/http/serialise";

interface BidDialogProps {
  lot: PublicLot | null;
  currency: string;
  locale: string;
  onClose: () => void;
  onPlaced: (lot: PublicLot, receipt: PublicBidReceipt) => void;
}

interface FieldErrors {
  [field: string]: string | undefined;
}

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

export function BidDialog({ lot, currency, locale, onClose, onPlaced }: BidDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const baseId = useId();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [receipt, setReceipt] = useState<PublicBidReceipt | null>(null);

  /**
   * One key per attempt-series. A retry after a network timeout reuses it, so a
   * bid that actually landed is returned rather than duplicated; a fresh bid
   * gets a fresh key because the dialog remounts the value on open.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const minimum = lot?.minimumBidMinor ?? 0;

  const money = useMemo(
    () => (minor: number) => formatMoney(minor, { currency, locale }),
    [currency, locale],
  );

  // Drive the native dialog from the `lot` prop so Escape, focus trapping and
  // the top layer come from the platform rather than a hand-rolled modal.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (lot && !dialog.open) {
      setFormError(null);
      setFieldErrors({});
      setReceipt(null);
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
    const amountRaw = String(form.get("amount") ?? "").trim();
    const amount = Number(amountRaw);

    // Client-side pre-check for instant feedback only. The server re-evaluates
    // every rule against the live standing bid; this is never the authority.
    if (!Number.isFinite(amount) || amount <= 0) {
      setFieldErrors({ amount: "Enter a bid amount." });
      return;
    }
    if (Math.round(amount * 100) < minimum) {
      setFieldErrors({ amount: `Minimum bid for this lot is ${money(minimum)}.` });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/v1/bids", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          panelId: lot.id,
          amount,
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
        setFormError(error?.message ?? "That bid could not be placed.");
        return;
      }

      const { bid, lot: updatedLot } = (body as { data: { bid: PublicBidReceipt; lot: PublicLot } })
        .data;
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
              <p className="dialog__eyebrow">
                {lot.tierLabel} lot &middot; {lot.areaCm2} cm&sup2;
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
                <h3 className="success__title">Bid recorded</h3>
                <p className="success__body">
                  {money(receipt.amountMinor)} on {lot.name}, under the name{" "}
                  <strong>{receipt.displayName}</strong>.
                </p>
                <p className="success__body">
                  Your bid reference is <span className="num">{receipt.id.slice(0, 8)}</span>. It is
                  an offer, not a payment &mdash; nothing is charged now, and you will be contacted
                  by email if it wins.
                </p>
                <div className="dialog__foot">
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() => dialogRef.current?.close()}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form ref={formRef} onSubmit={handleSubmit} noValidate>
                <div className="dialog__summary">
                  <div>
                    <p className="metric__label">Current high</p>
                    <p className="metric__value num">
                      {lot.currentHighMinor === null ? "No bids" : money(lot.currentHighMinor)}
                    </p>
                  </div>
                  <div>
                    <p className="metric__label">Minimum bid</p>
                    <p className="metric__value metric__value--ember num">{money(minimum)}</p>
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor={`${baseId}-amount`}>
                    Your bid ({currency}) <span className="field__req">*</span>
                  </label>
                  <input
                    id={`${baseId}-amount`}
                    name="amount"
                    className="input input--amount"
                    type="number"
                    inputMode="decimal"
                    min={toMajor(minimum)}
                    step="1"
                    defaultValue={toMajor(minimum)}
                    required
                    aria-invalid={fieldErrors.amount ? "true" : undefined}
                    aria-describedby={`${baseId}-amount-hint`}
                  />
                  <p className="field__hint" id={`${baseId}-amount-hint`}>
                    Minimum {money(minimum)}. Whole {currency} only.
                  </p>
                  {fieldErrors.amount ? <p className="field__error">{fieldErrors.amount}</p> : null}
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
                  <p className="field__hint">
                    Shown publicly next to the leading bid. Use a nickname if you would rather stay
                    anonymous.
                  </p>
                  {fieldErrors.displayName ? (
                    <p className="field__error">{fieldErrors.displayName}</p>
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
                      Phone (optional)
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
                    <label className="field__label" htmlFor={`${baseId}-url`}>
                      Website (optional)
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
                    {fieldErrors.brandUrl ? (
                      <p className="field__error">{fieldErrors.brandUrl}</p>
                    ) : null}
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor={`${baseId}-message`}>
                    Artwork notes (optional)
                  </label>
                  <textarea
                    id={`${baseId}-message`}
                    name="message"
                    className="textarea"
                    maxLength={1000}
                    placeholder="Anything I should know about your logo, colours or artwork format."
                  />
                </div>

                {/* Honeypot: off-screen, unlabelled, never focusable by a human. */}
                <div className="honeypot" aria-hidden="true">
                  <label htmlFor={`${baseId}-website`}>Leave this empty</label>
                  <input id={`${baseId}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
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
                  <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                    {submitting ? "Placing bid..." : `Place bid on ${lot.name}`}
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
