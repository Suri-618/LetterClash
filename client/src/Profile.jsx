import { useEffect, useRef, useState } from "react";
import { getPlayerProfile } from "./api";
import { useScrollReveal } from "./useScrollReveal";

function formatDate(date) {
  if (!date) return "Date unavailable";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Profile({ username, onClose, onLogout }) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError("");

      try {
        const profileResult = await getPlayerProfile(username);

        if (!profileResult.ok) {
          throw new Error(
            profileResult.error || "Could not load player profile."
          );
        }

        if (cancelled) return;

        setPlayer(profileResult.data?.player || null);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load player profile.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (username) loadProfile();

    return () => {
      cancelled = true;
    };
  }, [username]);

  useScrollReveal(panelRef, {
    selector: "[data-profile-reveal]",
    refreshKey: `${loading}:${player?.id ?? player?._id ?? ""}`,
  });

  function getWinRate() {
    if (!player?.matchesPlayed) return "—";
    return `${Math.round((player.wins / player.matchesPlayed) * 100)}%`;
  }

  return (
    <section className="profile-panel" ref={panelRef}>
      <div className="profile-heading">
        <div>
          <p className="profile-eyebrow">FIGHTER IDENTITY</p>
          <h2>Player Profile</h2>
        </div>

        <button
          type="button"
          className="profile-close"
          onClick={onClose}
        >
          BACK
        </button>
      </div>

      {loading ? (
        <p className="profile-message">Loading fighter profile...</p>
      ) : error ? (
        <div className="profile-message profile-error">
          <p>{error}</p>
          <button
            type="button"
            className="profile-close"
            onClick={() => window.location.reload()}
          >
            RELOAD PAGE
          </button>
        </div>
      ) : !player ? (
        <p className="profile-message">Player profile not found.</p>
      ) : (
        <>
          <div className="profile-identity" data-profile-reveal="">
            <div className="profile-avatar">
              {(player.username || "?").slice(0, 1).toUpperCase()}
            </div>

            <div>
              <h3>{player.username}</h3>
              <p>Fighting since {formatDate(player.createdAt)}</p>
            </div>
          </div>

          <div className="profile-stats" data-profile-reveal="">
            <article className="profile-stat">
              <span>RATING</span>
              <strong>{player.rating ?? 1000}</strong>
            </article>

            <article className="profile-stat">
              <span>WINS</span>
              <strong>{player.wins ?? 0}</strong>
            </article>

            <article className="profile-stat">
              <span>LOSSES</span>
              <strong>{player.losses ?? 0}</strong>
            </article>

            <article className="profile-stat">
              <span>MATCHES</span>
              <strong>{player.matchesPlayed ?? 0}</strong>
            </article>

            <article className="profile-stat">
              <span>WIN RATE</span>
              <strong>{getWinRate()}</strong>
            </article>
          </div>

          <div className="profile-account" data-profile-reveal="">
            <div className="profile-account-info">
              <span>SIGNED IN AS</span>
              <strong>{player.username}</strong>
            </div>

            <button
              type="button"
              className="profile-logout-btn"
              onClick={() => {
                onLogout?.();
                onClose();
              }}
            >
              LOG OUT
            </button>
          </div>
        </>
      )}
    </section>
  );
}
