import type { Metadata } from "next";
import { Geist, Geist_Mono } from 'next/font/google';
import "./globals.css";
import Tooltip from "@/components/Tooltip";

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const geistDisplay = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = { title: "Ground Control" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistDisplay.variable} ${geistMono.variable}`}>
      <body>
        <main style={{ padding: "20px 24px 24px", maxWidth: 1400, margin: "0 auto" }}>
          {children}
        </main>
        <Tooltip />
      </body>
    </html>
  );
}
