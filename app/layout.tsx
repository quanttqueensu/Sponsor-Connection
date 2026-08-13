import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Merriweather } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-merriweather",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QUANTT Hub",
  description:
    "QUANTT member and sponsor hub — roles, applications, and club posts.",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
      <body className="min-h-screen bg-navy font-body antialiased">{children}</body>
    </html>
  );
}
