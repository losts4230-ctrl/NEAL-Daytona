import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { MemoryAuctionRepository } from "./memory";
import { createPostgresRepository } from "./postgres";
import type { AuctionRepository } from "./types";

export type { AuctionRepository, BidRecord, LotState, PlaceBidInput } from "./types";

let instance: AuctionRepository | undefined;

/**
 * Resolves the configured repository once per process. Swapping drivers is a
 * single environment variable, which is what keeps the domain and HTTP layers
 * free of any database-specific code.
 */
export function getRepository(): AuctionRepository {
  if (instance) return instance;

  if (config.dataDriver === "postgres") {
    if (!config.databaseUrl) throw new Error("DATABASE_URL is required for the postgres driver.");
    instance = createPostgresRepository(config.databaseUrl);
  } else {
    if (config.nodeEnv === "production") {
      logger.warn(
        "Running the in-memory data driver in production. Bids are per-process and are lost on restart.",
        { remediation: "Set DATA_DRIVER=postgres and DATABASE_URL." },
      );
    }
    instance = new MemoryAuctionRepository();
  }

  logger.info("Auction repository initialised", { driver: instance.driver });
  return instance;
}
