import {
  AFFILIATE_DISCLOSURE,
  FOOTER_FREE,
  TEST_BANNER,
} from "@/play/copy";

export function PlayFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="play-root">
      <p className="banner">{TEST_BANNER}</p>
      <div className="play-body">{children}</div>
      <footer className="play-foot">
        <p>{FOOTER_FREE}</p>
        <p>{AFFILIATE_DISCLOSURE}</p>
        <details>
          <summary>Questions</summary>
          <p>{AFFILIATE_DISCLOSURE}</p>
          <p>{FOOTER_FREE}</p>
          <p>House collectibles are display pieces for ages 13 and up. They are not toys.</p>
          <p>Some shelf pieces are sold by other shops. The warehouse only links out. It does not pack those.</p>
        </details>
        <p>
          <a href="/play/credits">Credits</a>
        </p>
      </footer>
    </div>
  );
}
