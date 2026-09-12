import { createHash, randomUUID } from "node:crypto";

/**
 * Best-effort client address.
 *
 * Only trusted because this app is designed to sit behind a platform edge
 * (Vercel, Cloudflare) that overwrites these headers. Behind a raw origin they
 * are attacker-controlled, so rate limits keyed on them are advisory — see the
 * hardening notes in docs/ARCHITECTURE.md.
 */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? null;
}

/**
 * Salted hash of the client address, stored instead of the address itself.
 *
 * An IP is personal data under GDPR; a hash keeps the abuse-investigation value
 * (same-source detection, correlating a burst of bids) without retaining the
 * identifier. The salt is per-deployment so hashes are not comparable across
 * environments or reversible with a rainbow table of the IPv4 space.
 */
const SALT = process.env.IP_HASH_SALT ?? randomUUID();

export function hashAddress(address: string | null): string | null {
  if (!address) return null;
  return createHash("sha256").update(`${SALT}:${address}`).digest("hex").slice(0, 32);
}

/** Truncated so a stored user agent cannot be used as a log-injection vector. */
export function clientUserAgent(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  if (!ua) return null;
  return ua.replace(/[\r\n]/g, " ").slice(0, 256);
}

export function requestId(headers: Headers): string {
  return headers.get("x-request-id") ?? headers.get("x-vercel-id") ?? randomUUID();
}
