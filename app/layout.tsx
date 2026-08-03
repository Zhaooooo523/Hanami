import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "花見｜信用卡花費帳本",
    description: "安心掌握每一筆信用卡花費，資料只存在你的裝置。",
    applicationName: "花見",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "花見" },
    formatDetection: { telephone: false },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: "花見｜信用卡花費帳本",
      description: "安心掌握每一筆花費，資料只存在你的裝置。",
      images: [{ url: `${origin}/og-blue.png`, width: 1536, height: 1024, alt: "花見信用卡花費帳本" }],
      locale: "zh_TW",
      type: "website",
    },
    twitter: { card: "summary_large_image", images: [`${origin}/og-blue.png`] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f1f6fb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
