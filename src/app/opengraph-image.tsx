import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Social share preview (Facebook, WhatsApp, Messenger, X) for every page that doesn't define its own
export const alt = "Timeless Ties Events & Decor — Wedding & Event Decoration in Kathmandu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const photo = await readFile(join(process.cwd(), "public/images/hero-modern-mandap-hills.jpg"), "base64");

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#faf7f2" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "58%",
            padding: "70px",
            color: "#1c1917",
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#7d5f33", textTransform: "uppercase" }}>
            Events Décor · Kathmandu
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 1, marginTop: 28 }}>
            <span>Timeless</span>
            <span style={{ color: "#7d5f33", fontStyle: "italic" }}>Tie</span>
          </div>
          <div style={{ fontSize: 30, marginTop: 30, color: "#6b6058", lineHeight: 1.35 }}>
            Elegant wedding, event &amp; celebration décor in Kathmandu, Nepal.
          </div>
          <div style={{ fontSize: 24, marginTop: 36, color: "#1c1917" }}>timelesstieevents.com.np</div>
        </div>
        <div style={{ display: "flex", width: "42%", padding: "40px 40px 40px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${photo}`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "260px 260px 24px 24px" }}
          />
        </div>
      </div>
    ),
    size,
  );
}
