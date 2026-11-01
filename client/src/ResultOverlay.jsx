import { useEffect, useState } from "react";
import { getFighter } from "./fight/fighterConfig.js";

export default function ResultOverlay({
  room,
  players,
  playerId,
  isHost,
  onPlayAgain,
}) {
  const isWinner = room.winnerId === playerId;
  const winner = players.find((player) => player.id === room.winnerId);
  const winnerName = winner
    ? getFighter(winner.fighter).name
    : "Winner";

  // The restart has no server ack, so block double submissions and
  // re-enable if the request was rejected.
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => setPending(false), 2000);
    return () => clearTimeout(timer);
  }, [pending]);

  function handlePlayAgain() {
    if (pending) return;
    setPending(true);
    onPlayAgain?.();
  }

  return (
    <div
      className="match-finished-overlay"
      role="status"
      aria-live="polite"
      data-lenis-prevent
    >
      <div
        className={`match-finished-caption ${
          isWinner ? "is-victory" : "is-defeat"
        }`}
      >
        {isWinner ? "VICTORY!" : "DEFEATED"}
      </div>

      <div className="match-finished-winner">{winnerName} WINS</div>

      {isHost && (
        <button
          type="button"
          className="match-play-again"
          onClick={handlePlayAgain}
          disabled={pending}
        >
          {pending ? "STARTING…" : "PLAY AGAIN"}
        </button>
      )}
    </div>
  );
}
