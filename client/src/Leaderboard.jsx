import { useEffect, useState } from "react";
import { getLeaderboard } from "./api";

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLeaderboard() {
    setLoading(true);
    setError("");

    try {
      const result = await getLeaderboard();

      if (!result.ok) {
        throw new Error(result.error || "Could not load leaderboard.");
      }

      const data = result.data;
      setPlayers(Array.isArray(data?.players) ? data.players : []);
    } catch (err) {
      setError(err.message || "Could not load leaderboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaderboard();
  }, []);

  return (
    <section className="leaderboard-panel">
      <div className="leaderboard-heading">
        <div>
          <p className="leaderboard-eyebrow">GLOBAL RANKINGS</p>
          <h2>Hall of Fighters</h2>
          <p className="leaderboard-subtitle">
            Compete, climb the ranks, and claim your place.
          </p>
        </div>

        <button
          className="leaderboard-refresh"
          onClick={loadLeaderboard}
          disabled={loading}
          type="button"
        >
          {loading ? "LOADING..." : "↻ REFRESH"}
        </button>
      </div>

      {loading && players.length === 0 ? (
        <p className="leaderboard-message">Loading fighters...</p>
      ) : error ? (
        <div className="leaderboard-message leaderboard-error">
          <p>{error}</p>
          <button
            className="leaderboard-refresh"
            onClick={loadLeaderboard}
            type="button"
          >
            TRY AGAIN
          </button>
        </div>
      ) : players.length === 0 ? (
        <p className="leaderboard-message">
          No rankings yet. Play your first match and make history!
        </p>
      ) : (
        <div className="leaderboard-table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>FIGHTER</th>
                <th>RATING</th>
                <th>WINS</th>
                <th>LOSSES</th>
                <th>MATCHES</th>
              </tr>
            </thead>

            <tbody>
              {players.map((player, index) => (
                <tr key={player._id || player.id || player.username || index}>
                  <td>
                    <span
                      className={`leaderboard-rank rank-${index + 1}`}
                    >
                      {index === 0
                        ? "♛ 1"
                        : index === 1
                          ? "2"
                          : index === 2
                            ? "3"
                            : index + 1}
                    </span>
                  </td>
                  <td className="leaderboard-fighter">
                    {player.username}
                  </td>
                  <td className="leaderboard-rating">
                    {player.rating ?? 1000}
                  </td>
                  <td>{player.wins ?? 0}</td>
                  <td>{player.losses ?? 0}</td>
                  <td>{player.matchesPlayed ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="leaderboard-footnote">
        Rankings are based on rating, with wins used to break ties.
      </p>
    </section>
  );
}