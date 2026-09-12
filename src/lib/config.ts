import { z } from "zod";

/**
 * Single source of truth for runtime configuration.
 *
 * Everything the app needs comes from the environment and is validated once, at
 * import time, so a misconfigured deploy fails immediately and loudly rather
 * than halfway through a bid.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** "memory" runs with no external dependency; "postgres" is the production driver. */
  DATA_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().url().optional(),

  /** Shared secret guarding /api/admin/*. Phase 2 replaces this with real SSO. */
  ADMIN_API_TOKEN: z.string().min(32).optional(),

  /** ISO 8601. Bids are rejected outside this window. */
  AUCTION_OPENS_AT: z.string().datetime().default("2026-09-01T09:00:00.000Z"),
  AUCTION_CLOSES_AT: z.string().datetime().default("2026-11-30T20:00:00.000Z"),

  /** ISO 4217. Drives every price rendered on the site. */
  CURRENCY: z.string().length(3).default("GBP"),
  LOCALE: z.string().default("en-GB"),

  /** Sliding-window cap on bid submissions per client, per window. */
  BID_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  BID_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

/**
 * Two classes of problem, handled differently on purpose.
 *
 * A *malformed* value (a non-URL DATABASE_URL, an unparseable date, a close
 * before an open) is a programming or deployment error that is wrong in every
 * environment, so it throws immediately at import and fails the build.
 *
 * A *missing secret* is not. `next build` runs with NODE_ENV=production on a
 * build machine that should never hold production secrets, so throwing on an
 * absent ADMIN_API_TOKEN would make secret injection a build-time requirement —
 * exactly the coupling you do not want. Those are collected as warnings, the
 * dependent feature fails closed at request time (admin auth returns 401), and
 * the warning is surfaced on /api/health so the gap is visible rather than
 * silent.
 */
function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  const env = parsed.data;

  const opensAt = new Date(env.AUCTION_OPENS_AT);
  const closesAt = new Date(env.AUCTION_CLOSES_AT);
  if (closesAt <= opensAt) {
    throw new Error("AUCTION_CLOSES_AT must be after AUCTION_OPENS_AT.");
  }

  const warnings: string[] = [];
  if (env.NODE_ENV === "production") {
    if (!env.ADMIN_API_TOKEN) {
      warnings.push(
        "ADMIN_API_TOKEN is not set: the admin API will reject every request until it is.",
      );
    }
    if (env.DATA_DRIVER === "memory") {
      warnings.push(
        "DATA_DRIVER=memory in production: bids are per-instance and lost on restart.",
      );
    }
  }

  return {
    warnings,
    nodeEnv: env.NODE_ENV,
    dataDriver: env.DATA_DRIVER,
    databaseUrl: env.DATABASE_URL,
    adminApiToken: env.ADMIN_API_TOKEN,
    auction: { opensAt, closesAt },
    money: { currency: env.CURRENCY, locale: env.LOCALE },
    rateLimit: { max: env.BID_RATE_LIMIT, windowSeconds: env.BID_RATE_WINDOW_SECONDS },
    logLevel: env.LOG_LEVEL,
  } as const;
}

export const config = load();
export type Config = typeof config;
