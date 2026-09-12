import { config } from "./config";

type Level = "debug" | "info" | "warn" | "error";

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured single-line JSON logging. Every log platform (Vercel, CloudWatch,
 * Datadog, Loki) parses this without a custom ingest rule, which is what makes
 * a production failure diagnosable without shipping new code.
 */
function emit(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (RANK[level] < RANK[config.logLevel]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
  /** Returns a logger that stamps every line with the same correlation fields. */
  child(base: Record<string, unknown>) {
    return {
      debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, { ...base, ...f }),
      info: (m: string, f?: Record<string, unknown>) => emit("info", m, { ...base, ...f }),
      warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, { ...base, ...f }),
      error: (m: string, f?: Record<string, unknown>) => emit("error", m, { ...base, ...f }),
    };
  },
};
