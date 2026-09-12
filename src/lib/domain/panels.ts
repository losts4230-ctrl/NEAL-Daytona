import { type Minor, toMinor } from "./money";

/**
 * Commercial tier of a surface. Tier drives reserve price and the order lots
 * are presented in; it is deliberately coarse so the catalogue stays legible.
 */
export type PanelTier = "hero" | "premium" | "standard";

export type PanelStatus = "open" | "reserved" | "sold" | "withdrawn";

/**
 * A branding surface on the bike. `id` is the stable business key: it appears in
 * URLs, in the SVG diagram, and in the database, so it must never be renamed
 * once bids exist against it.
 */
export interface PanelDefinition {
  id: string;
  name: string;
  location: string;
  tier: PanelTier;
  /** Usable print area in square centimetres, measured on the fairing. */
  areaCm2: number;
  reserveMinor: Minor;
  /** Shown on the lot card so a bidder knows what they are actually buying. */
  notes: string;
  sortOrder: number;
}

function panel(
  id: string,
  name: string,
  location: string,
  tier: PanelTier,
  areaCm2: number,
  reserveMajor: number,
  notes: string,
  sortOrder: number,
): PanelDefinition {
  return {
    id,
    name,
    location,
    tier,
    areaCm2,
    reserveMinor: toMinor(reserveMajor),
    notes,
    sortOrder,
  };
}

/**
 * The lot catalogue for the Daytona 675R race build.
 *
 * Areas are the usable flat print area on OEM bodywork, not the full panel
 * dimension — curvature and mounting hardware eat roughly 15% of every surface.
 * Reserves are set by visibility: on-camera front three-quarter shots dominate
 * broadcast and social, so the upper fairing and belly pan carry the premium.
 */
export const PANEL_CATALOGUE: readonly PanelDefinition[] = [
  panel(
    "upper-fairing-left",
    "Upper Fairing — Left",
    "Left flank, above the belly pan",
    "hero",
    620,
    900,
    "The headline surface. Visible in every left-hand corner shot and paddock photo.",
    10,
  ),
  panel(
    "upper-fairing-right",
    "Upper Fairing — Right",
    "Right flank, above the belly pan",
    "hero",
    620,
    900,
    "Mirror of the left hero panel. Faces the camera on right-hand apexes.",
    20,
  ),
  panel(
    "nose-number-board",
    "Nose Number Board",
    "Front fairing, above the headlight blank",
    "hero",
    300,
    750,
    "Head-on shots and grid line-ups. Shares the panel with the race number.",
    30,
  ),
  panel(
    "belly-pan-left",
    "Belly Pan — Left",
    "Lower left fairing, below the frame rail",
    "premium",
    480,
    520,
    "Low and long. Reads cleanly at speed and in trackside panning shots.",
    40,
  ),
  panel(
    "belly-pan-right",
    "Belly Pan — Right",
    "Lower right fairing, below the frame rail",
    "premium",
    480,
    520,
    "Mirror of the left belly pan.",
    50,
  ),
  panel(
    "seat-cowl-left",
    "Seat Cowl — Left",
    "Tail unit, left side",
    "premium",
    340,
    420,
    "Rear three-quarter and following-camera angles.",
    60,
  ),
  panel(
    "seat-cowl-right",
    "Seat Cowl — Right",
    "Tail unit, right side",
    "premium",
    340,
    420,
    "Mirror of the left seat cowl.",
    70,
  ),
  panel(
    "tank-left",
    "Tank — Left",
    "Fuel tank, left shoulder",
    "premium",
    260,
    380,
    "Rider-eye and pit-lane detail shots. Partly covered when the rider is tucked.",
    80,
  ),
  panel(
    "tank-right",
    "Tank — Right",
    "Fuel tank, right shoulder",
    "premium",
    260,
    380,
    "Mirror of the left tank panel.",
    90,
  ),
  panel(
    "front-fender",
    "Front Fender",
    "Front mudguard, both sides",
    "standard",
    180,
    260,
    "Sold as a matched pair of decals, one per side.",
    100,
  ),
  panel(
    "windscreen-strip",
    "Windscreen Strip",
    "Double-bubble screen, upper edge",
    "standard",
    150,
    240,
    "Classic race-screen banner. Applied to the inside face so it survives cleaning.",
    110,
  ),
  panel(
    "swingarm-left",
    "Swingarm — Left",
    "Left swingarm spar",
    "standard",
    220,
    200,
    "Narrow and long. Best suited to a wordmark rather than a full logo.",
    120,
  ),
  panel(
    "swingarm-right",
    "Swingarm — Right",
    "Right swingarm spar",
    "standard",
    220,
    200,
    "Mirror of the left swingarm.",
    130,
  ),
  panel(
    "tail-hugger",
    "Rear Hugger",
    "Rear wheel hugger",
    "standard",
    120,
    140,
    "Small surface, high frequency in rear-wheel action shots.",
    140,
  ),
  panel(
    "fork-lowers",
    "Fork Lowers",
    "Ohlins NIX30 fork sliders",
    "standard",
    90,
    160,
    "Sold as a pair. The gold fork is one of the 675R's signature details.",
    150,
  ),
  panel(
    "wheel-rims",
    "Wheel Rim Decals",
    "Both rims, inner lip",
    "standard",
    110,
    150,
    "Sold as a full set of four arcs. Very high visibility in motion.",
    160,
  ),
];

const BY_ID = new Map(PANEL_CATALOGUE.map((p) => [p.id, p]));

export function findPanel(id: string): PanelDefinition | undefined {
  return BY_ID.get(id);
}

export const TIER_LABEL: Record<PanelTier, string> = {
  hero: "Hero",
  premium: "Premium",
  standard: "Standard",
};

/** Sum of all reserves — the floor the build needs the auction to clear. */
export const TOTAL_RESERVE_MINOR: Minor = PANEL_CATALOGUE.reduce(
  (sum, p) => sum + p.reserveMinor,
  0,
);
