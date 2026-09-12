"use client";

import type { PublicLot } from "@/lib/http/serialise";
import { BikeArt } from "./bike-art";
import { FULL_VIEW_BOX, ZONES } from "./bike-geometry";

/**
 * Interactive side elevation with selectable branding surfaces.
 *
 * A technical line elevation rather than an illustration: it matches the
 * typographic, near-monochrome design language, and it stays legible at phone
 * width where a photograph would not. Geometry lives in bike-geometry.ts so the
 * per-lot thumbnails crop the same drawing.
 *
 * A side view can only show one flank, so a zone maps to one *or two* lots.
 * Clicking selects the surface and the lot list scrolls to it, rather than the
 * diagram pretending to show a side it physically cannot.
 */
interface BikeDiagramProps {
  lots: readonly PublicLot[];
  selectedSurface: string | null;
  onSelectSurface: (zoneKey: string, panelIds: readonly string[]) => void;
}

export function BikeDiagram({ lots, selectedSurface, onSelectSurface }: BikeDiagramProps) {
  const byId = new Map(lots.map((lot) => [lot.id, lot]));

  return (
    <div className="diagram">
      <svg
        className="diagram__svg"
        viewBox={FULL_VIEW_BOX}
        role="group"
        aria-label="Side elevation of the Daytona 675R with selectable branding surfaces"
      >
        <BikeArt />

        <g>
          {ZONES.map((zone) => {
            const zoneLots = zone.panelIds
              .map((id) => byId.get(id))
              .filter((lot): lot is PublicLot => lot !== undefined);
            if (zoneLots.length === 0) return null;

            const allClosed = zoneLots.every((lot) => lot.status !== "open");
            const isSelected = selectedSurface === zone.key;

            const className = [
              "zone",
              zone.shape.kind === "ring" ? "zone--ring" : "",
              allClosed ? "zone--taken" : "",
              isSelected ? "zone--selected" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const title = `${zone.label} — ${
              zoneLots.length > 1 ? `${zoneLots.length} lots` : "1 lot"
            }${allClosed ? " (closed)" : ""}`;

            const select = () => {
              if (!allClosed) onSelectSurface(zone.key, zone.panelIds);
            };

            const handlers = {
              onClick: select,
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select();
                }
              },
              role: "button" as const,
              tabIndex: allClosed ? -1 : 0,
              "aria-label": title,
              "aria-pressed": isSelected,
              "aria-disabled": allClosed,
            };

            return zone.shape.kind === "ring" ? (
              <circle
                key={zone.key}
                className={className}
                cx={zone.shape.cx}
                cy={zone.shape.cy}
                r={zone.shape.r}
                fill="none"
                strokeWidth="12"
                {...handlers}
              >
                <title>{title}</title>
              </circle>
            ) : (
              <path key={zone.key} className={className} d={zone.shape.d} {...handlers}>
                <title>{title}</title>
              </path>
            );
          })}
        </g>
      </svg>

      <p className="diagram__legend">
        <span>
          <span className="legend__swatch" style={{ background: "var(--ember)" }} />
          Selected
        </span>
        <span>
          <span className="legend__swatch" style={{ background: "#c9c9d0" }} />
          Available
        </span>
        <span>
          <span className="legend__swatch" style={{ background: "#ededf0" }} />
          Closed
        </span>
        <span style={{ marginLeft: "auto" }}>Tap a surface to jump to its lot</span>
      </p>
    </div>
  );
}
