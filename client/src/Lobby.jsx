import { useRef, useState } from "react";
import { FIGHTER_ROSTER, getFighter } from "./fight/fighterConfig.js";
import { playLock, playSelect } from "./audio.js";
import { useScrollReveal } from "./useScrollReveal";
import "./FighterSelect.css";

export default function Lobby({
  account,
  name,
  setName,
  roomCode,
  setRoomCode,
  busy,
  error,
  onEnterRoom,
  soundEnabled = false,
}) {
  const [selectedFighter, setSelectedFighter] = useState("kai");
  const [previewFighter, setPreviewFighter] = useState("kai");
  const [stampNonce, setStampNonce] = useState(0);
  const lobbyRef = useRef(null);
  const cardRefs = useRef([]);

  const fighter = getFighter(previewFighter);
  const selected = getFighter(selectedFighter);
  const activeIndex = Math.max(
    0,
    FIGHTER_ROSTER.findIndex((item) => item.id === fighter.id)
  );

  useScrollReveal(lobbyRef, {
    selector: ".fighter-select-shell",
    threshold: 0.05,
    rootMargin: "0px 0px -30px 0px",
  });

  const preview = (id) => {
    if (id === previewFighter) return;
    setPreviewFighter(id);
    if (soundEnabled) playSelect();
  };

  const lockIn = (id) => {
    if (id !== previewFighter) setPreviewFighter(id);
    setSelectedFighter(id);
    setStampNonce((value) => value + 1);
    if (soundEnabled) playLock();
  };

  const handleCardKeyDown = (event, index) => {
    const moves = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };

    const delta = moves[event.key];
    if (!delta) return;

    event.preventDefault();
    const next =
      (index + delta + FIGHTER_ROSTER.length) % FIGHTER_ROSTER.length;
    const nextFighter = FIGHTER_ROSTER[next];

    setPreviewFighter(nextFighter.id);
    if (soundEnabled) playSelect();
    cardRefs.current[next]?.focus();
  };

  return (
    <section className="entry-grid arcade-lobby" ref={lobbyRef}>
      <article className="panel arcade-lobby-panel">
        <div className="lobby-heading">
          <div>
            <p className="eyebrow">PLAYER 01 · CHARACTER SELECT</p>
            <h2>
              Choose your fighter<span>.</span>
            </h2>
            <p className="fighter-select-subtitle">
              BROWSE THE ROSTER. LOCK YOUR CHAMPION. EVERY LETTER COUNTS.
            </p>
          </div>

          <div className="lobby-fighter-count">
            <strong>04</strong>
            <span>FIGHTERS AVAILABLE</span>
          </div>
        </div>

        <div
          className="fighter-select-shell"
          style={{
            "--fighter-color": fighter.color,
            "--fighter-glow": fighter.glow,
          }}
        >
          <div className="fighter-select-hero">
            <div className="fighter-select-gridlines" aria-hidden="true" />

            <div className="fighter-select-preview" aria-hidden="true">
              <span className="fighter-select-ghost">{fighter.number}</span>
              <span className="fighter-select-vert">{fighter.title}</span>
              <img
                key={`preview-${fighter.id}`}
                src={fighter.image}
                alt=""
                draggable="false"
              />
              <div className="fighter-select-nameplate">
                <small>FIGHTER {fighter.number}</small>
                <strong>{fighter.name}</strong>
              </div>
            </div>

            <div className="fighter-select-bio">
              <p className="fighter-select-kicker">
                {fighter.number} // {fighter.title}
              </p>
              <h3>{fighter.name}</h3>

              <div className="fighter-select-ability">
                <span>ABILITY</span>
                <strong>{fighter.ability}</strong>
                <p>{fighter.description}</p>
              </div>

              <div className="fighter-select-special">
                <span>SPECIAL MOVE</span>
                <p>{fighter.special}</p>
              </div>

              <div className="fighter-select-locked">
                <i
                  className={
                    selectedFighter === fighter.id ? "is-live" : ""
                  }
                />
                {selectedFighter === fighter.id
                  ? `${fighter.name} LOCKED IN`
                  : `${selected.name} LOCKED IN`}
              </div>
            </div>
          </div>

          <div className="fighter-select-picker">
            <div
              className="fighter-select-grid-wrap"
              style={{ "--cursor-col": activeIndex }}
            >
              <span className="fighter-select-cursor" aria-hidden="true">
                P1
              </span>

              <div
                className="fighter-select-grid"
                role="radiogroup"
                aria-label="Choose your fighter"
              >
                {FIGHTER_ROSTER.map((item, index) => {
                  const isActive = fighter.id === item.id;
                  const isSelected = selectedFighter === item.id;

                  return (
                    <button
                      key={item.id}
                      ref={(node) => {
                        cardRefs.current[index] = node;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${item.name}, ${item.title}. ${item.ability}.`}
                      tabIndex={isActive ? 0 : -1}
                      className={[
                        "fighter-select-card",
                        isActive ? "is-active" : "",
                        isSelected ? "is-selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        "--fighter-color": item.color,
                        "--fighter-glow": item.glow,
                      }}
                      onMouseEnter={() => preview(item.id)}
                      onFocus={() => preview(item.id)}
                      onClick={() => lockIn(item.id)}
                      onKeyDown={(event) => handleCardKeyDown(event, index)}
                    >
                      <span className="fighter-select-card-number">
                        {item.number}
                      </span>

                      <span className="fighter-select-card-art">
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          draggable="false"
                        />
                      </span>

                      <span className="fighter-select-card-copy">
                        <strong>{item.name}</strong>
                        <small>{item.ability}</small>
                      </span>

                      {isActive && (
                        <span
                          className="fighter-select-flash"
                          key={`flash-${item.id}-${stampNonce}`}
                          aria-hidden="true"
                        />
                      )}

                      {isSelected && (
                        <span
                          className="fighter-select-stamp"
                          key={`stamp-${item.id}-${stampNonce}`}
                          aria-hidden="true"
                        >
                          LOCKED
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="fighter-select-hint">
              <span>ARROWS</span> BROWSE <span>ENTER</span> LOCK
            </p>
          </div>
        </div>

        <div className="lobby-controls fighter-select-controls">
          {!account && (
            <div className="lobby-field">
              <label htmlFor="playerName">FIGHTER NAME</label>
              <input
                id="playerName"
                value={name}
                maxLength={16}
                placeholder="Enter your name"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <button
            type="button"
            className="primary-button lobby-create-button"
            disabled={busy}
            onClick={() => onEnterRoom("create", name, selectedFighter)}
          >
            {busy ? "CONNECTING..." : "＋ CREATE A ROOM"}
          </button>

          <div className="lobby-join-area">
            <div className="lobby-join-heading">
              <span />
              OR JOIN A FRIEND
              <span />
            </div>

            <div className="lobby-join-controls">
              <div className="lobby-field">
                <label htmlFor="roomCode">ROOM CODE</label>
                <input
                  id="roomCode"
                  className="code-input"
                  value={roomCode}
                  maxLength={6}
                  placeholder="ABC123"
                  onChange={(e) =>
                    setRoomCode(e.target.value.toUpperCase())
                  }
                />
              </div>

              <button
                type="button"
                className="secondary-button"
                disabled={busy || roomCode.trim().length !== 6}
                onClick={() => onEnterRoom("join", name, selectedFighter)}
              >
                JOIN ROOM →
              </button>
            </div>
          </div>

          {error && <p className="message">{error}</p>}
        </div>
      </article>

      <aside className="feature-panel arcade-rules-panel">
        <div className="rules-heading">
          <div>
            <p className="eyebrow">BATTLE RULES</p>
            <h2>
              Only the fastest survive<span>.</span>
            </h2>
          </div>
          <span className="rules-vs">VS</span>
        </div>

        <div className="rules-list">
          <div className="feature-row">
            <span>01</span>
            <div>
              <strong>200 HP EACH</strong>
              <p>Start with equal health.</p>
            </div>
          </div>

          <div className="feature-row">
            <span>02</span>
            <div>
              <strong>RACE THE LETTER</strong>
              <p>Both players see the same target.</p>
            </div>
          </div>

          <div className="feature-row">
            <span>03</span>
            <div>
              <strong>10–30 DAMAGE</strong>
              <p>Faster accepted reactions deal more damage.</p>
            </div>
          </div>
        </div>

        <div className="arcade-versus-preview" aria-hidden="true">
          <span>PLAYER 01</span>
          <strong>VS</strong>
          <span>PLAYER 02</span>
        </div>
      </aside>
    </section>
  );
}
