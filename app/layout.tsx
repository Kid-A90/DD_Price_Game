import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-price",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Designs Direct Live Price Game",
  description: "Live team pricing game for Designs Direct."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body>{children}</body>
    </html>
  );
}
