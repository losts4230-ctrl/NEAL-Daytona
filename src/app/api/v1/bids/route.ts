import { logger } from "@/lib/logger";
import { getRepository } from "@/lib/repo";
import { clientAddress, clientUserAgent, hashAddress, requestId } from "@/lib/http/client";
import { checkRateLimit } from "@/lib/http/rate-limit";
import { NO_STORE, fail, ok } from "@/lib/http/response";
import { toPublicBidReceipt, toPublicLot } from "@/lib/http/serialise";
import { optionalText, placeBidSchema } from "@/lib/http/validation";

export const dynamic = "force-dynamic";

/** Rejected bids map to a 409 (state conflict) rather than a 400 (bad syntax). */
const CONFLICT_CODES = new Set([
  "AUCTION_NOT_OPEN",
  "AUCTION_CLOSED",
  "PANEL_UNAVAILABLE",
  "PRICE_MOVED",
]);

/**
 * POST /api/v1/bids — place a bid.
 *
 * The handler does transport concerns only: rate limit, parse, delegate, shape
 * the response. It contains no bidding rule of its own; the repository runs
 * `evaluateBid` inside the same transaction as the write, which is the only
 * place a bid can be judged without a race.
 */
export async function POST(request: Request) {
  const id = requestId(request.headers);
  const log = logger.child({ requestId: id, route: "POST /api/v1/bids" });
  const startedAt = Date.now();

  const address = clientAddress(request.headers);
  const ipHash = hashAddress(address);

  const limit = checkRateLimit(`bid:${ipHash ?? "unknown"}`);
  if (!limit.allowed) {
    log.warn("Bid rate limited", { ipHash, retryAfterSeconds: limit.retryAfterSeconds });
    return fail(
      429,
      { code: "RATE_LIMITED", message: "Too many bids from this connection. Please wait." },
      {
        headers: {
          ...NO_STORE,
          "retry-after": String(limit.retryAfterSeconds),
          "x-ratelimit-remaining": "0",
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(
      400,
      { code: "INVALID_JSON", message: "Request body must be valid JSON." },
      { headers: NO_STORE },
    );
  }

  const parsed = placeBidSchema.safeParse(body);
  if (!parsed.success) {
    log.info("Bid rejected at validation", {
      issues: parsed.error.issues.map((i) => i.path.join(".")),
    });
    return fail(
      400,
      {
        code: "VALIDATION_FAILED",
        message: "Please check the highlighted fields.",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { headers: NO_STORE },
    );
  }

  const payload = parsed.data;

  // Honeypot: only automation fills a field it cannot see. Answer 400 with the
  // generic validation code so a scripted bidder learns nothing from the shape.
  if (payload.website) {
    log.warn("Bid rejected by honeypot", { ipHash });
    return fail(
      400,
      { code: "VALIDATION_FAILED", message: "Please check the highlighted fields." },
      { headers: NO_STORE },
    );
  }

  try {
    const repository = getRepository();
    const result = await repository.placeBid(
      {
        panelId: payload.panelId,
        expectedAmountMinor: payload.expectedAmountMinor,
        displayName: payload.displayName,
        contactName: payload.contactName,
        contactEmail: payload.contactEmail,
        contactPhone: optionalText(payload.contactPhone),
        brandUrl: optionalText(payload.brandUrl),
        message: optionalText(payload.message),
        ipHash,
        userAgent: clientUserAgent(request.headers),
        idempotencyKey: payload.idempotencyKey,
      },
      new Date(),
    );

    if (!result.ok) {
      const status = CONFLICT_CODES.has(result.decision.code) ? 409 : 400;
      log.info("Bid rejected by auction rules", {
        panelId: payload.panelId,
        code: result.decision.code,
        durationMs: Date.now() - startedAt,
      });
      return fail(
        status,
        {
          code: result.decision.code,
          message: result.decision.message,
          /**
           * Always the live next price. A PRICE_MOVED client can re-render the
           * button from this without a second round trip.
           */
          details: { nextBidMinor: result.decision.nextAmountMinor },
        },
        { headers: NO_STORE },
      );
    }

    log.info("Bid accepted", {
      bidId: result.bid.id,
      panelId: result.bid.panelId,
      amountMinor: result.bid.amountMinor,
      deduplicated: result.deduplicated,
      durationMs: Date.now() - startedAt,
    });

    return ok(
      { bid: toPublicBidReceipt(result.bid), lot: toPublicLot(result.lot) },
      { status: result.deduplicated ? 200 : 201, headers: NO_STORE },
    );
  } catch (error) {
    log.error("Bid failed unexpectedly", {
      panelId: payload.panelId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    // Never echo an internal error to a bidder; the log line carries the detail.
    return fail(
      500,
      {
        code: "BID_FAILED",
        message: "We could not record that bid. Nothing has been charged — please try again.",
      },
      { headers: NO_STORE },
    );
  }
}
