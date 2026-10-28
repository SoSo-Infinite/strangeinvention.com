import type { Metadata } from "next";
import "./globals.css";

const title = "Strange Invention — Interactive warehouse of inventions";
const description =
  "Early access to Strange Invention: an interactive warehouse where you explore inventions, learn the weird science, and shop the drops when they land. Join the waitlist.";
const shareDescription =
  "Explore, learn, and get first access to strange inventions. Waitlist only — not a live store yet.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://strangeinvention.com"),
  openGraph: {
    title,
    description: shareDescription,
    url: "https://strangeinvention.com",
    siteName: "Strange Invention",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description: shareDescription,
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
