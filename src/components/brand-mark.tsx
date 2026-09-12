/**
 * A bidder's visual identity: the icon of the site they gave, or a monogram.
 *
 * The image is always served from this origin via /api/v1/brand-icon, never
 * from a third-party favicon service directly. That keeps `img-src 'self'` in
 * the Content-Security-Policy and stops every visitor's browser announcing
 * itself — and which sponsors it is looking at — to an external host.
 *
 * The endpoint answers with a generated monogram when it cannot resolve an
 * icon, so there is no broken-image state and no need for an onError handler
 * that would turn this into a client component.
 */
export function BrandMark({
  domain,
  name,
  size = "md",
}: {
  domain: string | null;
  name: string;
  size?: "md" | "sm";
}) {
  const className = size === "sm" ? "brandmark brandmark--sm" : "brandmark";

  // `domain` is a hostname derived by the server from a parsed URL, so it is
  // safe to encode into a query string here.
  const src = `/api/v1/brand-icon?domain=${encodeURIComponent(domain ?? name)}`;

  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a 24px icon from
          our own proxy gains nothing from next/image and would add a second
          optimisation hop in front of an already-cached endpoint. */}
      <img src={src} alt="" width={24} height={24} loading="lazy" decoding="async" />
    </span>
  );
}
