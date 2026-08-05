import type { MetadataRoute } from "next";
import { absolute } from "@/lib/seo/site";

/**
 * robots.txt.
 *
 * The exchange is public and should be indexed. Everything that is private,
 * per-session or regulated is closed off — orders because they are somebody's
 * financial record, the flow because a half-finished order is meaningless out
 * of context, the operator console because it is staff-only, and the games
 * because indexing gambling pages into markets KYRO has no licence for is
 * exactly the mistake that gets an operator fined.
 *
 * AI crawlers are allowed on the public pages on purpose. If an assistant is
 * going to answer "what does KYRO charge", it should read the page that says
 * 4% rather than guess.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/orders/", "/exchange/details", "/exchange/wallet", "/exchange/location", "/exchange/review", "/operator", "/games", "/sign-in", "/sign-up", "/api/"];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
    sitemap: absolute("/sitemap.xml"),
    host: absolute("/"),
  };
}
