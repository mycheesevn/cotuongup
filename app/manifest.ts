import { ICON_VERSION } from "@/lib/jieqi/iconSvg";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cờ Úp — SynerWorlds",
    short_name: "Cờ Úp",
    description:
      "Chơi cờ úp (cờ tướng úp, Jieqi — Dark Xiangqi) online: đấu với máy, phòng chơi trực tuyến, thế cờ hằng ngày.",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#701e24",
    theme_color: "#701e24",
    icons: [
      {
        src: `/icon.svg?v=${ICON_VERSION}`,
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: `/pwa/icon-192.png?v=${ICON_VERSION}`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `/pwa/icon-512.png?v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `/pwa/icon-maskable.png?v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
