import { config } from "@/lib/config";
import { getRepository } from "@/lib/repo";
import { NO_STORE } from "@/lib/http/response";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness and readiness in one probe.
 *
 * Returns 503 when the data store is unreachable so a load balancer or uptime
 * monitor sees the failure rather than a page that renders an empty board.
 * Intentionally leaks no configuration values, only the shape of the setup.
 */
export async function GET() {
  const repository = getRepository();
  const store = await repository.healthCheck();

  const now = new Date();
  const body = {
    status: store.ok ? "ok" : "degraded",
    time: now.toISOString(),
    store: { driver: repository.driver, ok: store.ok, detail: store.detail },
    auction: {
      phase:
        now < config.auction.opensAt
          ? "pre-open"
          : now < config.auction.closesAt
            ? "open"
            : "closed",
    },
    /**
     * Configuration gaps that fail closed rather than crash. Surfaced here so a
     * misconfigured deploy is discoverable from a probe instead of from a
     * confused operator staring at a 401.
     */
    warnings: config.warnings,
  };

  return NextResponse.json(body, {
    status: store.ok ? 200 : 503,
    headers: NO_STORE,
  });
}
