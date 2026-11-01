import type { MetadataRoute } from "next";

// Torna a app instalável no telemóvel (Android/Chrome) e no computador: abre em ecrã inteiro, sem a barra do browser.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GESTAO APP",
    short_name: "Gestão",
    description: "Gestão de faturas",
    lang: "pt-PT",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
