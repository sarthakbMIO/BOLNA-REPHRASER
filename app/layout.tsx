import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Bolna Extraction Rephraser",
  description: "Fetch Bolna extraction fields, rephrase them with Claude, export to Google Docs.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
