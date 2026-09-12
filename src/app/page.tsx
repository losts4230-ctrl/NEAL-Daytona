import { AuctionBoard, type BoardData } from "@/components/auction-board";
import { FundingBar } from "@/components/funding-bar";
import { config } from "@/lib/config";
import { bidIncrement, extendedCloseAt, fundingPercent } from "@/lib/domain/bidding";
import { formatMoney } from "@/lib/domain/money";
import { PANEL_CATALOGUE, TOTAL_AREA_CM2 } from "@/lib/domain/panels";
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

  /**
   * Raised is the sum of the *leading* bids. An outbid bid is never invoiced,
   * so counting every bid ever placed would overstate funding.
   */
  const raisedMinor = lots.reduce((sum, lot) => sum + (lot.currentHighMinor ?? 0), 0);

  return {
    lots: lots.map(toPublicLot),
    auction: {
      opensAt: config.auction.opensAt.toISOString(),
      closesAt: config.auction.closesAt.toISOString(),
      effectiveClosesAt: extendedCloseAt(config.auction.closesAt, latestBidAt).toISOString(),
      currency: config.money.currency,
      locale: config.money.locale,
      incrementMinor: bidIncrement(),
    },
    funding: {
      raisedMinor,
      targetMinor: config.auction.targetMinor,
      percent: Math.round(fundingPercent(raisedMinor, config.auction.targetMinor)),
    },
    totals: {
      lotCount: lots.length,
      totalAreaCm2: TOTAL_AREA_CM2,
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

export default async function HomePage() {
  const board = await loadBoard();
  const money = (minor: number) =>
    formatMoney(minor, { currency: board.auction.currency, locale: board.auction.locale });

  const increment = money(board.auction.incrementMinor);

  const steps: readonly { title: string; body: string }[] = [
    {
      title: "Pick a surface",
      body: `Eleven surfaces, each its own auction. Tap a panel on the elevation or scroll the list to see what every one of them is currently going for.`,
    },
    {
      title: "Take the price",
      body: `Every lot starts at zero and each bid raises it by exactly ${increment}. There is no amount to type — you either take the next price or you do not.`,
    },
    {
      title: "Hold it, or get outbid",
      body: "Your name and site icon sit against the lot while you lead. If someone outbids you it shows on the board and you can take it back.",
    },
    {
      title: "Winners get wrapped",
      body: "When a lot closes I confirm in writing, agree artwork and invoice. The vinyl goes on before the first session and you get photos of the finished bike.",
    },
  ];

  const faq: readonly { q: string; a: readonly string[] }[] = [
    {
      q: "You do not own the bike yet. What am I actually bidding on?",
      a: [
        `Correct, and it is the whole point. The auction is how the build gets funded — the bar at the top is real money pledged against a ${money(
          board.funding.targetMinor,
        )} purchase target.`,
        "Every bid is conditional. If the bike is not acquired within 90 days of the auction closing, every lot is void, nobody is invoiced, and nothing is owed in either direction. You are never exposed to a bike that does not exist.",
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
      q: "How does the pricing work?",
      a: [
        `Every surface starts at zero. Each bid raises that lot by exactly ${increment}, so a lot's price is always its bid count times ${increment}. The next price is shown on the button before you commit to it.`,
        "There are no reserves and no hidden minimums. What a surface is worth is decided entirely by how many people want it.",
      ],
    },
    {
      q: "What if someone bids at the same moment as me?",
      a: [
        "One of you gets it, and it is never both. The price you were shown is sent with your bid; if it moved in between, you are told the new price and asked again rather than being quietly charged more than you agreed to.",
      ],
    },
    {
      q: "What stops someone sniping a lot in the last second?",
      a: [
        "Any bid inside the final five minutes pushes that lot's close out by five minutes. A lot only ends once five quiet minutes have passed, so winning comes down to the number, not the network latency.",
      ],
    },
    {
      q: "Why do you want my website?",
      a: [
        "So your icon appears next to your name on the board, which is most of the point of sponsoring something publicly. It is optional — leave it out and you get a plain monogram instead.",
        "Icons are fetched by this server, not by other visitors' browsers, so looking at the board does not report you to anyone.",
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
      q: "Will you take any brand?",
      a: [
        "No. I reserve the right to decline any bid, at any point and without giving a reason. Gambling, adult, tobacco, vaping and political branding will not be accepted, and neither will anything I judge unsuitable for a public paddock.",
        "If your bid is declined you are not invoiced and owe nothing.",
      ],
    },
    {
      q: "What data do you keep about me?",
      a: [
        "Your public name, website, bid amount and lot are shown on the board. Your contact name, email and phone are private and used only to get in touch about your bid.",
        "The site stores a salted hash of your IP address for abuse investigation, not the address itself. Nothing is sold or shared, and you can ask for your bid to be withdrawn and your details deleted at any time.",
      ],
    },
  ];

  return (
    <div>
      <header className="masthead">
        <div className="wrap masthead__inner">
          <a className="wordmark" href="#top">
            Brand my Daytona 675R
          </a>
          <nav className="masthead__nav" aria-label="Sections">
            <a className="btn btn--solid" href="#auction">
              Bid areas
            </a>
            <a className="btn" href="#how">
              How it works
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* ---------------------------------------------------------------- */}
        <section className="hero wrap">
          <p className="eyebrow">
            <span className="livedot" aria-hidden="true" />A real, live auction
          </p>

          <h1 className="hero__title">
            Your brand on
            <br />
            my Daytona 675R.
          </h1>

          <p className="hero__sub">
            {board.totals.lotCount} sponsorship areas. Every auction starts at zero. Each new bid
            raises the price by {increment}.
          </p>

          <FundingBar
            raisedMinor={board.funding.raisedMinor}
            targetMinor={board.funding.targetMinor}
            percent={board.funding.percent}
            currency={board.auction.currency}
            locale={board.auction.locale}
            opensAt={board.auction.opensAt}
            closesAt={board.auction.effectiveClosesAt}
          />

          <p className="notice" style={{ maxWidth: "52rem", margin: "2rem auto 0" }}>
            <span aria-hidden="true">&#9432;</span>
            <span>
              <strong>Bids are offers, not payments.</strong> No card details are taken and nothing
              is charged when you bid. The bike is not bought yet, and every lot is void if it is
              not acquired &mdash; full terms are linked from the bid form.
            </span>
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="section section--ruled wrap" id="auction">
          <p className="eyebrow eyebrow--soft" style={{ marginBottom: "1.5rem" }}>
            Live auction
          </p>
          <AuctionBoard initial={board} historyLength={config.auction.historyLength} />
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="section section--ruled wrap" id="how">
          <p className="eyebrow eyebrow--soft" style={{ marginBottom: "1.5rem" }}>
            How it works
          </p>
          <h2 style={{ fontSize: "clamp(1.9rem, 4.5vw, 3.25rem)", marginBottom: "2.5rem" }}>
            Four steps, no card details.
          </h2>
          <div className="steps">
            {steps.map((step, index) => (
              <div className="step" key={step.title}>
                <p className="step__index">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="step__title">{step.title}</h3>
                <p className="step__body">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="section section--ruled wrap" id="bike">
          <p className="eyebrow eyebrow--soft" style={{ marginBottom: "1.5rem" }}>
            The bike
          </p>
          <div className="split">
            <div>
              <h2 style={{ fontSize: "clamp(1.9rem, 4.5vw, 3.25rem)" }}>Why the 675R.</h2>
              <p className="lede" style={{ marginTop: "1.25rem" }}>
                The Daytona 675R is the enthusiast&apos;s supersport: a 675 cc triple with a sound
                nothing else makes, Ohlins at both ends and Brembo monoblocs as standard. It is the
                bike people walk across a paddock to look at &mdash; which is exactly what you want
                your logo sitting on.
              </p>
              <p className="lede" style={{ marginTop: "1rem" }}>
                Bodywork is large, flat and uninterrupted, so a panel takes a full logo rather than
                a compromised sticker. {TOTAL_AREA_CM2.toLocaleString(board.auction.locale)} cm
                <sup>2</sup> of it is for sale across {PANEL_CATALOGUE.length} lots.
              </p>
              <p className="notice" style={{ marginTop: "1.75rem" }}>
                <span aria-hidden="true">&#9432;</span>
                <span>
                  Figures here are the <strong>target specification</strong>. The bike has not been
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
        <section className="section section--ruled wrap" id="faq">
          <p className="eyebrow eyebrow--soft" style={{ marginBottom: "1.5rem" }}>
            Questions
          </p>
          <div className="split">
            <div>
              <h2 style={{ fontSize: "clamp(1.9rem, 4.5vw, 3.25rem)" }}>Straight answers.</h2>
              <p className="lede" style={{ marginTop: "1.25rem" }}>
                Anything not covered here, ask before you bid rather than after.
              </p>
            </div>
            <div className="faq">
              {faq.map((item) => (
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
              <p className="wordmark" style={{ marginBottom: "0.6rem" }}>
                Brand my Daytona 675R
              </p>
              <p>A privately run sponsorship auction.</p>
            </div>
            <nav className="footer__links" aria-label="Footer">
              <a href="#auction">Bid areas</a>
              <a href="#how">How it works</a>
              <a href="#bike">The bike</a>
              <a href="#faq">FAQ</a>
              <a href="/terms">Bidding terms</a>
            </nav>
          </div>
          <p className="footer__legal">
            Bids placed on this site are non-binding offers to sponsor and are not payments. No card
            or bank details are collected. All lots are conditional on the motorcycle being acquired
            and are void if it is not. The organiser may decline any bid without giving a reason.
            Not affiliated with Triumph Motorcycles Ltd; &ldquo;Triumph&rdquo; and
            &ldquo;Daytona&rdquo; are their trademarks, used here only to describe the motorcycle.
          </p>
        </div>
      </footer>
    </div>
  );
}
