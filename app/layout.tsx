import type { Metadata, Viewport } from "next";
import "./globals.css";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPages ? "/Hanami" : "";
const siteUrl = isGitHubPages
  ? "https://zhaooooo523.github.io/Hanami/"
  : "https://hanami-card-ledger.sarah920523.chatgpt.site/";
const socialImageUrl = new URL("og-blue.png", siteUrl).toString();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "花見｜信用卡花費帳本",
  description: "安心掌握每一筆信用卡花費，資料只存在你的裝置。",
  applicationName: "花見",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "花見" },
  formatDetection: { telephone: false },
  manifest: `${basePath}/manifest.webmanifest`,
  openGraph: {
    title: "花見｜信用卡花費帳本",
    description: "安心掌握每一筆花費，資料只存在你的裝置。",
    images: [{ url: socialImageUrl, width: 1536, height: 1024, alt: "花見信用卡花費帳本" }],
    locale: "zh_TW",
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [socialImageUrl] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f1f6fb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
