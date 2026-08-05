import { ImageResponse } from "next/og";
import { SITE } from "@/lib/seo/site";

/**
 * The share card.
 *
 * Generated rather than designed in a file, so it can never drift from the
 * brand: same paper, same ink, same blue square, same headline the page opens
 * with. Set in the system's own type at a size that survives being shown as a
 * thumbnail in a chat window.
 */

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F4F1EA",
          color: "#111315",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.045em" }}>
            KYRO
          </span>
          <span style={{ width: 12, height: 12, background: "#1E4ED8" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 92,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              maxWidth: 960,
            }}
          >
            Cash to crypto.
          </span>
          <span
            style={{
              fontSize: 92,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              maxWidth: 960,
            }}
          >
            Crypto to cash.
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid #D7D2C8",
            paddingTop: 28,
          }}
        >
          <span style={{ fontSize: 26, color: "#62666B", maxWidth: 620 }}>
            One clear fee of 4%, shown in full before you commit.
          </span>
          <span style={{ fontSize: 22, color: "#656970", letterSpacing: "0.11em" }}>
            SARAJEVO · BELGRADE · ZAGREB
          </span>
        </div>
      </div>
    ),
    size,
  );
}
