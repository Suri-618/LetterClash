import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SERVER_URL } from "./config.js";
import { useScrollReveal } from "./useScrollReveal";
import "./Leaderboard.css";

const readAuth = () => {
  try {
    return JSON.parse(localStorage.getItem("letterclash.auth") || "{}");
  } catch {
    return {};
  }
};

const getUsername = (player) =>
  player?.username ?? player?.name ?? "";

const getId = (player) =>
  player?.id ?? player?._id ?? player?.playerId ?? "";

const getWinRate = (player) => {
  const played = Number(player?.matchesPlayed) || 0;
  const wins = Number(player?.wins) || 0;
  return played ? Math.round((wins / played) * 100) : 0;
};

const formatDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

async function apiGet(path, token) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {},
  });

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "Player or match history not found."
        : `Request failed (${response.status}).`
    );
  }

  return response.json();
}

function StatCard({ label, value, detail }) {
  return (
    <div className="lb-stat">
      <span className="lb-stat-label">{label}</span>
      <strong className="lb-stat-value">{value}</strong>
      {detail && <span className="lb-stat-detail">{detail}</span>}
    </div>
  );
}

export default function Leaderboard({
  onSelectPlayer,
  refreshVersion = 0,
}) {
  const auth = useMemo(() => readAuth(), []);
  const currentPlayer = auth.player ?? null;
  const token = auth.token ?? "";
  const refreshVersionRef = useRef(refreshVersion);
  const pageRef = useRef(null);

  const [players, setPlayers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState(
    getUsername(currentPlayer)
  );
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet("/api/leaderboard", token);
      const raw = Array.isArray(data)
        ? data
        : data.players ?? data.leaderboard ?? [];

      // Enforce the requested ordering in the UI as well.
      const list = [...raw].sort(
        (a, b) =>
          (Number(b.wins) || 0) - (Number(a.wins) || 0) ||
          (Number(b.rating) || 0) - (Number(a.rating) || 0)
      );

      setPlayers(list);
    } catch (err) {
      setError(err.message || "Unable to load the leaderboard.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(loadLeaderboard, 0);
    return () => window.clearTimeout(id);
  }, [loadLeaderboard]);

  const loadPlayerDetails = useCallback(
    async (username) => {
      if (!username) return;

      setSelectedUsername(username);
      setProfile(null);
      setMatches([]);
      setProfileError("");
      setProfileLoading(true);

      try {
        const encoded = encodeURIComponent(username);
        const [profileData, matchData] = await Promise.all([
          apiGet(`/api/players/${encoded}`, token),
          apiGet(`/api/players/${encoded}/matches`, token),
        ]);

        setProfile(profileData.player ?? profileData);
        const history = Array.isArray(matchData)
          ? matchData
          : matchData.matches ?? matchData.history ?? [];
        setMatches(history.slice(0, 5));
      } catch (err) {
        setProfileError(err.message || "Unable to load player details.");
      } finally {
        setProfileLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!selectedUsername) return undefined;
    const id = window.setTimeout(
      () => loadPlayerDetails(selectedUsername),
      0
    );
    return () => window.clearTimeout(id);
  }, [selectedUsername, loadPlayerDetails]);

  // A match save can complete while this tab is open: refetch both the
  // rankings and the player panel. Skip the initial mount because the
  // effects above already load fresh data.
  useEffect(() => {
    if (refreshVersion === refreshVersionRef.current) return undefined;
    refreshVersionRef.current = refreshVersion;
    if (!refreshVersion) return undefined;

    const id = window.setTimeout(() => {
      loadLeaderboard();
      if (selectedUsername) loadPlayerDetails(selectedUsername);
    }, 0);
    return () => window.clearTimeout(id);
  }, [
    refreshVersion,
    loadLeaderboard,
    loadPlayerDetails,
    selectedUsername,
  ]);

  const currentUsername = getUsername(currentPlayer);
  const selectedStats = profile ?? players.find(
    (player) => getUsername(player) === selectedUsername
  );

  useScrollReveal(pageRef, {
    selector: "[data-lb-reveal]",
    refreshKey: `${profileLoading}:${players.length}:${selectedUsername}:${matches.length}`,
  });

  const isCurrentPlayer = (player) =>
    getUsername(player) === currentUsername ||
    (getId(player) && getId(player) === getId(currentPlayer));

  function findMatchPlayer(matchPlayers, stats, username) {
    const playerId = String(stats?.id ?? stats?._id ?? "");
    const name = String(username || "").toLowerCase();

    return (
      matchPlayers.find(
        (item) =>
          (playerId && String(item.playerId) === playerId) ||
          String(item.username || "").toLowerCase() === name
      ) ?? null
    );
  }

  return (
    <section className="lb-page" aria-label="Leaderboard" ref={pageRef}>
      <header className="lb-header" data-lb-reveal="">
        <div>
          <span className="lb-eyebrow">LETTER CLASH / COMPETITIVE</span>
          <h1>Leaderboard<span>.</span></h1>
          <p>Every match counts. Every win moves you up.</p>
        </div>
        <button
          className="lb-refresh"
          onClick={loadLeaderboard}
          disabled={loading}
          type="button"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </header>

      {error && (
        <div className="lb-error" role="alert">
          {error}
          <button onClick={loadLeaderboard} type="button">Retry</button>
        </div>
      )}

      <section className="lb-layout">
        <div className="lb-rankings">
          <div className="lb-section-heading">
            <div>
              <span className="lb-eyebrow">THE ARENA</span>
              <h2>Top fighters</h2>
            </div>
            <span className="lb-count">{players.length} PLAYERS</span>
          </div>

          {loading && players.length === 0 ? (
            <div className="lb-empty">Loading fighters…</div>
          ) : players.length === 0 ? (
            <div className="lb-empty">No ranked players yet.</div>
          ) : (
            <>
              <div className="lb-podium" data-lb-reveal="">
                {players.slice(0, 3).map((player, index) => (
                  <button
                    type="button"
                    key={getId(player) || getUsername(player)}
                    className={`lb-podium-card lb-place-${index + 1} ${
                      selectedUsername === getUsername(player)
                        ? "is-selected"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedUsername(getUsername(player));
                    }}
                  >
                    <span className="lb-podium-rank">
                      {["🥇", "🥈", "🥉"][index]}
                    </span>
                    <strong>{getUsername(player) || "Fighter"}</strong>
                    <span className="lb-podium-rating">
                      {Number(player.rating) || 0} ELO
                    </span>
                    <span className="lb-podium-wins">
                      {Number(player.wins) || 0} WINS
                    </span>
                  </button>
                ))}
              </div>

              <div
                className="lb-table-wrap"
                data-lenis-prevent-horizontal
                data-lb-reveal=""
              >
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>RANK / PLAYER</th>
                      <th>WINS</th>
                      <th>WIN RATE</th>
                      <th>RATING</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, index) => (
                      <tr
                        key={getId(player) || getUsername(player)}
                        style={{
                          "--lb-row-delay": `${Math.min(index, 8) * 35}ms`,
                        }}
                        className={[
                          selectedUsername === getUsername(player)
                            ? "is-selected"
                            : "",
                          isCurrentPlayer(player) ? "is-you" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <td>
                          <button
                            type="button"
                            className="lb-player-link"
                            onClick={() => {
                              setSelectedUsername(getUsername(player));
                            }}
                          >
                            <span className="lb-rank-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <strong>{getUsername(player) || "Fighter"}</strong>
                              {isCurrentPlayer(player) && (
                                <small>YOU</small>
                              )}
                            </span>
                          </button>
                        </td>
                        <td>{Number(player.wins) || 0}</td>
                        <td>{getWinRate(player)}%</td>
                        <td className="lb-rating">
                          {Number(player.rating) || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="lb-footnote">
                Rankings are sorted by wins, then Elo rating. The list shows
                the players returned by your existing leaderboard endpoint.
              </p>
            </>
          )}
        </div>

        <aside className="lb-player-card">
          <span className="lb-eyebrow">FIGHTER PROFILE</span>
          <h2>{selectedUsername || "Select a fighter"}</h2>

          {profileLoading ? (
            <div className="lb-empty">Loading player stats…</div>
          ) : profileError ? (
            <div role="alert">
              <p className="lb-error-text">{profileError}</p>
              <button
                type="button"
                className="lb-profile-link"
                onClick={() => loadPlayerDetails(selectedUsername)}
              >
                RETRY
              </button>
            </div>
          ) : selectedStats ? (
            <>
              <div className="lb-rating-hero" data-lb-reveal="">
                <span>ELO RATING</span>
                <strong>{Number(selectedStats.rating) || 0}</strong>
              </div>
              <div className="lb-stat-grid" data-lb-reveal="">
                <StatCard
                  label="GLOBAL RANK"
                  value={
                    selectedStats.rank != null
                      ? `#${selectedStats.rank}`
                      : "Unranked"
                  }
                />
                <StatCard label="WINS" value={Number(selectedStats.wins) || 0} />
                <StatCard label="LOSSES" value={Number(selectedStats.losses) || 0} />
                <StatCard
                  label="MATCHES"
                  value={Number(selectedStats.matchesPlayed) || 0}
                />
                <StatCard label="WIN RATE" value={`${getWinRate(selectedStats)}%`} />
              </div>

              <div
                className="lb-section-heading lb-history-heading"
                data-lb-reveal=""
              >
                <div>
                  <span className="lb-eyebrow">LATEST BATTLES</span>
                  <h3>Match history</h3>
                </div>
              </div>

              {matches.length === 0 ? (
                <div className="lb-empty lb-empty-small">
                  No recent matches available.
                </div>
              ) : (
                <div className="lb-match-list" data-lb-reveal="">
                  {matches.map((match, index) => {
                    const matchPlayers = match.players ?? [];
                    const me = findMatchPlayer(
                      matchPlayers,
                      selectedStats,
                      selectedUsername
                    );
                    const opponent = me
                      ? matchPlayers.find((item) => item !== me)
                      : matchPlayers.find(
                          (item) =>
                            String(item.username || "").toLowerCase() !==
                            String(selectedUsername).toLowerCase()
                        );
                    const winnerId = match.winnerId == null
                      ? ""
                      : String(match.winnerId);
                    const won = winnerId
                      ? me != null && winnerId === String(me.playerId)
                      : Boolean(match.winnerUsername) &&
                        String(match.winnerUsername).toLowerCase() ===
                          String(selectedUsername).toLowerCase();

                    return (
                      <div
                        className="lb-match"
                        key={match.matchKey || match._id || index}
                      >
                        <span className={`lb-match-result ${won ? "is-win" : "is-loss"}`}>
                          {won ? "W" : "L"}
                        </span>
                        <div className="lb-match-opponent">
                          <strong>
                            vs {opponent?.username || match.winnerUsername || "Opponent"}
                          </strong>
                          <span>{formatDate(match.completedAt)}</span>
                        </div>
                        <span className="lb-match-change">
                          {me?.ratingChange == null
                            ? "—"
                            : `${Number(me.ratingChange) > 0 ? "+" : ""}${me.ratingChange}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {onSelectPlayer && selectedUsername && (
                <button
                  type="button"
                  className="lb-profile-link"
                  onClick={() => onSelectPlayer(selectedUsername)}
                >
                  VIEW FULL PROFILE →
                </button>
              )}
            </>
          ) : (
            <div className="lb-empty">
              Select a player to see their stats and recent matches.
            </div>
          )}
        </aside>
      </section>
    </section>
  );
}
