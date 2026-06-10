import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1117",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "420px",
            height: "420px",
            background: "#0f766e",
            borderRadius: "96px",
          }}
        >
          <div
            style={{
              fontSize: "220px",
              fontWeight: "900",
              color: "#ffffff",
              lineHeight: 1,
              fontFamily: "sans-serif",
              letterSpacing: "-8px",
            }}
          >
            A
          </div>
          <div
            style={{
              fontSize: "56px",
              fontWeight: "700",
              color: "rgba(255,255,255,0.75)",
              letterSpacing: "14px",
              fontFamily: "sans-serif",
              marginTop: "-8px",
            }}
          >
            TIER
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
