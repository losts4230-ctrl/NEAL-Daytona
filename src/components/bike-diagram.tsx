"use client";

import type { PublicLot } from "@/lib/http/serialise";

/**
 * Interactive side elevation of the bike.
 *
 * Drawn as a technical line elevation rather than an illustration: hairline
 * strokes, flat fills, no gradients. It matches the rest of the design language
 * and — more usefully — it stays legible at phone width, where a photograph of
 * a black bike on a black page would not.
 *
 * A side view can only show one flank, so a zone maps to one *or two* lots
 * (left and right of the same surface). Clicking a zone selects the surface and
 * the lot list reveals both sides, rather than the diagram pretending to show a
 * side it physically cannot.
 *
 * GEOMETRY
 * --------
 * One coordinate system, stated once, so every shape stays consistent:
 *   - Rear axle (300, 372), front axle (748, 372), both wheels r = 98.
 *     That is a 448-unit wheelbase over a 196-unit wheel — the real 1395 mm /
 *     620 mm ratio of a 675R on 17" wheels.
 *   - Ground at y = 470, exactly tangent to both tyres.
 *   - Seat dip at y = 208 and screen top at y = 132, matching a real 830 mm
 *     seat height and ~1100 mm screen height at the same scale.
 *
 * The upper bodywork is ONE continuous silhouette, subdivided into panels that
 * tile it exactly — tail, seat, tank, fairing and nose share their edges, so
 * the seams read as cuts in a single form rather than as separate floating
 * shapes. The outline is deliberately angular: a supersport is a set of creased
 * wedges, and rounded shapes here read as a scooter. The tail rises toward the
 * rear and tapers to a point, which is the single strongest cue that this is a
 * sportbike and not a naked.
 *
 * Every zone is checked against the wheel circles so no tint falls inside a
 * tyre: at any x, a wheel's upper surface is y = 372 - sqrt(98^2 - (x-cx)^2).
 * Panels clear the fender crescents (radius 99-111) by 14-19 units, which is
 * what stops the diagram reading as overlapping blobs.
 *
 * Draw order is load-bearing: structure, then fork, then bodywork (so the
 * fairing covers the fork mid-section exactly as it does on the bike), then
 * wheels, then the interactive tints on top.
 */

interface Zone {
  key: string;
  label: string;
  panelIds: readonly string[];
  /** Rendered shape. Rings are stroked annuli; everything else is a filled path. */
  shape: { kind: "path"; d: string } | { kind: "ring"; cx: number; cy: number; r: number };
}

/**
 * Bodywork silhouettes, shared by the static art and the interactive overlay.
 *
 * The upper panels tile ONE continuous outline. Read along the top, rear to
 * front: 248,198 -> 352,194 -> 420,212 (tail) -> 510,204 (seat) -> 570,186 ->
 * 648,190 (tank) -> 738,166 -> 796,180 (fairing) -> 856,214 (nose). Panels
 * share those vertices, so change one and you must change it in both panels
 * that meet there or a seam opens up.
 *
 * The fairing is the deep panel that gives the bike its shape: it runs from the
 * screen line all the way down to the belly pan at 640,332, covering the engine
 * the way a fully faired supersport does. Its lower edge is not a straight line
 * but a profile that stays clear of the front wheel — flat over the tyre
 * (256-266) where the fender crescent sits at radius 111, then plunging to 332
 * once past the tyre's rear edge at x = 650. That single edge is what stops the
 * fairing tint spilling across a wheel while still letting the panel look as
 * deep as it really is.
 */
