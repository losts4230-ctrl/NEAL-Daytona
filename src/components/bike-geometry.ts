/**
 * Geometry for the bike elevation.
 *
 * Pure data, shared by the interactive diagram and the per-lot thumbnails, so
 * the small crop on a lot row is guaranteed to be the same surface the big
 * diagram highlights. Duplicating these paths in two components is how those
 * two views silently drift apart.
 *
 * ONE COORDINATE SYSTEM
 * ---------------------
 *   - Rear axle (300, 372), front axle (748, 372), both wheels r = 98.
 *     A 448-unit wheelbase over a 196-unit wheel is the real 1395 mm / 620 mm
 *     ratio of a 675R on 17" wheels.
 *   - Ground at y = 470, exactly tangent to both tyres.
 *   - Seat dip at y = 208, screen top at y = 132, matching a real 830 mm seat
 *     height and ~1100 mm screen height at the same scale.
 *
 * The upper bodywork is ONE continuous silhouette subdivided into panels that
 * tile it exactly. Read along the top, rear to front: 248,198 -> 352,194 ->
 * 420,212 (tail) -> 510,204 (seat) -> 570,186 -> 648,190 (tank) -> 738,166 ->
 * 796,180 (fairing) -> 856,214 (nose). Panels share those vertices, so change
 * one and you must change it in both panels that meet there or a seam opens up.
 *
 * The fairing is the deep panel that gives the bike its shape, running from the
 * screen line down to the belly pan at 640,332 the way a fully faired
 * supersport does. Its lower edge is a profile, not a straight line: flat over
 * the tyre (256-266) where the fender crescent sits at radius 111, then
 * plunging to 332 once past the tyre's rear edge at x = 650. That edge is what
 * lets the panel look as deep as it is without its tint spilling over a wheel.
 *
 * Every zone is checked against the wheel circles, where a wheel's upper
 * surface at any x is y = 372 - sqrt(98^2 - (x-cx)^2).
 */

export const AXLE_Y = 372;
export const WHEEL_R = 98;
export const REAR_AXLE_X = 300;
export const FRONT_AXLE_X = 748;
export const GROUND_Y = 470;

/** Full-diagram view box, with even margins around the bike. */
export const FULL_VIEW_BOX = "180 100 740 400";

export const SHAPE = {
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

export interface Zone {
  key: string;
  label: string;
  /** Lots this surface sells as. A side elevation can only show one flank. */
  panelIds: readonly string[];
  shape: { kind: "path"; d: string } | { kind: "ring"; cx: number; cy: number; r: number };
  /**
   * View box for the lot thumbnail: 400x250 (16:10, matching the slot) centred
   * on this surface. Every box is the same size, so each row shows the same
   * amount of bike from a different part of it — enough surrounding bodywork
   * to read as a motorcycle rather than as an abstract shape, which is what a
   * tighter crop gave. Deliberately uniform: varying the zoom per lot made the
   * column look like a mistake.
   */
  focus: string;
}

export const ZONES: readonly Zone[] = [
  {
    key: "upper-fairing",
    label: "Upper fairing",
    panelIds: ["upper-fairing-left", "upper-fairing-right"],
    shape: { kind: "path", d: SHAPE.fairing },
    focus: "518 110 400 250",
  },
  {
    key: "nose",
    label: "Nose number board",
    panelIds: ["nose-number-board"],
    shape: { kind: "path", d: SHAPE.nose },
    focus: "626 95 400 250",
  },
  {
    key: "belly-pan",
    label: "Belly pan",
    panelIds: ["belly-pan-left", "belly-pan-right"],
    shape: { kind: "path", d: SHAPE.bellyPan },
    focus: "348 234 400 250",
  },
  {
    key: "seat-cowl",
    label: "Seat cowl",
    panelIds: ["seat-cowl"],
    shape: { kind: "path", d: SHAPE.tail },
    focus: "138 100 400 250",
  },
  {
    key: "fuel-tank",
    label: "Fuel tank",
    panelIds: ["fuel-tank"],
    shape: { kind: "path", d: SHAPE.tank },
    focus: "382 95 400 250",
  },
  {
    key: "swingarm",
    label: "Swingarm",
    panelIds: ["swingarm"],
    shape: { kind: "path", d: SHAPE.swingarm },
    focus: "224 231 400 250",
  },
  {
    key: "front-fender",
    label: "Front fender",
    panelIds: ["front-fender"],
    shape: { kind: "path", d: SHAPE.frontFender },
    focus: "548 163 400 250",
  },
  {
    key: "windscreen",
    label: "Windscreen strip",
    panelIds: ["windscreen-strip"],
    shape: { kind: "path", d: SHAPE.screen },
    focus: "566 80 400 250",
  },
  {
    /** Shown on the rear wheel: the front rim is crossed by the fork slider. */
    key: "wheel-rims",
    label: "Wheel rim decals",
    panelIds: ["wheel-rims"],
    shape: { kind: "ring", cx: REAR_AXLE_X, cy: AXLE_Y, r: 70 },
    focus: "110 247 400 250",
  },
];

const ZONE_BY_PANEL = new Map<string, Zone>();
for (const zone of ZONES) {
  for (const panelId of zone.panelIds) ZONE_BY_PANEL.set(panelId, zone);
}

export function zoneForPanel(panelId: string): Zone | undefined {
  return ZONE_BY_PANEL.get(panelId);
}

/** Spoke end points for a wheel, offset so the two wheels are not identical. */
export function spokes(cx: number, offsetDegrees: number) {
  return [0, 60, 120].map((deg) => {
    const radians = ((deg + offsetDegrees) * Math.PI) / 180;
    const dx = 58 * Math.cos(radians);
    const dy = 58 * Math.sin(radians);
    return { key: `${cx}-${deg}`, x1: cx + dx, y1: AXLE_Y + dy, x2: cx - dx, y2: AXLE_Y - dy };
  });
}
