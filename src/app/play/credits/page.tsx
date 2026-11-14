import { readFile } from "node:fs/promises";
import path from "node:path";
import { PlayFrame } from "@/play/ui/Frame";

export const metadata = {
  title: "Credits",
  robots: { index: false, follow: false },
};

export default async function CreditsPage() {
  const text = await readFile(path.join(process.cwd(), "public", "play", "CREDITS.md"), "utf8");
  return (
    <PlayFrame>
      <div className="credits-wrap">
        <article className="credits">
          <pre>{text}</pre>
        </article>
      </div>
    </PlayFrame>
  );
}
