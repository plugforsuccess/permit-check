import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PermitCheck — Property Permit Verification";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f1f3d",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 80,
            fontWeight: 800,
            letterSpacing: "-2px",
          }}
        >
          <span style={{ color: "white" }}>Permit</span>
          <span style={{ color: "#c9a84c" }}>Check</span>
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#c9a84c",
            marginTop: 16,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.8,
          }}
        >
          Property Permit Verification
        </div>
      </div>
    ),
    { ...size }
  );
}
