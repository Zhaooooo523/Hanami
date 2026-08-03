import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "花見｜信用卡花費帳本",
    short_name: "花見",
    description: "本機優先的信用卡花費追蹤工具",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f2ea",
    theme_color: "#f5f2ea",
    orientation: "portrait-primary",
  };
}
