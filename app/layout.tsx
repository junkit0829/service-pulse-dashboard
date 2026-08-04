import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Service Pulse | Customer Service Performance Intelligence",
  description:
    "An Excel-compatible customer service performance and operations intelligence dashboard.",
  openGraph: {
    title: "Service Pulse",
    description: "Customer Experience Performance Intelligence",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Service Pulse customer experience dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Service Pulse",
    description: "Customer Experience Performance Intelligence",
    images: ["/og.png"],
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
