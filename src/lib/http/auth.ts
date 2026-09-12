import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

/**
 * Admin authentication: a single shared bearer token.
 *
 * This is a deliberate launch-scope decision, not an oversight. It is adequate
 * for exactly one operator and nothing more — there is no per-user identity, no
 * revocation short of rotating the secret, and no audit trail of who acted.
 * Before a second person gets access, this must be replaced with real SSO and
 * the Admin/Manager/Viewer roles described in docs/ARCHITECTURE.md.
 */
export function isAuthorisedAdmin(request: Request): boolean {
  const expected = config.adminApiToken;
  if (!expected) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  const presented = header.slice("Bearer ".length);

  // Compare digests of equal length: a direct compare of the raw values leaks
  // the secret's length, and timingSafeEqual throws on a length mismatch.
  const a = Buffer.from(presented.padEnd(expected.length, "\0").slice(0, expected.length));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) && presented.length === expected.length;
}
