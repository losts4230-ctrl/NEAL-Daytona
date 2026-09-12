import { AuctionBoard, type BoardData } from "@/components/auction-board";
import { Countdown } from "@/components/countdown";
import { config } from "@/lib/config";
import { extendedCloseAt } from "@/lib/domain/bidding";
import { formatMoney } from "@/lib/domain/money";
import { TOTAL_RESERVE_MINOR } from "@/lib/domain/panels";
import { getRepository } from "@/lib/repo";
import { toPublicLot } from "@/lib/http/serialise";

/**
 * The board is live, so the page is rendered per request rather than cached at
 * build time. State is read straight from the repository instead of the page
 * fetching its own API over HTTP: same data, one fewer network hop, and no
 * dependency on knowing the deployment's own public URL.
 */
export const dynamic = "force-dynamic";

async function loadBoard(): Promise<BoardData> {
  const repository = getRepository();
  const lots = await repository.listLots();

  const latestBidAt = lots.reduce<Date | null>(
    (latest, lot) =>
      lot.lastBidAt && (latest === null || lot.lastBidAt > latest) ? lot.lastBidAt : latest,
    null,
  );

  return {
    lots: lots.map(toPublicLot),
    auction: {
      opensAt: config.auction.opensAt.toISOString(),
      closesAt: config.auction.closesAt.toISOString(),
      effectiveClosesAt: extendedCloseAt(config.auction.closesAt, latestBidAt).toISOString(),
      currency: config.money.currency,
      locale: config.money.locale,
    },
    totals: {
      lotCount: lots.length,
      totalReserveMinor: TOTAL_RESERVE_MINOR,
      committedMinor: lots.reduce((sum, lot) => sum + (lot.currentHighMinor ?? 0), 0),
      bidCount: lots.reduce((sum, lot) => sum + lot.bidCount, 0),
    },
    driver: repository.driver,
  };
}

/** Target specification for the build. Confirmed figures replace these once the bike is bought. */
const SPEC: readonly [string, string][] = [
  ["Model", "Triumph Daytona 675R"],
  ["Engine", "675 cc inline triple, 12 valve"],
  ["Power", "~128 PS @ 12,500 rpm (stock)"],
  ["Front suspension", "Ohlins NIX30 43 mm forks"],
  ["Rear suspension", "Ohlins TTX36 monoshock"],
  ["Brakes", "Brembo monobloc, 308 mm twin discs"],
  ["Kerb weight", "~184 kg wet (stock)"],
  ["Build intent", "Track and club-race prepared"],
];

const STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Pick your surface",
    body: "Every panel on the bike is a separate lot with its own reserve, print area and visibility. Tap a surface on the elevation, or scroll the full list.",
  },
  {
    title: "Place a bid",
    body: "Bids start at the reserve and rise in set increments. You bid an amount, not a card number — nothing is charged, and no payment details are collected.",
  },
  {
    title: "Watch the board",
    body: "Leading bids are public in real time under whatever name you choose. If you are outbid, you will see it on the board and can raise.",
  },
  {
    title: "Winners get wrapped",
    body: "When a lot closes I contact the winning bidder, agree artwork, invoice, and the vinyl goes on before the first session. You get photos of the finished bike.",
  },
];

