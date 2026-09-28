import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finplan · Finanzas personales",
    short_name: "Finplan",
    description:
      "Planificá tus pagos e ingresos y sabé cuánto te queda cada mes.",
    lang: "es-AR",
    start_url: "/",
    display: "standalone",
    background_color: "#111312",
    theme_color: "#2e6c53",
    icons: [
      {
        src: "/finplan-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/finplan-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
