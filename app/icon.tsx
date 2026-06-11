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
          background: "linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 50%, #fce7f3 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "420px",
            height: "420px",
            background: "linear-gradient(135deg, #e0f2fe 0%, #ede9fe 50%, #fce7f3 100%)",
            borderRadius: "96px",
            border: "6px solid rgba(99,102,241,0.25)",
          }}
        >
          <div
            style={{
              fontSize: "260px",
              fontWeight: "900",
              color: "#6366f1",
              fontFamily: "sans-serif",
              lineHeight: 1,
              letterSpacing: "-8px",
            }}
          >
            n
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