const SHAPE = {
  screen: "M 788 178 L 734 142 L 742 128 L 798 162 Z",
  nose: "M 796 180 L 830 190 L 856 214 L 852 250 L 800 256 Z",
  fairing:
    "M 648 190 L 738 166 L 796 180 L 800 256 L 770 258 L 748 256 L 700 266 L 670 286 L 656 320 L 640 332 L 654 240 Z",
  tank: "M 510 204 L 570 186 L 648 190 L 654 240 L 566 240 L 516 230 Z",
  seat: "M 420 212 L 510 204 L 516 230 L 428 244 Z",
  tail: "M 248 198 L 352 194 L 420 212 L 428 244 L 348 250 L 254 222 Z",
  bellyPan: "M 452 332 L 556 318 L 630 328 L 640 332 L 644 364 L 606 400 L 500 400 L 456 370 Z",
  swingarm: "M 398 348 L 448 340 L 450 364 L 400 372 Z",
  frontFender: "M 660 304 A 111 111 0 0 1 836 304 L 826 311 A 99 99 0 0 0 670 311 Z",
  hugger: "M 232 285 A 111 111 0 0 1 385 301 L 376 308 A 99 99 0 0 0 239 294 Z",
  forkLowers: "M 748 350 L 719 284 L 702 292 L 732 357 Z",
  engine: "M 492 252 L 566 246 L 610 296 L 552 320 L 488 298 Z",
} as const;

const ZONES: readonly Zone[] = [
  {
    key: "upper-fairing",
    label: "Upper fairing",
    panelIds: ["upper-fairing-left", "upper-fairing-right"],
    shape: { kind: "path", d: SHAPE.fairing },
  },
  {
    key: "nose",
    label: "Nose number board",
    panelIds: ["nose-number-board"],
    shape: { kind: "path", d: SHAPE.nose },
  },
  {
    key: "windscreen",
    label: "Windscreen strip",
    panelIds: ["windscreen-strip"],
    shape: { kind: "path", d: SHAPE.screen },
  },
  {
    key: "tank",
    label: "Tank",
    panelIds: ["tank-left", "tank-right"],
    shape: { kind: "path", d: SHAPE.tank },
  },
  {
    key: "seat-cowl",
    label: "Seat cowl",
    panelIds: ["seat-cowl-left", "seat-cowl-right"],
    shape: { kind: "path", d: SHAPE.tail },
  },
  {
    key: "belly-pan",
    label: "Belly pan",
    panelIds: ["belly-pan-left", "belly-pan-right"],
    shape: { kind: "path", d: SHAPE.bellyPan },
  },
  {
    key: "swingarm",
    label: "Swingarm",
    panelIds: ["swingarm-left", "swingarm-right"],
    shape: { kind: "path", d: SHAPE.swingarm },
  },
  {
    key: "front-fender",
    label: "Front fender",
    panelIds: ["front-fender"],
    shape: { kind: "path", d: SHAPE.frontFender },
  },
  {
    key: "hugger",
    label: "Rear hugger",
    panelIds: ["tail-hugger"],
    shape: { kind: "path", d: SHAPE.hugger },
  },
  {
    key: "fork-lowers",
    label: "Fork lowers",
    panelIds: ["fork-lowers"],
    shape: { kind: "path", d: SHAPE.forkLowers },
  },
  {
    /** Shown on the rear wheel: the front rim is crossed by the fork slider. */
    key: "wheel-rims",
    label: "Wheel rim decals",
    panelIds: ["wheel-rims"],
    shape: { kind: "ring", cx: 300, cy: 372, r: 70 },
  },
];

