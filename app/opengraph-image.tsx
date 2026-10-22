import { ImageResponse } from "next/og";

export const alt = "Cờ Úp — Cờ tướng úp (Jieqi / Dark Xiangqi) online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#e11d48";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#14100c",
          padding: "64px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              width: 120,
              height: 10,
              borderRadius: 5,
              backgroundColor: ACCENT,
              marginBottom: 44,
            }}
          />
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.15,
            }}
          >
            Cờ Úp — Dark Xiangqi (Jieqi)
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 34,
              color: "#d6cfc4",
              lineHeight: 1.4,
            }}
          >
            Quân úp đi theo quân chủ tọa rồi lật mặt — đấu máy, phòng chơi trực tuyến, thế cờ hằng ngày.
          </div>
        </div>
        <div
          style={{
            fontSize: 26,
            color: ACCENT,
          }}
        >
          SynerWorlds · Chơi miễn phí trên trình duyệt · Free to play in your browser
        </div>
      </div>
    ),
    { ...size },
  );
}
