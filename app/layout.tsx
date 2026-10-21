import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ICON_VERSION } from "@/lib/jieqi/iconSvg";

const SITE_URL = "https://cotuongup.synerworlds.com";
const TITLE = "Cờ Úp — Cờ tướng úp | Dark Xiangqi (Jieqi)";
const DESCRIPTION =
  "Chơi cờ úp (cờ tướng úp, Jieqi — Dark Xiangqi) online miễn phí: quân úp đi theo quân chủ tọa rồi lật mặt, đấu với máy nhiều cấp độ, phòng chơi trực tuyến xác thực bởi máy chủ, thế cờ hằng ngày và xuất video replay. Play Jieqi (Dark Xiangqi) online free — face-down pieces move as their host piece, then flip and reveal. Vs computer, server-validated rooms, daily puzzles and replay video.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | Cờ Úp",
  },
  description: DESCRIPTION,
  keywords: [
    "cờ úp",
    "cờ tướng úp",
    "cờ úp online",
    "chơi cờ úp",
    "jieqi",
    "dark xiangqi",
    "banqi",
    "cờ tướng mặt úp",
    "dark chess xiangqi",
    "play jieqi online",
    "jieqi vs computer",
    "揭棋",
  ],
  authors: [{ name: "SynerWorlds" }],
  creator: "SynerWorlds",
  publisher: "SynerWorlds",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      vi: SITE_URL,
      en: SITE_URL,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Cờ Úp — Dark Xiangqi",
    title: TITLE,
    description: DESCRIPTION,
    locale: "vi_VN",
    alternateLocale: ["en_US"],
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Cờ Úp — Cờ tướng úp (Jieqi / Dark Xiangqi) online",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
  category: "games",
  // PWA: installable app (manifest.ts) + iOS home-screen support.
  icons: {
    icon: [
      { url: `/icon.svg?v=${ICON_VERSION}`, type: "image/svg+xml" },
      { url: `/pwa/icon-192.png?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png" },
      { url: `/pwa/icon-512.png?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `/pwa/apple-touch-icon.png?v=${ICON_VERSION}`, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Cờ Úp",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

// JSON-LD structured data: helps Google show rich results.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "Cờ Úp — Cờ tướng úp (Jieqi / Dark Xiangqi)",
  alternateName: ["Jieqi", "Dark Xiangqi", "Cờ tướng úp"],
  description: DESCRIPTION,
  url: SITE_URL,
  inLanguage: ["vi", "en"],
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  gamePlatform: "Web browser",
  genre: ["Board game", "Strategy", "Chess"],
  playMode: ["SinglePlayer", "MultiPlayer"],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Organization",
    name: "SynerWorlds",
    url: SITE_URL,
  },
};

export const viewport = {
  themeColor: "#701e24",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ("serviceWorker" in navigator) {
              if (document.readyState === "complete") {
                navigator.serviceWorker.register("/sw.js").catch(function () {});
              } else {
                window.addEventListener("load", function () {
                  navigator.serviceWorker.register("/sw.js").catch(function () {});
                });
              }
            }
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Google tag (gtag.js) — Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-YPKKP13PBY"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-YPKKP13PBY');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
