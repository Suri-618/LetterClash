export default function BattleHud({ players, playerId, combos, maxHp }) {
  return (
    <div className="fight-hud">
      {[...players].sort((a, b) => a.slot - b.slot).map((player, index) => {
        const isMe = player?.id === playerId;
        const isBlue = index === 0;
        const connected = player?.connected !== false;
        const hp = Math.max(0, Math.min(maxHp, player?.hp ?? maxHp));
        const hpPercent = (hp / maxHp) * 100;
        const critical = hp <= maxHp * 0.3;
        const combo = combos[player?.id] || 0;

        return (
          <div
            key={player?.id || index}
            className={[
              "fight-hud-player",
              isBlue ? "fight-hud-blue" : "fight-hud-purple",
              isMe ? "fight-hud-current" : "",
              critical ? "fight-hud-critical" : "",
              connected ? "" : "fight-hud-offline",
            ].filter(Boolean).join(" ")}
          >
            <div className="fight-hud-identity">
              <div className="fight-hud-avatar">
                {player?.name?.slice(0, 1).toUpperCase() || "?"}
              </div>

              <div className="fight-hud-details">
                <div className="fight-hud-label">
                  {`PLAYER ${index + 1} · ${isMe ? "YOU" : "RIVAL"}`}
                </div>
                <div className="fight-hud-name">
                  {player?.name || "Waiting..."}
                  {!connected && <em className="fight-hud-reconnecting"> reconnecting…</em>}
                </div>
                {combo >= 2 && (
                  <div className="fight-hud-combo">{combo} HIT COMBO!</div>
                )}
              </div>
            </div>

            <div className="fight-hud-health-info">
              <span>HP</span>
              <strong>{hp}<small> / {maxHp}</small></strong>
            </div>

            <div
              className="fight-hud-health-track"
              role="progressbar"
              aria-label={`${player?.name || `Player ${index + 1}`} health`}
              aria-valuemin={0}
              aria-valuemax={maxHp}
              aria-valuenow={hp}
            >
              <div
                className="fight-hud-health-fill"
                style={{ width: `${hpPercent}%` }}
              />
            </div>

            <div className="fight-hud-status">
              <span>
                {hp <= 0
                  ? "KNOCKED OUT"
                  : critical
                    ? "CRITICAL"
                    : isMe
                      ? "YOUR FIGHTER"
                      : "OPPONENT"}
              </span>
              <span>{Math.round(hpPercent)}%</span>
            </div>
          </div>
        );
      })}

      <div className="fight-hud-vs">VS</div>
    </div>
  );
}
