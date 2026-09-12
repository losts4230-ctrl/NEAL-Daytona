import type { Metadata } from "next";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = {
  title: "Bidding terms",
  description: "The terms that apply to bids placed in the Daytona 675R sponsorship auction.",
};

/**
 * Plain-language terms.
 *
 * These are a starting point written to match how the auction actually behaves,
 * not legal advice. Have them reviewed before the auction opens — see the
 * pre-launch checklist in README.md.
 */
const CLAUSES: readonly { heading: string; body: readonly string[] }[] = [
  {
    heading: "1. What a bid is",
    body: [
      "A bid is a non-binding offer to sponsor a specified surface on the motorcycle for the stated amount. It is not a payment, a contract, or a deposit.",
      "No card, bank or payment details are collected at any point during bidding.",
    ],
  },
  {
    heading: "2. Conditional on the motorcycle being acquired",
    body: [
      "At the time of publication the motorcycle has not been purchased. Every lot is conditional on the organiser acquiring a Triumph Daytona 675R.",
      "If the motorcycle is not acquired within 90 days of the auction closing, all lots are void. No invoice is issued, no payment is owed, and no obligation arises on either side.",
    ],
  },
  {
    heading: "3. How the price works",
    body: [
      "Each surface is auctioned independently. Every lot starts at zero and each accepted bid raises that lot by exactly one increment, so a lot's price is always its number of bids multiplied by the increment. There are no reserve prices and no hidden minimums.",
      "The price shown on the bid button is the price you are agreeing to. If another bidder is accepted first, your bid is rejected and you are told the new price rather than being committed to it.",
      "A bid placed within five minutes of a lot's scheduled close extends that lot by five minutes from the time of the bid.",
      "The highest bid at close is the leading bid. It becomes a won lot only when the organiser confirms it in writing.",
    ],
  },
  {
    heading: "4. Payment",
    body: [
      "The organiser will contact the leading bidder by email after the lot closes and issue an invoice. Payment is due on the terms stated on that invoice.",
      "Branding is applied after payment clears. If payment is not received by the invoice due date the organiser may withdraw the lot and offer it to the next highest bidder.",
    ],
  },
  {
    heading: "5. Right to decline",
    body: [
      "The organiser may decline any bid or withdraw any lot at any time, without giving a reason. A declined bidder is not invoiced and owes nothing.",
      "Gambling, adult, tobacco, vaping and political branding will not be accepted, and nor will any branding the organiser judges unsuitable for a public paddock.",
    ],
  },
  {
    heading: "6. Artwork and application",
    body: [
      "The sponsor supplies artwork in a usable format. Vector formats are preferred; the organiser will confirm printable dimensions for the specific lot before production.",
      "The organiser decides final placement within the surface purchased, and is responsible for printing and applying the vinyl.",
      "The sponsor confirms they hold the rights to use the artwork supplied and indemnifies the organiser against any third-party claim arising from it.",
    ],
  },
  {
    heading: "7. Duration and damage",
    body: [
      "Branding remains on the purchased surface for one full season from the date of application, or until that bodywork is replaced.",
      "If a panel is damaged or replaced, the organiser will reapply the sponsor's branding to the replacement panel at no additional cost.",
      "The organiser gives no guarantee of any particular number of events, race entries, finishes, media appearances or impressions.",
    ],
  },
  {
    heading: "8. Data protection",
    body: [
      "The public name submitted with a bid, the web address given with it, the bid amount and the lot are published on the site, and remain visible in that lot's bid history after the bid is superseded. Contact name, email address and phone number are private and used only to administer the auction.",
      "Site icons shown next to bidder names are fetched by this website's server, not by other visitors' browsers, so viewing the auction does not disclose the viewer to any third party.",
      "A salted hash of the bidder's IP address is stored for abuse investigation; the address itself is not retained. Personal data is not sold or shared with third parties.",
      "A bidder may request withdrawal of their bid and deletion of their personal data at any time by contacting the organiser.",
    ],
  },
  {
    heading: "9. No affiliation",
    body: [
      "This is a privately run auction. It is not affiliated with, endorsed by or connected to Triumph Motorcycles Ltd, any racing series, or any circuit.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div>
      <header className="masthead">
        <div className="wrap masthead__inner">
          <a className="wordmark" href="/">
            Brand my Daytona 675R
          </a>
          <nav className="masthead__nav" aria-label="Sections">
            <a className="btn btn--solid" href="/#auction">
              Back to the auction
            </a>
          </nav>
        </div>
      </header>

      <main className="wrap section">
        <p className="eyebrow eyebrow--soft">Bidding terms</p>
        <h1 style={{ fontSize: "clamp(1.9rem, 5vw, 3.25rem)", marginTop: "1rem" }}>
          Terms of bidding
        </h1>
        <p className="lede" style={{ marginTop: "1rem" }}>
          These terms apply to every bid placed on this site. Auction currency is{" "}
          {config.money.currency}, and the bid increment is{" "}
          {formatMoney(config.auction.incrementMinor, config.money)}.
        </p>

        <div style={{ maxWidth: "68ch", marginTop: "3rem", display: "grid", gap: "2rem" }}>
          {CLAUSES.map((clause) => (
            <section key={clause.heading}>
              <h2 style={{ fontSize: "1.05rem", letterSpacing: 0 }}>{clause.heading}</h2>
              {clause.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  style={{ marginTop: "0.7rem", color: "var(--text-dim)", fontSize: "0.92rem" }}
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p>
            Auction closes {config.auction.closesAt.toISOString().slice(0, 10)}. Questions before
            you bid? Contact the organiser.
          </p>
        </div>
      </footer>
    </div>
  );
}
