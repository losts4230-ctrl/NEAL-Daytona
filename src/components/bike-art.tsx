import {
  AXLE_Y,
  FRONT_AXLE_X,
  GROUND_Y,
  REAR_AXLE_X,
  SHAPE,
  spokes,
} from "./bike-geometry";

/**
 * The static bike elevation: everything that is not interactive.
 *
 * Draw order is load-bearing. Structure and fork go down first, then the
 * bodywork (so the fairing covers the fork's mid-section exactly as it does on
 * the bike), then the wheels, because a tyre passes in front of the bodywork in
 * a real side view. Interactive tints are layered on top by the caller.
 *
 * Rendered by both the full diagram and the lot thumbnails, which is why it
 * takes no props beyond line weight: the crop is chosen by the parent's
 * viewBox, so one drawing serves every framing.
 */
export function BikeArt({ faded = false }: { faded?: boolean }) {
  /** Thumbnails push the bike back so the highlighted panel reads first. */
  const opacity = faded ? 0.75 : 1;

  return (
    <g opacity={opacity}>
      <line
        x1="200"
        y1={GROUND_Y}
        x2="900"
        y2={GROUND_Y}
        stroke="var(--rule-strong)"
        strokeWidth="1"
      />

      {/* Structure, visible between the bodywork masses. */}
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d={SHAPE.engine} fill="#e4e4e8" stroke="var(--rule-strong)" strokeWidth="1" />
        {/* Frame spar, outboard of the engine, headstock to swingarm pivot. */}
        <path d="M 648 236 L 566 248 L 496 266" fill="none" stroke="#d2d2d8" strokeWidth="12" />
        {/* Subframe strut carrying the tail. */}
        <line x1="474" y1="292" x2="424" y2="246" stroke="#d8d8de" strokeWidth="9" />
        {/* Swingarm through to the rear axle; the belly pan hides the pivot. */}
        <line x1="470" y1="350" x2="306" y2="372" stroke="#d2d2d8" strokeWidth="17" />
        {/* Rear shock. */}
        <line x1="446" y1="328" x2="430" y2="256" stroke="#c4c4cc" strokeWidth="8" />
      </g>

      {/* Fork, before the bodywork so the fairing covers the upper tube. */}
      <g strokeLinecap="round">
        <line x1="748" y1="372" x2="699" y2="262" stroke="#c8c8d0" strokeWidth="15" />
        <line x1="701" y1="266" x2="658" y2="170" stroke="#d2d2d8" strokeWidth="12" />
      </g>

      {/* Bodywork masses. */}
      <g stroke="var(--rule-strong)" strokeWidth="1.25" strokeLinejoin="round">
        <path d={SHAPE.tail} fill="#f1f1f3" />
        <path d={SHAPE.seat} fill="#e2e2e6" />
        <path d={SHAPE.tank} fill="#f1f1f3" />
        <path d={SHAPE.fairing} fill="#f1f1f3" />
        <path d={SHAPE.nose} fill="#ebebef" />
        <path d={SHAPE.screen} fill="#e6e6ea" />
        <path d={SHAPE.bellyPan} fill="#f1f1f3" />
        <path d={SHAPE.frontFender} fill="#ebebef" />
        <path d={SHAPE.hugger} fill="#ebebef" />
      </g>

      {/* Wheels, on top. */}
      <g fill="none" strokeLinecap="round">
        <circle cx={REAR_AXLE_X} cy={AXLE_Y} r="87" stroke="#dcdce1" strokeWidth="22" />
        <circle cx={FRONT_AXLE_X} cy={AXLE_Y} r="87" stroke="#dcdce1" strokeWidth="22" />
        <circle cx={REAR_AXLE_X} cy={AXLE_Y} r="98" stroke="var(--rule)" strokeWidth="1" />
        <circle cx={FRONT_AXLE_X} cy={AXLE_Y} r="98" stroke="var(--rule)" strokeWidth="1" />

        <circle cx={REAR_AXLE_X} cy={AXLE_Y} r="62" stroke="#c2c2ca" strokeWidth="5" />
        <circle cx={FRONT_AXLE_X} cy={AXLE_Y} r="62" stroke="#c2c2ca" strokeWidth="5" />
        {[...spokes(REAR_AXLE_X, 0), ...spokes(FRONT_AXLE_X, 25)].map((s) => (
          <line
            key={s.key}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="#c2c2ca"
            strokeWidth="4"
          />
        ))}

        {/* Brake discs. */}
        <circle cx={FRONT_AXLE_X} cy={AXLE_Y} r="44" stroke="#d4d4da" strokeWidth="2" />
        <circle cx={REAR_AXLE_X} cy={AXLE_Y} r="34" stroke="#d4d4da" strokeWidth="2" />
      </g>
    </g>
  );
}
