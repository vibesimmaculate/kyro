export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Shown in the mobile sheet, where there is room to say more. */
  readonly hint?: string;
}

/** The counter. Five links, in the order someone actually needs them. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/exchange", label: "Exchange", hint: "Start a cash ↔ crypto order" },
  { href: "/locations", label: "Locations", hint: "Where to collect or pay" },
  { href: "/how-it-works", label: "How it works", hint: "Three steps, start to finish" },
  { href: "/fees", label: "Fees", hint: "One rate, worked through" },
  { href: "/help", label: "Help", hint: "Questions people actually ask" },
];

export const FOOTER_NAV: readonly { title: string; items: readonly NavItem[] }[] = [
  {
    title: "Exchange",
    items: [
      { href: "/exchange", label: "Start an exchange" },
      { href: "/track", label: "Track an order" },
      { href: "/fees", label: "Fees" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Locations",
    items: [
      { href: "/locations", label: "All locations" },
      { href: "/locations?country=BA", label: "Bosnia and Herzegovina" },
      { href: "/locations?country=RS", label: "Serbia" },
      { href: "/locations?country=HR", label: "Croatia" },
    ],
  },
  {
    title: "Help",
    items: [
      { href: "/help", label: "Questions" },
      { href: "/help#bring", label: "What to bring" },
      { href: "/help#wallet", label: "Wallet and network" },
      { href: "/help#contact", label: "Contact" },
    ],
  },
];

/** Assets are listed rather than shown as a logo wall. */
export const SUPPORTED_ASSET_LINKS: readonly NavItem[] = [
  { href: "/exchange?asset=BTC", label: "Bitcoin" },
  { href: "/exchange?asset=ETH", label: "Ethereum" },
  { href: "/exchange?asset=USDT", label: "Tether" },
  { href: "/exchange?asset=USDC", label: "USD Coin" },
  { href: "/exchange?asset=SOL", label: "Solana" },
];

export function isActivePath(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