const FAQ: readonly { q: string; a: readonly string[] }[] = [
  {
    q: "You do not own the bike yet. What am I actually bidding on?",
    a: [
      "Correct, and it is the whole point. The auction is how the build gets funded: the combined reserves cover the purchase and the race prep.",
      "Every bid is conditional. If the bike is not acquired by the date in the terms, every lot is void, nobody is invoiced, and nothing is owed in either direction. You are never exposed to a bike that does not exist.",
    ],
  },
  {
    q: "Is my bid legally binding?",
    a: [
      "No. A bid is a non-binding offer to sponsor. Nothing is charged when you bid and no payment details are taken.",
      "A commitment only exists once a lot closes, I confirm your bid in writing, and you accept an invoice. Until then either side can walk away.",
    ],
  },
  {
    q: "How do the bid increments work?",
    a: [
      "The first bid on a lot can be placed at exactly the reserve. After that each bid must clear the standing bid by a set increment, which scales with the amount so the small lots stay accessible and the hero panels move properly.",
      "The minimum for any lot is always shown on its card and in the bid form, so you never have to guess.",
    ],
  },
  {
    q: "What stops someone sniping a lot in the last second?",
    a: [
      "Any bid inside the final five minutes pushes that lot's close out by five minutes. A lot only ends once five quiet minutes have passed, so winning comes down to the number, not the network latency.",
    ],
  },
  {
    q: "What artwork do you need?",
    a: [
      "Vector is ideal — SVG, AI, EPS or PDF. A high-resolution PNG with a transparent background works for most panels. I will confirm the exact printable dimensions for your lot before anything is cut.",
      "If you do not have usable artwork, say so in the bid notes and we will sort something workable.",
    ],
  },
  {
    q: "How long does the branding stay on?",
    a: [
      "A full season from the date the vinyl is applied, or until the bodywork is replaced after a crash. If a panel is destroyed I will reapply your branding to the replacement at no cost.",
    ],
  },
  {
    q: "Will you take any brand?",
    a: [
      "No. I reserve the right to decline any bid, at any point and without giving a reason. Gambling, adult, tobacco, vaping and political branding will not be accepted, and neither will anything I judge unsuitable for a public paddock.",
      "If your bid is declined you are not invoiced and owe nothing.",
    ],
  },
  {
    q: "What data do you keep about me?",
    a: [
      "Your public name, bid amount and lot are shown on the board. Your contact name, email and phone are private and used only to get in touch about your bid.",
      "The site stores a salted hash of your IP address for abuse investigation, not the address itself. Nothing is sold or shared, and you can ask for your bid to be withdrawn and your details deleted at any time.",
    ],
  },
];

