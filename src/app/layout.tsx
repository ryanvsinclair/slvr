import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SLVR | Interactive Web Design",
  description:
    "Custom web experiences for brands that refuse to blend in. One senior designer-developer from concept to launch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
