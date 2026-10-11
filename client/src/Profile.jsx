import { useEffect, useState } from "react";
import { getPlayerProfile, getPlayerMatches } from "./api";

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

export default function Profile({ username, onClose }) {
  const [player, setPlayer] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError("");

      try {
        const [profileResult, matchesResult] = await Promise.all([
          getPlayerProfile(username),
          getPlayerMatches(username),
        ]);

        if (!profileResult.ok) {
          throw new Error(
            profileResult.error || "Could not load player profile."
          );
        }

        if (!matchesResult.ok) {
          throw new Error(
            matchesResult.error || "Could not load match history."
          );
        }

        if (cancelled) return;

        setPlayer(profileResult.data?.player || null);
        setMatches(
          Array.isArray(matchesResult.data?.matches)
            ? matchesResult.data.matches
            : []
        );
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

  const normalizedUsername = (player?.username || username || "")
    .toLowerCase();

  function getMatchResult(match) {
    if (!match.winnerUsername) return "DRAW";

    return match.winnerUsername.toLowerCase() === normalizedUsername
      ? "WIN"
      : "LOSS";
  }

  function getOpponent(match) {
    const participants = Array.isArray(match.players)
      ? match.players
      : [];

    const opponent = participants.find(
      (item) =>
        item.username?.toLowerCase() !== normalizedUsername
    );

    return opponent?.username || "Unknown fighter";
  }

  function getMyFinalHP(match) {
    const participants = Array.isArray(match.players)
      ? match.players
      : [];

    const me = participants.find(
      (item) =>
        item.username?.toLowerCase() === normalizedUsername
    );

    return me?.finalHP;
  }

  return (
    <section className="profile-panel">
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
          <div className="profile-identity">
            <div className="profile-avatar">
              {(player.username || "?").slice(0, 1).toUpperCase()}
            </div>

            <div>
              <h3>{player.username}</h3>
              <p>Fighting since {formatDate(player.createdAt)}</p>
            </div>
          </div>

          <div className="profile-stats">
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
          </div>

          <div className="profile-history-heading">
            <h3>Match History</h3>
            <span>{matches.length} records</span>
          </div>

          {matches.length === 0 ? (
            <p className="profile-message">
              No completed matches yet. Enter the arena to get started!
            </p>
          ) : (
            <div className="profile-history">
              {matches.map((match, index) => {
                const result = getMatchResult(match);
                const finalHP = getMyFinalHP(match);

                return (
                  <article
                    className="profile-match"
                    key={match._id || match.roomCode || index}
                  >
                    <div
                      className={`profile-result result-${result.toLowerCase()}`}
                    >
                      {result}
                    </div>

                    <div className="profile-match-details">
                      <strong>vs. {getOpponent(match)}</strong>
                      <span>{formatDate(match.completedAt)}</span>
                    </div>

                    <div className="profile-match-hp">
                      <span>FINAL HP</span>
                      <strong>
                        {finalHP == null ? "—" : finalHP}
                      </strong>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
