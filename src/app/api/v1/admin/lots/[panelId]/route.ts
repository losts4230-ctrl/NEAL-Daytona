import { logger } from "@/lib/logger";
import { getRepository } from "@/lib/repo";
import { isAuthorisedAdmin } from "@/lib/http/auth";
import { requestId } from "@/lib/http/client";
import { NO_STORE, fail, ok } from "@/lib/http/response";
import { toPublicLot } from "@/lib/http/serialise";
import { setLotStatusSchema } from "@/lib/http/validation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/admin/lots/:panelId — move a lot's status.
 *
 * Withdrawing or marking a lot sold is how the operator closes it to further
 * bids without touching the bid history.
 */
export async function PATCH(request: Request, context: { params: Promise<{ panelId: string }> }) {
  const { panelId } = await context.params;
  const log = logger.child({
    requestId: requestId(request.headers),
    route: "PATCH /api/v1/admin/lots/:panelId",
    panelId,
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

  const parsed = setLotStatusSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      400,
      {
        code: "VALIDATION_FAILED",
        message: "status must be one of open, reserved, sold, withdrawn.",
      },
      { headers: NO_STORE },
    );
  }

  const lot = await getRepository().setLotStatus(panelId, parsed.data.status);
  if (!lot) {
    return fail(
      404,
      { code: "LOT_NOT_FOUND", message: "No such lot." },
      { headers: NO_STORE },
    );
  }

  log.info("Lot status changed", { status: lot.status });

  return ok({ lot: toPublicLot(lot) }, { headers: NO_STORE });
}
