import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Ground Control" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "20px 24px 24px", maxWidth: 1400, margin: "0 auto" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
