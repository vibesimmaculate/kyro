import type { MetadataRoute } from "next";
import { LOCATIONS } from "@/fixtures/locations";
import { absolute } from "@/lib/seo/site";

/**
 * The sitemap.
 *
 * Public pages only. The games wing, the order flow, individual orders and the
 * operator console are all deliberately absent — they are either private, or
 * stateful, or both, and listing them would invite crawlers into pages that
 * cannot mean anything without a session.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: Array<{ path: string; priority: number; frequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, frequency: "daily" },
    { path: "/exchange", priority: 0.9, frequency: "daily" },
    { path: "/fees", priority: 0.9, frequency: "weekly" },
    { path: "/locations", priority: 0.8, frequency: "weekly" },
    { path: "/prices", priority: 0.8, frequency: "hourly" },
    { path: "/how-it-works", priority: 0.7, frequency: "monthly" },
    { path: "/help", priority: 0.7, frequency: "monthly" },
    { path: "/track", priority: 0.5, frequency: "monthly" },
  ];

  return [
    ...pages.map((page) => ({
      url: absolute(page.path),
      lastModified: now,
      changeFrequency: page.frequency,
      priority: page.priority,
    })),
    ...LOCATIONS.map((location) => ({
      url: absolute(`/locations/${location.slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