export default async function HomePage() {
  const board = await loadBoard();
  const money = (minor: number) =>
    formatMoney(minor, { currency: board.auction.currency, locale: board.auction.locale });

  return (
    <div className="shell">
      <header className="masthead">
        <div className="wrap masthead__inner">
          <a className="wordmark" href="#top">
            Brand My <span className="wordmark__slash">/</span> Daytona
            <span className="wordmark__model">675R</span>
          </a>
          <nav className="masthead__nav" aria-label="Sections">
            <a href="#auction">Auction</a>
            <a href="#bike">The bike</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="btn btn--primary btn--sm masthead__cta" href="#auction">
            View lots
          </a>
        </div>
      </header>

      <main id="top">
        {/* ---------------------------------------------------------------- */}
        <section className="hero wrap">
          <div className="hero__grid">
            <div>
              <p className="hero__status">
                <span className="pulse" aria-hidden="true" />
                {board.totals.lotCount} lots &middot; live sponsorship auction
              </p>

              <h1 className="hero__title">
                Put your brand
                <em>on a race bike</em>
              </h1>

              <p className="hero__copy">
                I am building a Triumph Daytona 675R for track and club racing. Every panel on it is
                for sale, one surface at a time, to the highest bidder. The bike is not bought yet
                &mdash; this auction is what buys it.
              </p>

              <div className="hero__actions">
                <a className="btn btn--primary" href="#auction">
                  Browse the lots
                </a>
                <a className="btn" href="#how">
                  How bidding works
                </a>
              </div>

              <div className="metrics">
                <div className="metric">
                  <p className="metric__label">Lots open</p>
                  <p className="metric__value num">
                    {board.lots.filter((lot) => lot.status === "open").length}
                  </p>
                </div>
                <div className="metric">
                  <p className="metric__label">From</p>
                  <p className="metric__value num">
                    {money(Math.min(...board.lots.map((lot) => lot.reserveMinor)))}
                  </p>
                </div>
                <div className="metric">
                  <p className="metric__label">Print area</p>
                  <p className="metric__value num">
                    {board.lots
                      .reduce((sum, lot) => sum + lot.areaCm2, 0)
                      .toLocaleString(board.auction.locale)}{" "}
                    cm<sup>2</sup>
                  </p>
                </div>
                <div className="metric">
                  <p className="metric__label">Bids placed</p>
                  <p className="metric__value metric__value--ember num">{board.totals.bidCount}</p>
                </div>
              </div>
            </div>

            {/* The countdown carries the urgency, so it belongs in the hero
                rather than buried in the auction section. */}
            <div style={{ display: "grid", gap: "1rem" }}>
              <Countdown
                opensAt={board.auction.opensAt}
                closesAt={board.auction.effectiveClosesAt}
              />
              <p className="notice">
                <span aria-hidden="true">&#9432;</span>
                <span>
                  <strong>Bids are offers, not payments.</strong> No card details are taken and
                  nothing is charged when you bid. Every lot is void if the bike is not acquired
                  &mdash; the full terms are linked from the bid form.
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="section wrap" id="auction">
          <p className="eyebrow">
            <span className="eyebrow__index">01</span> The auction
          </p>
          <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", textTransform: "uppercase" }}>
            Every panel is a lot
          </h2>
          <p className="lede" style={{ marginTop: "1rem", marginBottom: "2.5rem" }}>
            Tap a surface on the elevation to jump to its lots. Left and right sides are sold
            separately &mdash; take one flank or take the whole bike.
          </p>

          <AuctionBoard initial={board} />
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="section wrap" id="bike">
          <p className="eyebrow">
            <span className="eyebrow__index">02</span> The bike
          </p>
          <div className="split">
            <div>
              <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", textTransform: "uppercase" }}>
                Why the 675R
              </h2>
              <p className="lede" style={{ marginTop: "1rem" }}>
                The Daytona 675R is the enthusiast&apos;s supersport: a 675 cc triple with a sound
                nothing else makes, Ohlins at both ends and Brembo monoblocs as standard. It is the
                bike people walk across a paddock to look at &mdash; which is exactly what you want
                your logo sitting on.
              </p>
              <p className="lede" style={{ marginTop: "1rem" }}>
                Bodywork is large, flat and uninterrupted, so panels take a full logo rather than a
                compromised sticker. Gold forks and a single-sided look give the details real
                presence in photographs.
              </p>
              <p className="notice" style={{ marginTop: "1.75rem" }}>
                <span aria-hidden="true">&#9432;</span>
                <span>
                  Figures below are the <strong>target specification</strong>. The bike has not been
                  purchased yet; confirmed numbers for the actual machine replace these as soon as
                  it is.
                </span>
              </p>
            </div>

            <div className="spec">
              {SPEC.map(([key, value]) => (
                <div className="spec__row" key={key}>
                  <span className="spec__key">{key}</span>
                  <span className="spec__value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="section wrap" id="how">
          <p className="eyebrow">
            <span className="eyebrow__index">03</span> How it works
          </p>
          <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", textTransform: "uppercase" }}>
            Four steps, no card details
          </h2>
          <div className="steps" style={{ marginTop: "2.5rem" }}>
            {STEPS.map((step, index) => (
              <div className="step" key={step.title}>
                <p className="step__index">
                  {String(index + 1).padStart(2, "0")} &mdash;
                </p>
                <h3 className="step__title">{step.title}</h3>
                <p className="step__body">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="section wrap" id="faq">
          <p className="eyebrow">
            <span className="eyebrow__index">04</span> Questions
          </p>
          <div className="split">
            <div>
              <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", textTransform: "uppercase" }}>
                Straight answers
              </h2>
              <p className="lede" style={{ marginTop: "1rem" }}>
                Anything not covered here, ask before you bid rather than after. Contact details are
                in the footer.
              </p>
            </div>
            <div className="faq">
              {FAQ.map((item) => (
                <details className="faq__item" key={item.q}>
                  <summary className="faq__q">{item.q}</summary>
                  <div className="faq__a">
                    {item.a.map((paragraph) => (
                      <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer__grid">
            <div>
              <p className="wordmark" style={{ marginBottom: "0.75rem" }}>
                Brand My <span className="wordmark__slash">/</span> Daytona
              </p>
              <p>A privately run sponsorship auction. Not affiliated with Triumph Motorcycles Ltd.</p>
            </div>
            <nav className="footer__links" aria-label="Footer">
              <a href="#auction">Auction</a>
              <a href="#bike">The bike</a>
              <a href="#faq">FAQ</a>
              <a href="/terms">Bidding terms</a>
            </nav>
          </div>
          <p className="footer__legal">
            Bids placed on this site are non-binding offers to sponsor and are not payments. No card
            or bank details are collected. All lots are conditional on the motorcycle being acquired
            and are void if it is not. The organiser may decline any bid without giving a reason.
            &ldquo;Triumph&rdquo; and &ldquo;Daytona&rdquo; are trademarks of Triumph Motorcycles
            Ltd, used here only to describe the motorcycle.
          </p>
        </div>
      </footer>
    </div>
  );
}
