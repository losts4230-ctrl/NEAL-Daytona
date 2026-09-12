import { logger } from "@/lib/logger";
import { getRepository } from "@/lib/repo";
import { isAuthorisedAdmin } from "@/lib/http/auth";
import { requestId } from "@/lib/http/client";
import { NO_STORE, fail, ok } from "@/lib/http/response";
import { toAdminBid } from "@/lib/http/serialise";
import { decideBidSchema } from "@/lib/http/validation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/admin/bids/:bidId — accept or reject a bid.
 *
 * Only the status moves. The bid itself is never rewritten, so the ledger stays
 * a faithful record of what was actually offered and when.
 */
export async function PATCH(request: Request, context: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await context.params;
  const log = logger.child({
    requestId: requestId(request.headers),
    route: "PATCH /api/v1/admin/bids/:bidId",
    bidId,
  });

  if (!isAuthorisedAdmin(request)) {
    log.warn("Unauthorised admin write rejected");
    return fail(
      401,
      { code: "UNAUTHORISED", message: "Admin credentials required." },
      { headers: { ...NO_STORE, "www-authenticate": 'Bearer realm="admin"' } },
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

  const parsed = decideBidSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      400,
      { code: "VALIDATION_FAILED", message: "status must be 'accepted' or 'rejected'." },
      { headers: NO_STORE },
    );
  }

  const updated = await getRepository().decideBid(bidId, parsed.data.status);
  if (!updated) {
    return fail(
      404,
      { code: "BID_NOT_FOUND", message: "No such bid, or it can no longer be decided." },
      { headers: NO_STORE },
    );
  }

  // Deliberately logged at info: this is an auditable commercial decision.
  log.info("Bid decided", { status: updated.status, panelId: updated.panelId });

  return ok({ bid: toAdminBid(updated) }, { headers: NO_STORE });
}
