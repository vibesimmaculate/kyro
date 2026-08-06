import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@scure/btc-signer"],

  /**
   * Origins the dev server will serve its own JavaScript to.
   *
   * Without this, `next dev` blocks every `/_next/static/**` request that does
   * not arrive on `localhost` — including requests to the Network address the
   * dev server itself prints on startup. The failure is quiet and total: the
   * HTML renders, every chunk 403s, and the site is dead in the browser with no
   * error on screen. Opening it on a phone, or on `127.0.0.1`, or from another
   * machine on the LAN all hit it.
   *
   * These are development-only and have no bearing on production, where assets
   * are served normally.
   */
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    // Any private-range address, so the printed Network URL and a phone on the
    // same wifi both work without editing this file every time DHCP moves.
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
