import { useEffect, useMemo, useRef, useState } from "react";
import ArcadeFighter from "./ArcadeFighter.jsx";
import MatchupIntro from "./fight/MatchupIntro.jsx";
import { getFighter } from "./fight/fighterConfig.js";
import ResultOverlay from "./ResultOverlay.jsx";
import "./FightScreen.css";

// Matches the damage tiers in server/game/rules.js
function gradeFor(damage) {
  if (damage >= 30) return "PERFECT";
  if (damage >= 25) return "GREAT";
  if (damage >= 20) return "GOOD";
  if (damage >= 15) return "OK";
  return "SLOW";
}

const FIGHTER_SPRITES = {
  kai: "kai",
  maya: "maya",
  syntax: "syntax",
  void: "void",
  azure: "cyan-fighter",
  crimson: "purple-fighter",
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

// Ticks only while `active`, so idle screens don't re-render 10x a second.
function useNow(active, nowFn, interval = 100) {
  const [now, setNow] = useState(() => nowFn());

  useEffect(() => {
    if (!active) return undefined;
    const initial = setTimeout(() => setNow(nowFn()), 0);
    const id = setInterval(() => setNow(nowFn()), interval);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [active, nowFn, interval]);

  return now;
}

function PlayerPanel({ player, side, isMe, combo, maxHp }) {
  const hp = Math.max(0, Math.min(maxHp, player?.hp ?? maxHp));
  const pct = (hp / maxHp) * 100;
  const critical = Boolean(player) && pct <= 30;

  // Hold the old health for a beat so the gold trail shows the damage
  // before it catches up with the colored fill.
  const [lagPct, setLagPct] = useState(pct);

  useEffect(() => {
    if (pct >= lagPct) {
      // Healing or initial health: move the trail with the fill.
      const reset = setTimeout(() => setLagPct(pct), 0);
      return () => clearTimeout(reset);
    }

    // Keep the old value briefly after taking damage.
    const timer = setTimeout(() => setLagPct(pct), 40);
    return () => clearTimeout(timer);
  }, [pct, lagPct]);

  const className = [
    "fs-panel",
    `fs-${side}`,
    critical ? "is-critical" : "",
    isMe ? "is-me" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="fs-meta">
        <span className="fs-name">{player?.name ?? "Waiting…"}</span>
        {isMe && <span className="fs-you">YOU</span>}
        <span className="fs-hp">{player ? hp : "--"}</span>
      </div>

      <div
        className="fs-bar"
        role="progressbar"
        aria-label={`${player?.name ?? "Player"} health`}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-valuenow={hp}
      >
        <div className="fs-well">
          <div className="fs-lag" style={{ width: `${lagPct}%` }} />
          <div className="fs-fill" style={{ width: `${pct}%` }} />
          <div className="fs-ticks" />
        </div>
      </div>

      <div className="fs-combo-row">
        {combo >= 2 && (
          <span
            className={`fs-combo${combo >= 3 ? " is-hot" : ""}`}
            key={combo}
          >
            {combo} HIT COMBO
          </span>
        )}
      </div>
    </div>
  );
}

export default function FightScreen({
  room,
  players,
  playerId,
  combos,
  combatEffect,
  pressed = false,
  isHost = false,
  getServerNow = Date.now,
  onPlayAgain,
}) {
  const phase = room.phase;
  const reducedMotion = usePrefersReducedMotion();
  const now = useNow(
    phase === "countdown" || phase === "playing",
    getServerNow
  );
  const maxHp = room.maxHp || 200;
  const [showResult, setShowResult] = useState(false);

  const roster = [...players].sort((a, b) => a.slot - b.slot);
  const left = roster.find((p) => p.slot === 1);
  const right = roster.find((p) => p.slot === 2);
  const winner = roster.find((p) => p.id === room.winnerId);
  const winnerLabel = winner ? getFighter(winner.fighter).name : "WINNER";

  // The server resets its round counter at the start of each match, but
  // guard against the match boundary here too so a stale room payload
  // can never show last match's round number.
  const matchNumber = room.matchNumber;
  const lastMatchRef = useRef(matchNumber);
  const lastRoundRef = useRef(0);

  if (matchNumber !== lastMatchRef.current) {
    lastMatchRef.current = matchNumber;
    lastRoundRef.current = 0;
  }

  if (room.currentRound) lastRoundRef.current = room.currentRound.id;

  const roundNumber = Math.max(
    1,
    lastRoundRef.current + (phase === "countdown" ? 1 : 0)
  );

  // "FIGHT!" banner: shown once when the countdown hands over to play.
  const prevPhase = useRef(null);
  const fightTimer = useRef(null);
  const [showFight, setShowFight] = useState(false);

  useEffect(() => {
    const previous = prevPhase.current;
    prevPhase.current = phase;

    if (phase === "playing" && previous === "countdown") {
      setShowFight(true);
      clearTimeout(fightTimer.current);
      fightTimer.current = setTimeout(() => setShowFight(false), 900);
    }
  }, [phase]);

  useEffect(() => () => clearTimeout(fightTimer.current), []);

  useEffect(() => {
    if (phase !== "finished") {
      setShowResult(false);
      return undefined;
    }

    const timer = setTimeout(
      () => setShowResult(true),
      reducedMotion ? 650 : 2500
    );

    return () => clearTimeout(timer);
  }, [phase, room.matchNumber, reducedMotion]);

  const countdown = room.countdownEndsAt
    ? Math.max(0, Math.ceil((room.countdownEndsAt - now) / 1000))
    : 0;

  const remaining = room.currentRound
    ? Math.max(0, (room.currentRound.deadline - now) / 1000)
    : null;

  // The draining bar is a pure CSS animation, so it stays smooth
  // between the 100 ms ticks. Recomputed only when the round changes.
  const roundId = room.currentRound?.id;
  const drain = useMemo(() => {
    const round = room.currentRound;
    if (!round) return null;
    const total = Math.max(300, round.deadline - round.startedAt);
    const elapsed = Math.min(
      total,
      Math.max(0, getServerNow() - round.startedAt)
    );
    return { total, elapsed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const result = room.lastResult;
  const defenderSlot = roster.find(
    (p) => p.id === combatEffect?.defenderId
  )?.slot;
  const impactSide = defenderSlot === 2 ? "right" : "left";

  return (
    <div className="fs-root">
      {/* ---------- HUD ---------- */}
      <div className="fs-hud">
        <PlayerPanel
          player={left}
          side="left"
          isMe={left?.id === playerId}
          combo={combos[left?.id] || 0}
          maxHp={maxHp}
        />

        <div className="fs-clock" aria-live="off">
          <div className="fs-clock-shape">
            <div className="fs-clock-face">
              <span className="fs-clock-label">ROUND {roundNumber}</span>
              <span
                className={`fs-clock-value${
                  remaining !== null && remaining < 1 ? " is-urgent" : ""
                }`}
              >
                {phase === "playing" && remaining !== null
                  ? remaining.toFixed(1)
                  : "VS"}
              </span>
            </div>
          </div>
        </div>

        <PlayerPanel
          player={right}
          side="right"
          isMe={right?.id === playerId}
          combo={combos[right?.id] || 0}
          maxHp={maxHp}
        />
      </div>

      {/* ---------- STAGE ---------- */}
      <div className="arcade-fight-stage fs-stage">
        {roster.map((player) => {
          const isPurple = player.slot === 2;
          const fighterColor =
            FIGHTER_SPRITES[player.fighter] ||
            (isPurple ? "purple-fighter" : "cyan-fighter");
          const isAttacking = combatEffect?.attackerId === player.id;
          const isHit = combatEffect?.defenderId === player.id;
          const combo = combos[player.id] || 0;

          const fighterClass = [
            "arcade-fighter",
            `arcade-fighter-${player.fighter || (isPurple ? "purple" : "cyan")}`,
            isPurple ? "arcade-fighter-purple" : "arcade-fighter-cyan",
            isPurple ? "faces-left" : "faces-right",
            combo >= 3 ? "combo-hot" : "",
            isAttacking ? "fighter-punch" : "",
            isHit ? "fighter-recoil" : "",
            isHit ? (isPurple ? "recoil-right" : "recoil-left") : "",
          ]
            .filter(Boolean)
            .join(" ");

          const pose = isHit ? "hit" : isAttacking ? "punch" : "idle";

          return (
            <div className={fighterClass} key={player.id}>
              <ArcadeFighter
                key={`${player.id}-${combatEffect?.id || "idle"}-${pose}`}
                color={fighterColor}
                pose={pose}
                facing={isPurple ? "left" : "right"}
                animationId={combatEffect?.id || null}
              />
            </div>
          );
        })}

        <MatchupIntro
          roomCode={room.code}
          matchNumber={room.matchNumber}
          left={left}
          right={right}
          active={phase === "countdown"}
          reducedMotion={reducedMotion}
        />

        {combatEffect && defenderSlot && (
          <div
            className={`fs-damage is-${impactSide}`}
            key={`damage-${combatEffect.id}`}
          >
            <b>−{combatEffect.damage}</b>
            <i>{gradeFor(combatEffect.damage)}</i>
          </div>
        )}

        {/* Target letter: a keycap that sinks when you press it */}
        {phase === "playing" && room.currentRound && drain && (
          <div className="fs-prompt" key={room.currentRound.id}>
            <div className={`fs-key${pressed ? " is-pressed" : ""}`}>
              {room.currentRound.letter}
            </div>
            <span className="fs-sr">Type or tap {room.currentRound.letter}</span>
            <div className="fs-drain" aria-hidden="true">
              <i
                style={{
                  animationDuration: `${drain.total}ms`,
                  animationDelay: `-${drain.elapsed}ms`,
                }}
              />
            </div>
          </div>
        )}

        {/* Round result, drawn over the stage so nothing shifts */}
        {phase === "roundOver" && result?.type === "hit" && (
          <div
            className={`fs-callout ${
              result.attackerId === playerId ? "is-good" : "is-bad"
            }`}
            role="status"
          >
            <strong>
              {result.attackerId === playerId ? "YOU HIT" : "YOU GOT HIT"}
            </strong>
            <span>
              {gradeFor(result.damage)} · {result.reactionTimeMs} ms
            </span>
          </div>
        )}

        {phase === "roundOver" && result?.type === "timeout" && (
          <div className="fs-callout is-miss" role="status">
            <strong>TOO SLOW</strong>
            <span>No damage this round</span>
          </div>
        )}

        {phase === "countdown" && (
          <div className="fs-countdown" key={countdown}>
            <span className="fs-countdown-label">GET READY</span>
            <span className="fs-countdown-num">
              {countdown > 0 ? countdown : "GO"}
            </span>
          </div>
        )}

        {showFight && (
          <div className="fs-fight" aria-hidden="true">
            <span>FIGHT!</span>
          </div>
        )}

        {room.paused && (
          <div
            className="fight-overlay paused-overlay"
            role="status"
            aria-live="polite"
          >
            <div className="fight-banner-text">RECONNECTING</div>
            <div className="fight-banner-subtitle">
              MATCH PAUSED · WAITING FOR PLAYER
            </div>
          </div>
        )}

        {phase === "finished" && !showResult && (
          <div className="fs-ko-banner" role="status">
            <strong>K.O.</strong>
            <span>{winnerLabel}</span>
          </div>
        )}

        {phase === "finished" && showResult && (
          <ResultOverlay
            room={room}
            players={players}
            playerId={playerId}
            isHost={isHost}
            onPlayAgain={onPlayAgain}
          />
        )}
      </div>
    </div>
  );
}
