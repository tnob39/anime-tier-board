import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f766e",
          borderRadius: "40px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: "80px",
              fontWeight: "900",
              color: "#ffffff",
              lineHeight: 1,
              fontFamily: "sans-serif",
            }}
          >
            A
          </div>
          <div
            style={{
              fontSize: "20px",
              fontWeight: "700",
              color: "rgba(255,255,255,0.8)",
              letterSpacing: "5px",
              fontFamily: "sans-serif",
            }}
          >
            TIER
          </div>
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
