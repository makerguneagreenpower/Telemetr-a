import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greenpower · Telemetría",
  description: "Panel de telemetría Greenpower: datos, GPS y rendimiento de pilotos.",
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
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
