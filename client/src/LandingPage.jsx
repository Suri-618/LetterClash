import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <main className="app-shell landing-page">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">⚔</span>
          LETTER<span>CLASH</span>
        </a>

        <nav className="landing-nav">
          <Link className="landing-login" to="/auth">
            LOGIN
          </Link>
          <Link className="landing-start" to="/auth">
            GET STARTED →
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
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

      <section className="landing-features" id="features">
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
