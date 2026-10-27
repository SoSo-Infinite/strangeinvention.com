import WaitlistForm from "@/components/WaitlistForm";

function Mark({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="#101827" />
      <rect x="10" y="14" width="44" height="36" rx="4" stroke="#3dffb5" strokeWidth="2.5" />
      <path d="M10 28h44" stroke="#3dffb5" strokeWidth="2" opacity="0.55" />
      <path d="M22 14v36M42 14v36" stroke="#8b7cff" strokeWidth="1.75" opacity="0.7" />
      <circle cx="32" cy="40" r="5" fill="#3dffb5" />
      <path d="M32 35v-8" stroke="#3dffb5" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="brand-lockup" href="#top" aria-label="Strange Invention home">
            <span className="brand-mark">
              <Mark size={28} />
            </span>
            <span className="brand-text">
              <span className="brand-name">
                Strange<span className="accent">Invention</span>
              </span>
              <span className="brand-tag">NeverEnding Warehouse</span>
            </span>
          </a>
          <a className="header-cta" href="#waitlist">
            Join waitlist
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap">
            <div className="hero-badge">
              <span className="dot" aria-hidden="true" />
              Early access · waitlist only
            </div>
            <div className="hero-mark">
              <Mark size={120} />
            </div>
            <h1>
              A <span className="glow">NeverEnding Warehouse</span> of strange
              inventions
            </h1>
            <p className="lede">
              Part mad-scientist lab, part discovery shop. Shopping here is
              gamified exploration — inventions as experiments you poke,
              learn, and maybe claim when drops land. Edu-tainment carries the
              commerce. Not a sterile catalog. Not a live store yet.
            </p>
            <p className="duo">
              Hosts on the floor: <strong>Doc</strong> — aloof theatrical
              mad-scientist curator; reverse psychology, dangerous experiments
              as Tuesday — and <strong>Ooger</strong>, the sarcastic sidekick
              who calls people “hoomans,” translates Doc’s science into plain
              talk, and somehow keeps the warehouse from eating itself.
            </p>
            <div className="pillars" style={{ marginTop: "1.5rem" }}>
              <article className="card">
                <h3>Doc</h3>
                <p>
                  Primary host. Confident, theatrical, slightly oblivious to
                  the chaos he causes. Issues the commands. Does not usually
                  say “hoomans.”
                </p>
              </article>
              <article className="card">
                <h3>Ooger</h3>
                <p>
                  Sidekick and plain-language translator. Comic disaster duty.
                  Future checkout tip jar may be labeled Ooger’s Wage / Snack
                  Fund — when commerce is real.
                </p>
              </article>
            </div>
            <div className="btn-row">
              <a className="btn btn-primary" href="#waitlist">
                Join the waitlist
              </a>
              <a className="btn btn-ghost" href="#pillars">
                What&apos;s coming
              </a>
            </div>
          </div>
        </section>

        <section className="section alt" id="pillars">
          <div className="wrap">
            <h2>Three ways through the warehouse</h2>
            <p className="sub">
              Short taste of the loop — discovery hotspots, forbidden curiosity,
              weird science — not the full 3D build. That comes later.
            </p>
            <div className="pillars">
              <article className="card">
                <div className="pillar-icon" aria-hidden="true">
                  1
                </div>
                <h3>Explore inventions</h3>
                <p>
                  Discovery shopping with hotspots — walk the aisles, chase
                  forbidden curiosity, inspect experiments on the warehouse
                  floor before anything ships.
                </p>
              </article>
              <article className="card">
                <div className="pillar-icon" aria-hidden="true">
                  2
                </div>
                <h3>Learn the weird science</h3>
                <p>
                  Edu-tainment built in: how it works, why it&apos;s weird, what
                  problem it was meant to solve. Learn without a lecture —
                  Doc will insist you already know.
                </p>
              </article>
              <article className="card">
                <div className="pillar-icon" aria-hidden="true">
                  3
                </div>
                <h3>Shop the drops</h3>
                <p>
                  Real commerce when drops are ready — Portal Keys and limited
                  releases later, when demand shows. No pretend inventory or
                  buy-now for products that don&apos;t exist yet.
                </p>
                <span className="coming">Coming</span>
              </article>
            </div>
          </div>
        </section>

        <section className="section waitlist" id="waitlist">
          <div className="wrap">
            <h2>Get early access</h2>
            <p className="sub" style={{ marginInline: "auto" }}>
              Strange Invention is in early build. Drop your email for a
              heads-up when the NeverEnding Warehouse opens for early access.
              Honest stage — no fake SKUs, no live shop claims.
            </p>
            <div className="panel">
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div>
            <div className="footer-brand">
              Strange<span className="accent">Invention</span>
            </div>
            <div>NeverEnding Warehouse · edu-tainment · drops when ready</div>
          </div>
          <p className="fineprint">
            Early access / waitlist only. This is not a live store yet — no
            inventory counts, no buy-now for products that aren&apos;t shipping.
            Fiction and entertainment frame the vibe; real commerce (including
            Portal Keys / drops) stays behind the waitlist until demand and
            readiness line up. Contact:{" "}
            <a href="mailto:cjames112@gmail.com">cjames112@gmail.com</a>
          </p>
          <p className="fineprint">
            © {new Date().getFullYear()} Strange Invention.
          </p>
        </div>
      </footer>
    </>
  );
}
