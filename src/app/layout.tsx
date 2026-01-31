import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mouser – Top jobs that respond",
  description: "Get a ranked list of jobs most likely to answer when you apply.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
