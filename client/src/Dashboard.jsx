import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Leaderboard from "./Leaderboard";
import Profile from "./Profile";
import Lobby from "./Lobby";
import FightScreen from "./FightScreen";
import TouchKeyboard from "./TouchKeyboard";
import { useLenis } from "./lenisStore";
import {
  enableAudio,
  playHit,
  playVictory,
  playDefeat,
  startMusic,
  stopMusic,
} from "./audio";

const WRONG_KEY_LOCKOUT_MS = 300;

export default function Dashboard({ authState, game }) {
  const navigate = useNavigate();
  const lenis = useLenis();
  const { account, handleLogout } = authState;
  const {
    room,
    roomCode,
    setRoomCode,
    playerId,
    connected,
    busy,
    error,
    toast,
    battleNotice,
    combos,
    combatEffect,
    matchSaveVersion,
    getServerNow,
    enterRoom,
    leaveRoom,
    copyCode,
    startBattle,
    submitLetter,
  } = game;

  const [name, setName] = useState("");
  const [activeTab, setActiveTab] = useState("play");
  const [profileUsername, setProfileUsername] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [submittedRound, setSubmittedRound] = useState(null);

  const wrongKeyUntilRef = useRef(0);
  const hitResultRef = useRef(null);
  const finishedDoneRef = useRef(false);
  const heroRef = useRef(null);

  const players = room?.players || [];
  const me = players.find((player) => player.id === playerId);
  const inBattle = room && room.phase !== "waiting";
  const hasRoom = Boolean(room);

  const musicOn = Boolean(soundEnabled && room && room.phase !== "waiting");

  useEffect(() => {
    if (musicOn) {
      startMusic();
    } else {
      stopMusic();
    }

    return () => {
      stopMusic();
    };
  }, [musicOn]);

  // Reset the per-round submit guard whenever a new round begins.
  useEffect(() => {
    const reset = window.setTimeout(() => {
      setSubmittedRound(null);
      wrongKeyUntilRef.current = 0;
    }, 0);
    return () => window.clearTimeout(reset);
  }, [room?.currentRound?.id]);

  // Sound effects fire once per unique result (resultId), not on every
  // socket message that recreates the room object.
  useEffect(() => {
    if (!soundEnabled) return;

    const result = room?.lastResult;
    if (!result || result.type !== "hit") return;

    const key = result.resultId || `${result.attackerId}-${result.damage}`;
    if (hitResultRef.current === key) return;
    hitResultRef.current = key;
    playHit();
  }, [room?.lastResult, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled || room?.phase !== "finished") {
      if (room?.phase !== "finished") finishedDoneRef.current = false;
      return;
    }

    if (finishedDoneRef.current) return;
    finishedDoneRef.current = true;

    if (room.winnerId === playerId) {
      playVictory();
    } else {
      playDefeat();
    }
  }, [room?.phase, room?.winnerId, playerId, soundEnabled]);

  const attemptLetter = useCallback(
    (rawLetter) => {
      if (!room || room.phase !== "playing" || !room.currentRound) {
        return false;
      }

      if (submittedRound === room.currentRound.id) return false;

      const letter = String(rawLetter || "").toUpperCase();

      if (!/^[A-Z]$/.test(letter)) return false;

      if (letter !== room.currentRound.letter) {
        // Punching the wrong key locks input for a moment.
        wrongKeyUntilRef.current = Date.now() + WRONG_KEY_LOCKOUT_MS;
        return false;
      }

      if (Date.now() < wrongKeyUntilRef.current) return false;

      setSubmittedRound(room.currentRound.id);
      submitLetter(letter, room.currentRound.id);
      return true;
    },
    [room, submittedRound, submitLetter]
  );

  useEffect(() => {
    function onKeyDown(event) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const letter = event.key.toUpperCase();
      if (!/^[A-Z]$/.test(letter)) return;

      if (attemptLetter(letter)) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attemptLetter]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!lenis || !hero) return;

    const mobileQuery = window.matchMedia("(max-width: 720px)");

    const update = (instance) => {
      if (
        hasRoom ||
        instance.prefersReducedMotion ||
        mobileQuery.matches
      ) {
        hero.style.setProperty("--dashboard-hero-progress", "0");
        return;
      }

      const distance = Math.max(hero.offsetTop + hero.offsetHeight, 1);
      const progress = Math.min(1, Math.max(0, instance.scroll / distance));

      hero.style.setProperty(
        "--dashboard-hero-progress",
        progress.toFixed(4),
      );
    };

    const handleViewportChange = () => update(lenis);

    update(lenis);
    lenis.on("scroll", update);
    mobileQuery.addEventListener("change", handleViewportChange);

    return () => {
      lenis.off("scroll", update);
      mobileQuery.removeEventListener("change", handleViewportChange);
    };
  }, [lenis, hasRoom]);

  async function toggleSound() {
    if (soundEnabled) {
      stopMusic();
      setSoundEnabled(false);
      return;
    }

    const ready = await enableAudio();
    if (ready) {
      setSoundEnabled(true);
    }
  }

  return (
    <main className="app-shell dashboard-shell">
      <header className="topbar">
        <Link className="brand" to="/game">
          <span className="brand-icon">⚔</span>
          LETTER<span>CLASH</span>
        </Link>
        <nav className="dashboard-nav">
          <button
            type="button"
            className={activeTab === "play" ? "active" : ""}
            onClick={() => setActiveTab("play")}
          >
            Play
          </button>

          <button
            type="button"
            className={activeTab === "leaderboard" ? "active" : ""}
            onClick={() => setActiveTab("leaderboard")}
          >
            Leaderboard
          </button>

          <button
            type="button"
            className={activeTab === "profile" ? "active" : ""}
            onClick={() => {
              if (account) {
                setActiveTab("profile");
                setProfileUsername(account.username);
              } else {
                navigate("/auth");
              }
            }}
          >
            My Profile
          </button>
        </nav>
        <div className="topbar-meta">
          <div className="connection">
            <span className={`dot ${connected ? "online" : ""}`} />
            {connected ? "SERVER CONNECTED" : "SERVER OFFLINE"}
          </div>
          <button
            type="button"
            className={`sound-toggle ${soundEnabled ? "is-on" : ""}`}
            onClick={toggleSound}
            aria-label={soundEnabled ? "Disable sound" : "Enable sound"}
            aria-pressed={soundEnabled}
            title={soundEnabled ? "Disable sound" : "Enable sound"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          {account ? (
            <div className="account-badge signed-in">
              {`⬢ ${account.username}`}
            </div>
          ) : (
            <Link className="topbar-auth-link" to="/auth">
              LOGIN / SIGN UP →
            </Link>
          )}
        </div>
      </header>

      <section className="hero" ref={heroRef}>
        <p className="eyebrow">REAL-TIME MULTIPLAYER</p>
        <h1>
          YOUR REFLEXES.
          <br />
          <span>YOUR VICTORY.</span>
        </h1>
        <p className="subtitle">
          Hit the correct letter before your rival.
          <br />
          Every millisecond matters.
        </p>
      </section>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {!room ? (
        <>
          {activeTab === "play" && (
            <Lobby
              account={account}
              name={name}
              setName={setName}
              roomCode={roomCode}
              setRoomCode={setRoomCode}
              busy={busy}
              error={error}
              onEnterRoom={(action, value, fighter) =>
                enterRoom(action, value || account?.username, fighter)
              }
              soundEnabled={soundEnabled}
            />
          )}

          {activeTab === "profile" &&
            (profileUsername || account ? (
              <Profile
                username={profileUsername || account.username}
                onClose={() => setActiveTab("play")}
                onLogout={handleLogout}
              />
            ) : (
              <p>Please log in to view your profile.</p>
            ))}

          {activeTab === "leaderboard" && (
            <Leaderboard
              refreshVersion={matchSaveVersion}
              onSelectPlayer={(username) => {
                setProfileUsername(username);
                setActiveTab("profile");
              }}
            />
          )}
        </>
      ) : (
        <section className="panel battle-panel cyber-battle-panel">
          <p className="eyebrow">
            {inBattle ? "LIVE BATTLE" : "PRIVATE BATTLE LOBBY"}
          </p>
          <h2>
            {room.phase === "finished"
              ? "Battle complete"
              : "Room " + room.code}
          </h2>

          <button className="room-code" onClick={copyCode}>
            {room.code} <span>▢ COPY ROOM CODE</span>
          </button>

          {battleNotice && (
            <p className="battle-notice" role="status">
              {battleNotice}
            </p>
          )}

          <FightScreen
            room={room}
            players={players}
            playerId={playerId}
            combos={combos}
            combatEffect={combatEffect}
            pressed={submittedRound === room.currentRound?.id}
            isHost={Boolean(me?.isHost)}
            getServerNow={getServerNow}
            onPlayAgain={startBattle}
          />

          {["playing", "resolving", "roundOver"].includes(room.phase) &&
            room.currentRound && (
              <TouchKeyboard
                pressed={submittedRound === room.currentRound.id}
                onLetter={attemptLetter}
              />
            )}

          {room.phase === "waiting" && (
            <div className="arena" role="status">
              <p className="eyebrow">ARE YOU READY?</p>
              <h3>
                {players.length < 2
                  ? "Waiting for your rival..."
                  : "Both fighters connected!"}
              </h3>
              <p className="message">
                {players.length < 2
                  ? "The battle starts automatically when your rival joins."
                  : "Preparing the arena..."}
              </p>
            </div>
          )}

          {error && <p className="message">{error}</p>}
          <button
            className="secondary-button leave-button"
            onClick={leaveRoom}
          >
            LEAVE ROOM
          </button>
        </section>
      )}

      <footer>LETTER CLASH © 2026 · MAY THE FASTEST WIN</footer>
    </main>
  );
}
