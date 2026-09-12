import { config } from "@/lib/config";
import { bidIncrement, extendedCloseAt, fundingPercent } from "@/lib/domain/bidding";
import { TOTAL_AREA_CM2 } from "@/lib/domain/panels";
import { logger } from "@/lib/logger";
import { getRepository } from "@/lib/repo";
import { SHORT_PUBLIC_CACHE, fail, ok } from "@/lib/http/response";
import { toPublicLot } from "@/lib/http/serialise";
import { requestId } from "@/lib/http/client";

/** Auction state is live; never statically prerendered. */
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/lots — the public board.
 *
 * One repository call, two database queries regardless of lot count: one
 * aggregate and one top-N-per-lot for the history strips. This is the most
 * requested endpoint on the site, so it stays free of per-lot follow-up work.
 */
export async function GET(request: Request) {
  const log = logger.child({ requestId: requestId(request.headers), route: "GET /api/v1/lots" });
  const startedAt = Date.now();

  try {
    const repository = getRepository();
    const lots = await repository.listLots();
    const publicLots = lots.map(toPublicLot);

    const latestBidAt = lots.reduce<Date | null>(
      (latest, lot) =>
        lot.lastBidAt && (latest === null || lot.lastBidAt > latest) ? lot.lastBidAt : latest,
      null,
    );

    /**
     * Raised is the sum of the leading bids, not of every bid ever placed: an
     * outbid bid is never invoiced, so counting it would overstate funding.
     */
    const raisedMinor = lots.reduce((sum, lot) => sum + (lot.currentHighMinor ?? 0), 0);

    log.info("Served auction board", {
      durationMs: Date.now() - startedAt,
      lotCount: publicLots.length,
    });

    return ok(
      {
        lots: publicLots,
        auction: {
          opensAt: config.auction.opensAt.toISOString(),
          closesAt: config.auction.closesAt.toISOString(),
          /** Reflects any per-lot anti-snipe extension already earned. */
          effectiveClosesAt: extendedCloseAt(config.auction.closesAt, latestBidAt).toISOString(),
          currency: config.money.currency,
          locale: config.money.locale,
          incrementMinor: bidIncrement(),
        },
        funding: {
          raisedMinor,
          targetMinor: config.auction.targetMinor,
          percent: Math.round(fundingPercent(raisedMinor, config.auction.targetMinor)),
        },
        totals: {
          lotCount: publicLots.length,
          totalAreaCm2: TOTAL_AREA_CM2,
          bidCount: lots.reduce((sum, lot) => sum + lot.bidCount, 0),
        },
        /** Surfaced so the UI can warn when bids are not durable. */
        driver: repository.driver,
      },
      { headers: SHORT_PUBLIC_CACHE },
    );
  } catch (error) {
    log.error("Failed to serve auction board", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(503, {
      code: "BOARD_UNAVAILABLE",
      message: "Auction data is temporarily unavailable. Please retry shortly.",
    });
  }
}
