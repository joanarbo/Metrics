import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthGate } from "@/components/auth-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GA4 · Metrics",
  description: "Cuentas, propiedades y visitas agregadas (Google Analytics 4)",
  applicationName: "GA4 · Metrics",
  /** Safari iOS: Compartir → Añadir a pantalla de inicio. */
  appleWebApp: {
    capable: true,
    title: "GA4 TV",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

/** Pantalla completa en iPhone (notch / isla) + barra de estado oscura. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07090c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans antialiased">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
