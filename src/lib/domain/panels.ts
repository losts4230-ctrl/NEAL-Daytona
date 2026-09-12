/**
 * The lot catalogue for the Daytona 675R race build.
 *
 * Eleven surfaces, presented in descending order of visibility, because the
 * ordering *is* the pricing signal: there are no per-lot reserves. Every lot
 * starts at zero and rises by one flat increment per bid, so what a surface is
 * worth is discovered entirely by competition. Position 01 is the panel the
 * camera cannot avoid.
 *
 * Areas are the usable flat print area on OEM bodywork, not the full panel
 * dimension — curvature and mounting hardware eat roughly 15% of every surface.
 * Where a lot covers both flanks it is sold as a matched pair and the area is
 * the combined figure.
 */
export type PanelStatus = "open" | "reserved" | "sold" | "withdrawn";

/**
 * A branding surface on the bike. `id` is the stable business key: it appears in
 * URLs, in the SVG diagram, and in the database, so it must never be renamed
 * once bids exist against it.
 */
export interface PanelDefinition {
  id: string;
  name: string;
  /** One line on why this surface is worth having. Shown under the name. */
  descriptor: string;
  /** Usable print area in square centimetres. */
  areaCm2: number;
  /** True when the lot covers both flanks as a matched pair. */
  bothSides: boolean;
  sortOrder: number;
}

function panel(
  id: string,
  name: string,
  descriptor: string,
  areaCm2: number,
  bothSides: boolean,
  sortOrder: number,
): PanelDefinition {
  return { id, name, descriptor, areaCm2, bothSides, sortOrder };
}

export const PANEL_CATALOGUE: readonly PanelDefinition[] = [
  panel("upper-fairing-left", "Upper fairing — left", "The headline placement", 620, false, 1),
  panel("upper-fairing-right", "Upper fairing — right", "Full side visibility", 620, false, 2),
  panel("nose-number-board", "Nose number board", "Front and centre", 300, false, 3),
  panel("belly-pan-left", "Belly pan — left", "Low and forward", 480, false, 4),
  panel("belly-pan-right", "Belly pan — right", "The return side", 480, false, 5),
  panel("seat-cowl", "Seat cowl", "The chasing view", 680, true, 6),
  panel("fuel-tank", "Fuel tank", "Rider's eye and pit lane", 520, true, 7),
  panel("swingarm", "Swingarm", "Long, low and unmissable", 440, true, 8),
  panel("front-fender", "Front fender", "Leads every frame", 180, true, 9),
  panel("windscreen-strip", "Windscreen strip", "The classic race banner", 150, false, 10),
  panel("wheel-rims", "Wheel rim decals", "Spins in every action shot", 110, true, 11),
];

const BY_ID = new Map(PANEL_CATALOGUE.map((p) => [p.id, p]));

export function findPanel(id: string): PanelDefinition | undefined {
  return BY_ID.get(id);
}

/** Combined print area across every lot, for the headline stat. */
export const TOTAL_AREA_CM2 = PANEL_CATALOGUE.reduce((sum, p) => sum + p.areaCm2, 0);