/** Spoke end points for a wheel, offset so the two wheels are not identical. */
function spokes(cx: number, offsetDegrees: number) {
  return [0, 60, 120].map((deg) => {
    const radians = ((deg + offsetDegrees) * Math.PI) / 180;
    const dx = 58 * Math.cos(radians);
    const dy = 58 * Math.sin(radians);
    return { key: `${cx}-${deg}`, x1: cx + dx, y1: 372 + dy, x2: cx - dx, y2: 372 - dy };
  });
}

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
        viewBox="180 100 740 400"
        role="group"
        aria-label="Side elevation of the Daytona 675R with selectable branding surfaces"
      >
        {/* ---- Ground reference ------------------------------------------ */}
        <line x1="200" y1="470" x2="900" y2="470" stroke="var(--rule-strong)" strokeWidth="1" />

        {/* ---- Structure: visible between the bodywork masses ------------ */}
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d={SHAPE.engine} fill="#191d23" stroke="var(--rule)" strokeWidth="1" />
          {/* Frame spar, outboard of the engine, headstock to swingarm pivot. */}
          <path d="M 648 236 L 566 248 L 496 266" fill="none" stroke="#262b32" strokeWidth="12" />
          {/* Swingarm through to the rear axle; the belly pan hides the pivot. */}
          <line x1="470" y1="350" x2="306" y2="372" stroke="#22262c" strokeWidth="17" />
          {/* Subframe strut carrying the tail. */}
          <line x1="474" y1="292" x2="424" y2="246" stroke="#22262c" strokeWidth="9" />
          {/* Ohlins TTX36 shock. */}
          <line x1="446" y1="328" x2="430" y2="256" stroke="var(--gold)" strokeWidth="8" opacity="0.5" />
        </g>

        {/* ---- Fork, drawn before the bodywork so the fairing covers it -- */}
        <g strokeLinecap="round">
          {/* Ohlins NIX30 gold slider, visible below the fairing's lower edge. */}
          <line x1="748" y1="372" x2="699" y2="262" stroke="var(--gold)" strokeWidth="15" opacity="0.6" />
          {/* Upper tube, mostly hidden behind the fairing; the yoke shows above it. */}
          <line x1="701" y1="266" x2="658" y2="170" stroke="#2a2f36" strokeWidth="12" />
        </g>

        {/* ---- Bodywork masses ------------------------------------------- */}
        <g stroke="var(--rule-strong)" strokeWidth="1.25" strokeLinejoin="round">
          <path d={SHAPE.tail} fill="#16191f" />
          <path d={SHAPE.seat} fill="#151920" />
          <path d={SHAPE.tank} fill="#16191f" />
          <path d={SHAPE.fairing} fill="#16191f" />
          <path d={SHAPE.nose} fill="#14171c" />
          <path d={SHAPE.screen} fill="#0f1216" />
          <path d={SHAPE.bellyPan} fill="#16191f" />
          <path d={SHAPE.frontFender} fill="#14171c" />
          <path d={SHAPE.hugger} fill="#14171c" />
        </g>

        {/* ---- Wheels, on top: a tyre passes in front of the bodywork --- */}
        <g fill="none" strokeLinecap="round">
          <circle cx="300" cy="372" r="87" stroke="#1d2127" strokeWidth="22" />
          <circle cx="748" cy="372" r="87" stroke="#1d2127" strokeWidth="22" />
          <circle cx="300" cy="372" r="98" stroke="var(--rule)" strokeWidth="1" />
          <circle cx="748" cy="372" r="98" stroke="var(--rule)" strokeWidth="1" />

          <circle cx="300" cy="372" r="62" stroke="var(--rule-bright)" strokeWidth="5" />
          <circle cx="748" cy="372" r="62" stroke="var(--rule-bright)" strokeWidth="5" />
          {[...spokes(300, 0), ...spokes(748, 25)].map((s) => (
            <line
              key={s.key}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke="var(--rule-bright)"
              strokeWidth="4"
            />
          ))}

          {/* Brembo monobloc discs. */}
          <circle cx="748" cy="372" r="44" stroke="var(--rule-strong)" strokeWidth="2" />
          <circle cx="300" cy="372" r="34" stroke="var(--rule-strong)" strokeWidth="2" />
        </g>

        {/* ---- Interactive zones ----------------------------------------- */}
        <g>
          {ZONES.map((zone) => {
            const zoneLots = zone.panelIds
              .map((id) => byId.get(id))
              .filter((lot): lot is PublicLot => lot !== undefined);
            if (zoneLots.length === 0) return null;

            const tier = zoneLots[0]?.tier ?? "standard";
            const allClosed = zoneLots.every((lot) => lot.status !== "open");
            const isSelected = selectedSurface === zone.key;

            const className = [
              "zone",
              `zone--${tier}`,
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
          Hero
        </span>
        <span>
          <span className="legend__swatch" style={{ background: "var(--gold)" }} />
          Premium
        </span>
        <span>
          <span className="legend__swatch" style={{ background: "#6aa8ff" }} />
          Standard
        </span>
        <span>
          <span className="legend__swatch" style={{ background: "var(--text-faint)" }} />
          Closed
        </span>
        <span style={{ marginLeft: "auto" }}>Tap a surface to jump to its lots</span>
      </p>
    </div>
  );
}
