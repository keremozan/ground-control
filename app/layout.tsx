import type { Metadata } from "next";
import "./globals.css";
import Tooltip from "@/components/Tooltip";

export const metadata: Metadata = { title: "Ground Control" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "20px 24px 24px", maxWidth: 1400, margin: "0 auto" }}>
          {children}
        </main>
        <Tooltip />
      </body>
    </html>
  );
}
