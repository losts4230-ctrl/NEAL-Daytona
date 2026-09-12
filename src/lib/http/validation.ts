import { z } from "zod";
import { toMinor } from "@/lib/domain/money";

/**
 * Every byte of untrusted input is parsed here before it reaches the domain.
 * Strings are trimmed and length-capped at the boundary so no downstream layer
 * has to defend itself against a 10MB "company name".
 */
const trimmed = (max: number) => z.string().trim().max(max);

/**
 * True if the string contains an ASCII control character.
 *
 * Control characters in stored text break CSV exports, corrupt single-line log
 * records, and let a bidder forge convincing extra lines in an operator's
 * terminal. `allow` opts specific ones back in for genuinely multi-line fields.
 */
function hasControlCharacters(value: string, allow = ""): boolean {
  for (const character of value) {
    if (allow.includes(character)) continue;
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

const CONTROL_CHARACTER_MESSAGE = "Contains characters that are not allowed.";

/**
 * Wraps a string schema with a control-character check.
 *
 * Applied as the outermost refinement so length and format constraints (and
 * their own messages) stay on the underlying ZodString and remain chainable.
 */
function noControlCharacters(schema: z.ZodString, allow = "") {
  return schema.refine((v) => !hasControlCharacters(v, allow), CONTROL_CHARACTER_MESSAGE);
}

/** Single-line field: no control characters at all. */
const safeLine = (max: number) => noControlCharacters(trimmed(max));

/** Multi-line field: newlines and tabs are legitimate, nothing else is. */
const safeParagraph = (max: number) => noControlCharacters(trimmed(max), "\n\r\t");

export const placeBidSchema = z
  .object({
    panelId: trimmed(64).min(1),

    /**
     * Accepted in major units because that is what the bidder types. Converted
     * to integer minor units immediately and never handled as a float again.
     */
    amount: z
      .number()
      .finite()
      .positive()
      .max(1_000_000)
      // Guards against a float that cannot be represented in minor units, which
      // would otherwise be silently rounded on the way into the ledger.
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
        message: "Amount may have at most two decimal places.",
      }),

    displayName: noControlCharacters(
      trimmed(60).min(2, "Public name must be at least 2 characters."),
    ),
    contactName: noControlCharacters(
      trimmed(80).min(2, "Contact name must be at least 2 characters."),
    ),
    contactEmail: trimmed(254).email().toLowerCase(),
    contactPhone: safeLine(32).optional(),
    brandUrl: trimmed(512).url().optional().or(z.literal("")),
    message: safeParagraph(1_000).optional(),

    /** Must be ticked. The site states the terms next to the checkbox. */
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the bidding terms." }),
    }),

    /**
     * Honeypot. Hidden from real users by CSS and never focusable, so anything
     * that fills it is automated.
     *
     * Deliberately permissive here: if the schema rejected a non-empty value,
     * the validation response would name `website` as the failing field and
     * hand a bot the exact information the trap exists to withhold. The schema
     * lets it through and the route handler rejects it with the same generic
     * error as any other failure, naming no field at all.
     */
    website: trimmed(200).optional(),

    /** Client-generated, so a retry of the same submission is deduplicated. */
    idempotencyKey: trimmed(64).min(8),
  })
  .strict();

export type PlaceBidPayload = z.infer<typeof placeBidSchema>;

export function payloadToMinor(payload: PlaceBidPayload): number {
  return toMinor(payload.amount);
}

/** Empty strings from HTML forms mean "not provided", not "provided as blank". */
export function optionalText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export const listBidsQuerySchema = z.object({
  panelId: z.string().trim().max(64).optional(),
  status: z.enum(["active", "outbid", "accepted", "rejected", "withdrawn"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const decideBidSchema = z.object({ status: z.enum(["accepted", "rejected"]) }).strict();

export const setLotStatusSchema = z
  .object({ status: z.enum(["open", "reserved", "sold", "withdrawn"]) })
  .strict();
