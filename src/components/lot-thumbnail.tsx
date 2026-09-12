import { BikeArt } from "./bike-art";
import { zoneForPanel } from "./bike-geometry";

/**
 * A lot's thumbnail: the same elevation, cropped to that surface and with the
 * surface itself picked out in ink.
 *
 * Reusing one drawing with a per-zone view box gives every row its own framing
 * of the bike — the effect the reference site gets from a different photograph
 * per area — with no image assets, no layout shift and nothing to keep in sync
 * when a panel's geometry changes.
 */
export function LotThumbnail({ panelId, label }: { panelId: string; label: string }) {
  const zone = zoneForPanel(panelId);
  if (!zone) return <div className="lot__thumb" aria-hidden="true" />;

  return (
    <div className="lot__thumb">
      <svg viewBox={zone.focus} role="img" aria-label={`${label} highlighted on the bike`}>
        <BikeArt faded />
        {zone.shape.kind === "ring" ? (
          <circle
            cx={zone.shape.cx}
            cy={zone.shape.cy}
            r={zone.shape.r}
            fill="none"
            stroke="var(--ink)"
            strokeOpacity="0.85"
            strokeWidth="12"
          />
        ) : (
          <path
            d={zone.shape.d}
            fill="var(--ink)"
            fillOpacity="0.82"
            stroke="var(--ink)"
            strokeWidth="1.5"
          />
        )}
      </svg>
    </div>
  );
}
