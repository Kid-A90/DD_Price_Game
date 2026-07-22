import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Designs Direct Live Price Game",
  description: "Live team pricing game for Designs Direct."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
