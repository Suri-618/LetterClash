import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useLenis } from "./lenisStore";
import { useScrollReveal } from "./useScrollReveal";

export default function LandingPage({ account }) {
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const lenis = useLenis();

  useScrollReveal(featuresRef, {
    selector: ".panel",
    threshold: 0.18,
    rootMargin: "0px 0px -60px 0px",
    stagger: 80,
  });

  useEffect(() => {
    const hero = heroRef.current;
    if (!lenis || !hero) return;

    const mobileQuery = window.matchMedia("(max-width: 720px)");
    let progress = 0;

    const update = (instance) => {
      if (instance.prefersReducedMotion || mobileQuery.matches) {
        progress = 0;
      } else {
        const distance = Math.max(hero.offsetHeight, 1);
        progress = Math.min(1, Math.max(0, instance.scroll / distance));
      }

      hero.style.setProperty("--hero-progress", progress.toFixed(4));
    };

    const handleViewportChange = () => update(lenis);

    update(lenis);
    lenis.on("scroll", update);
    mobileQuery.addEventListener("change", handleViewportChange);

    return () => {
      lenis.off("scroll", update);
      mobileQuery.removeEventListener("change", handleViewportChange);
    };
  }, [lenis]);

  return (
    <main className="app-shell landing-page">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-icon">⚔</span>
          LETTER<span>CLASH</span>
        </Link>

        <nav className="landing-nav">
          <Link
            className="landing-login"
            to={account ? "/game" : "/auth"}
          >
            {account ? "ENTER THE ARENA →" : "LOGIN / SIGN UP →"}
          </Link>
        </nav>
      </header>

      <section className="landing-hero" ref={heroRef}>
        <p className="eyebrow">REAL-TIME MULTIPLAYER</p>

        <h1>
          TYPE FAST.
          <br />
          <span>STRIKE HARD.</span>
        </h1>

        <p className="subtitle">
          Challenge your friends in real-time typing battles.
          <br />
          Every millisecond matters. Only the fastest survive.
        </p>

        <div className="landing-actions">
          <Link className="primary-button landing-cta" to="/auth">
            ENTER THE ARENA →
          </Link>
          <a className="secondary-button" href="#features">
            DISCOVER THE GAME
          </a>
        </div>
      </section>

      <section className="landing-features" id="features" ref={featuresRef}>
        <article className="panel">
          <h2>⚡ Fast Reactions</h2>
          <p>Hit the target letter before your rival.</p>
        </article>

        <article className="panel">
          <h2>⚔ Multiplayer Battles</h2>
          <p>Create a private room and challenge a friend.</p>
        </article>

        <article className="panel">
          <h2>🏆 Global Rankings</h2>
          <p>Build your record and climb the leaderboard.</p>
        </article>
      </section>

      <footer>LETTER CLASH © 2026 · MAY THE FASTEST WIN</footer>
    </main>
  );
}
