import type { Metadata } from "next";
import "./globals.css";
import ThemeControls from "./theme-controls";

export const metadata: Metadata = {
  title: "MGRT · MakerGunea Racing Team",
  description: "Telemetría de MakerGunea Racing Team (MGRT). Dos coches en F24 y F24+, GPS y rendimiento de pilotos.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased"><ThemeControls>{children}</ThemeControls></body>
    </html>
  );
}
