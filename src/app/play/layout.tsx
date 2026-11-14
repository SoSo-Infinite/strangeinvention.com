import type { Metadata } from "next";
import "./play.css";

export const metadata: Metadata = {
  title: "Strange Invention warehouse preview",
  description: "A private walk through the Strange Invention warehouse.",
  robots: { index: false, follow: false },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
