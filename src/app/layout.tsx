import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kyro.example"),
  title: {
    default: "KYRO — Cash to crypto. Crypto to cash.",
    template: "%s — KYRO",
  },
  description:
    "Exchange cash for crypto, or crypto for cash, at a counter near you. One clear 4% fee, shown before you commit.",
  openGraph: {
    type: "website",
    siteName: "KYRO",
    title: "KYRO — Cash to crypto. Crypto to cash.",
    description:
      "Exchange cash for crypto, or crypto for cash, at a counter near you. One clear 4% fee, shown before you commit.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  colorScheme: "light",
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-[6px] focus:border focus:border-ink focus:bg-white focus:px-4 focus:py-2.5 focus:text-small focus:font-medium"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
