import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icono al añadir a la pantalla de inicio en iPhone (Apple Touch Icon). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0f172a 0%, #07090c 55%, #022c22 100%)",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: "#34d399",
              letterSpacing: "-0.06em",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            GA4
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#94a3b8",
              letterSpacing: "0.35em",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            TV
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
