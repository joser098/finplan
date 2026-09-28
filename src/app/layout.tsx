import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  applicationName: "Finplan",
  title: {
    default: "Finplan · Tu dinero, con claridad",
    template: "%s | Finplan",
  },
  description:
    "Planificá tus pagos e ingresos y descubrí cuánto te queda después de pagar todo.",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Finplan",
    title: "Finplan · Tu dinero, con claridad",
    description:
      "Tus ingresos, tus compromisos y lo que te queda. Planificá cada mes con tranquilidad.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Finplan · Tu dinero, con claridad",
    description:
      "Planificá tus pagos e ingresos y sabé cuánto te queda cada mes.",
  },
  appleWebApp: { capable: true, title: "Finplan", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8faf8" },
    { media: "(prefers-color-scheme: dark)", color: "#111312" },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function apply(){try{document.documentElement.dataset.theme=localStorage.getItem('finplan-theme')==='dark'?'dark':'light'}catch{}}apply();window.addEventListener('storage',apply)})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
