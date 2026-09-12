import { logger } from "@/lib/logger";
import { getRepository } from "@/lib/repo";
import { isAuthorisedAdmin } from "@/lib/http/auth";
import { requestId } from "@/lib/http/client";
import { NO_STORE, fail, ok } from "@/lib/http/response";
import { toAdminBid } from "@/lib/http/serialise";
import { listBidsQuerySchema } from "@/lib/http/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/bids — the operator's view, including bidder contact data.
 *
 * Paginated by default: this endpoint returns personal data, so an unbounded
 * response would be both a performance and a disclosure problem.
 */
export async function GET(request: Request) {
  const log = logger.child({
    requestId: requestId(request.headers),
    route: "GET /api/v1/admin/bids",
  });

  if (!isAuthorisedAdmin(request)) {
    log.warn("Unauthorised admin read rejected");
    return fail(
      401,
      { code: "UNAUTHORISED", message: "Admin credentials required." },
      { headers: { ...NO_STORE, "www-authenticate": 'Bearer realm="admin"' } },
    );
  }

  const url = new URL(request.url);
  const parsed = listBidsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return fail(
      400,
      {
        code: "VALIDATION_FAILED",
        message: "Invalid query parameters.",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { headers: NO_STORE },
    );
  }

  const page = await getRepository().listBids(parsed.data);

  log.info("Served admin bid list", {
    returned: page.items.length,
    total: page.total,
    filters: { panelId: parsed.data.panelId, status: parsed.data.status },
  });

  return ok(
    {
      bids: page.items.map(toAdminBid),
      pagination: {
        total: page.total,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        hasMore: parsed.data.offset + page.items.length < page.total,
      },
    },
    { headers: NO_STORE },
  );
}
