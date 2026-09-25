import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strange Invention — Interactive warehouse of inventions",
  description:
    "Early access to Strange Invention: an interactive warehouse where you explore inventions, learn the weird science, and shop the drops when they land. Join the waitlist.",
  metadataBase: new URL("https://strangeinvention.com"),
  openGraph: {
    title: "Strange Invention — Interactive warehouse of inventions",
    description:
      "Explore, learn, and get first access to Chad’s inventions. Waitlist only — not a live store yet.",
    url: "https://strangeinvention.com",
    siteName: "Strange Invention",
    type: "website",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
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
