import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_NAME = "Brand My Daytona";
const TAGLINE =
  "Eleven sponsorship areas on a Triumph Daytona 675R race build. Every auction starts at zero.";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — Sponsorship Auction`,
    template: `%s — ${SITE_NAME}`,
  },
  description: TAGLINE,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Sponsorship Auction`,
    description: TAGLINE,
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: TAGLINE },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
