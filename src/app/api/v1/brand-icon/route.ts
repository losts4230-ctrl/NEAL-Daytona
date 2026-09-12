import { logger } from "@/lib/logger";
import { requestId } from "@/lib/http/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/brand-icon?domain=example.com — a bidder's site icon.
 *
 * WHY A PROXY AT ALL
 * ------------------
 * Pointing an <img> straight at a third-party favicon service would make every
 * visitor's browser call that service on every page load, handing it their IP
 * address and a list of which sponsors they looked at. It would also force
 * `img-src` in the Content-Security-Policy open to an external host. Proxying
 * means the browser only ever talks to this origin, `img-src 'self'` stays
 * intact, and the upstream sees this server instead of the visitor.
 *
 * FAILURE IS THE NORMAL CASE
 * --------------------------
 * Most bidders will not have a fetchable icon. Rather than 404 and leave a
 * broken image in the history strip, an unresolvable domain gets a generated
 * monogram, so the layout is identical whether or not the fetch succeeded. That
 * also means this endpoint works with no outbound network access at all.
 */

/**
 * Hostnames only: labels of letters, digits and hyphens, at least one dot, and
 * a plausible TLD. That excludes credentials, ports, paths, IP literals and
 * `localhost`, which is what keeps this from becoming an SSRF primitive — the
 * value is interpolated into a request, so it is validated before it is used
 * rather than sanitised afterwards.
 */
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** Upstream icon source. Exactly one host, so the fetch target is never bidder-controlled. */
const ICON_SOURCE = (domain: string) =>
  `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;

const FETCH_TIMEOUT_MS = 2_500;
const MAX_ICON_BYTES = 100 * 1024;

/** Image types worth serving on. Anything else is treated as a failed fetch. */
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/svg+xml",
]);

/**
 * Deterministic monogram fallback.
 *
 * Same domain always yields the same colour, so a bidder's mark is stable
 * across lots and page loads even though nothing is stored about it. The text
 * is a single character taken from the validated domain, so nothing
 * bidder-controlled reaches the markup unescaped.
 */
function monogram(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 360;

  const letter = (seed.match(/[a-z0-9]/)?.[0] ?? "?").toUpperCase();
  const background = `hsl(${hash} 62% 92%)`;
  const foreground = `hsl(${hash} 55% 32%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="14" fill="${background}"/>
  <text x="32" y="33" fill="${foreground}" font-family="system-ui, sans-serif"
        font-size="32" font-weight="700" text-anchor="middle"
        dominant-baseline="central">${letter}</text>
</svg>`;
}

/** Long cache: an icon is not worth a round trip per page view. */
const ICON_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";

function monogramResponse(seed: string, status = 200): Response {
  return new Response(monogram(seed), {
    status,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": ICON_CACHE },
  });
}

export async function GET(request: Request) {
  const log = logger.child({
    requestId: requestId(request.headers),
    route: "GET /api/v1/brand-icon",
  });

  /**
   * Truncated before anything else touches it. A hostname cannot exceed 253
   * bytes, and the monogram fallback hashes every character of its seed — so an
   * unbounded query parameter would be free CPU for a caller to burn.
   */
  const raw =
    new URL(request.url).searchParams.get("domain")?.trim().toLowerCase().slice(0, 253) ?? "";

  // An invalid domain still returns an image, so a malformed history row renders
  // as a neutral mark rather than a broken-image icon.
  if (!DOMAIN_PATTERN.test(raw)) return monogramResponse(raw || "?");

  try {
    const upstream = await fetch(ICON_SOURCE(raw), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { accept: "image/*" },
    });

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!upstream.ok || !ALLOWED_TYPES.has(contentType)) return monogramResponse(raw);

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) {
      return monogramResponse(raw);
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": ICON_CACHE,
        // The upstream bytes are untrusted: stop a content-sniffing browser
        // from ever treating an "icon" as script.
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    log.debug("Brand icon fetch failed; serving monogram", {
      domain: raw,
      error: error instanceof Error ? error.name : "unknown",
    });
    return monogramResponse(raw);
  }
}
