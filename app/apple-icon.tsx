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
          background: "linear-gradient(135deg, #e0f2fe 0%, #ede9fe 50%, #fce7f3 100%)",
          borderRadius: "40px",
          border: "2px solid rgba(99,102,241,0.2)",
        }}
      >
        <div
          style={{
            fontSize: "100px",
            fontWeight: "900",
            color: "#6366f1",
            fontFamily: "sans-serif",
            lineHeight: 1,
          }}
        >
          n
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
