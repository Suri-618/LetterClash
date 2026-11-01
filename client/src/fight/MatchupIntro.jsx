import { useEffect, useState } from "react";
import { getFighter } from "./fighterConfig.js";
import "./MatchupIntro.css";

export default function MatchupIntro({
  roomCode,
  matchNumber,
  left,
  right,
  active,
  reducedMotion = false,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active || !left || !right) {
      setVisible(false);
      return undefined;
    }

    const storageKey = `letterclash:matchup:${roomCode}:${matchNumber}`;
    if (sessionStorage.getItem(storageKey)) {
      setVisible(false);
      return undefined;
    }

    sessionStorage.setItem(storageKey, "1");
    setVisible(true);

    const timer = window.setTimeout(
      () => setVisible(false),
      reducedMotion ? 850 : 1450
    );

    return () => window.clearTimeout(timer);
  }, [active, left, right, roomCode, matchNumber, reducedMotion]);

  if (!visible || !left || !right) return null;

  const leftFighter = getFighter(left.fighter);
  const rightFighter = getFighter(right.fighter);

  return (
    <div
      className={`fs-matchup-intro${reducedMotion ? " is-reduced" : ""}`}
      key={`matchup-${matchNumber}`}
      aria-hidden="true"
    >
      <div
        className="fs-matchup-side is-left"
        style={{
          "--fighter-color": leftFighter.color,
          "--fighter-glow": leftFighter.glow,
        }}
      >
        <img src={leftFighter.image} alt="" />
        <div className="fs-matchup-tag">
          <small>PLAYER 1</small>
          <strong>{leftFighter.name}</strong>
          <span>{leftFighter.title}</span>
        </div>
      </div>

      <div
        className="fs-matchup-side is-right"
        style={{
          "--fighter-color": rightFighter.color,
          "--fighter-glow": rightFighter.glow,
        }}
      >
        <img src={rightFighter.image} alt="" />
        <div className="fs-matchup-tag">
          <small>PLAYER 2</small>
          <strong>{rightFighter.name}</strong>
          <span>{rightFighter.title}</span>
        </div>
      </div>

      <div className="fs-matchup-vs">
        <span>VS</span>
      </div>

      <div className="fs-matchup-stripes" />
    </div>
  );
}
