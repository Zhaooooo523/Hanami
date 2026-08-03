import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.GITHUB_PAGES === "true" ? "/Hanami" : "";

  return {
    name: "花見｜信用卡花費帳本",
    short_name: "花見",
    description: "本機優先的信用卡花費追蹤工具",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#f1f6fb",
    theme_color: "#f1f6fb",
    orientation: "portrait-primary",
  };
}
