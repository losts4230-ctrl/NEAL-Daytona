import { NextResponse } from "next/server";

/**
 * Uniform response envelope.
 *
 * Success is `{ data }`, failure is `{ error: { code, message, details? } }`,
 * always. A client can branch on the shape without special-casing individual
 * endpoints, and `code` is a stable machine contract while `message` stays free
 * to be reworded.
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function fail(status: number, error: ApiError, init?: ResponseInit): NextResponse {
  return NextResponse.json({ error }, { ...init, status });
}

export const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * Public auction state, cached very briefly at the edge.
 *
 * 5 seconds is short enough that the board never looks stale to a bidder, and
 * long enough to absorb a traffic spike: a link doing the rounds on social
 * collapses into a handful of origin reads per minute instead of thousands.
 * `stale-while-revalidate` keeps the response instant during the refresh.
 */
export const SHORT_PUBLIC_CACHE = {
  "cache-control": "public, s-maxage=5, stale-while-revalidate=25",
} as const;
