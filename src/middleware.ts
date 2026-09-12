import { NextResponse, type NextRequest } from "next/server";

/**
 * Nonce-based Content-Security-Policy.
 *
 * A fresh nonce per response, echoed back on the request so Next.js stamps it
 * onto its own bootstrap scripts. `strict-dynamic` then lets those scripts load
 * the chunks they need without the policy having to enumerate build hashes —
 * which is what makes a strict CSP survive a redeploy.
 *
 * `style-src 'unsafe-inline'` is a known, accepted exception: Next injects
 * inline style attributes during hydration, and inline styles are not a script
 * execution vector. Everything that can execute is nonce-gated.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // The dev server compiles with eval; production never needs it.
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  /** Static assets are immutable and need no policy evaluation. */
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
