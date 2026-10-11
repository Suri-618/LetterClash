import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { register, login, me as fetchMe } from "./api";
import { loadAuth, saveAuth, clearAuth, normalizePlayer } from "./auth";
import Leaderboard from "./Leaderboard";
import {
  enableAudio,
  playHit,
  playVictory,
  playDefeat,
  startMusic,
  stopMusic,
  setAudioVolume,
} from "./audio";
import "./App.css";

export default function App() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submittedRound, setSubmittedRound] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [combatEffect, setCombatEffect] = useState(null);
  const [combos, setCombos] = useState({});
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [musicVolume, setMusicVolume] = useState(25);
  const [fightBanner, setFightBanner] = useState(false);
  const [auth, setAuth] = useState(() => loadAuth());
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const previousPhaseRef = useRef(null);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setError("");
    };

    const onDisconnect = () => {
      setConnected(false);
      setRoom(null);
      setPlayerId("");
      setError("Connection lost. Reconnect and create or join a room.");
    };

    const onRoomUpdated = (data) => {
      setRoom(data);
      setRoomCode(data.code);
    };

    const onGameError = (message) => setError(message);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room-updated", onRoomUpdated);
    socket.on("game-error", onGameError);

    if (socket.connected) setConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room-updated", onRoomUpdated);
      socket.off("game-error", onGameError);
    };
  }, []);

  useEffect(() => {
    const stored = loadAuth();
    if (!stored?.token) return;

    let cancelled = false;

    (async () => {
      const result = await fetchMe(stored.token);
      if (cancelled) return;

      if (!result.ok) {
        clearAuth();
        setAuth(null);
        return;
      }

      const player = normalizePlayer(result.data.player);
      saveAuth(stored.token, player);
      setAuth({ token: stored.token, player });
      socket.auth = { token: stored.token };
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSubmittedRound(null);
  }, [room?.currentRound?.id]);

  useEffect(() => {
    const result = room?.lastResult;

    if (!result) return;

    if (result.type === "timeout") {
      setCombos({});
      return;
    }

    if (result.type !== "hit") return;

    setCombos((current) => ({
      ...current,
      [result.attackerId]: (current[result.attackerId] || 0) + 1,
      [result.defenderId]: 0,
    }));

    const effectId = `${result.attackerId}-${result.reactionTimeMs}-${Date.now()}`;

    setCombatEffect({
      id: effectId,
      attackerId: result.attackerId,
      defenderId: result.defenderId,
      damage: result.damage,
    });

    const timer = setTimeout(() => {
      setCombatEffect((current) =>
        current?.id === effectId ? null : current
      );
    }, 1100);

    return () => clearTimeout(timer);
  }, [room?.lastResult]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      if (!room || room.phase !== "playing" || !room.currentRound) {
        return;
      }

      if (submittedRound === room.currentRound.id) return;

      const letter = event.key.toUpperCase();

      if (letter !== room.currentRound.letter) return;

      event.preventDefault();
      setSubmittedRound(room.currentRound.id);

      socket.emit("submit-letter", {
        code: room.code,
        roundId: room.currentRound.id,
        letter,
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [room, submittedRound]);

  function applySocketAuth() {
    socket.auth = auth?.token ? { token: auth.token } : {};
  }

  function handleAuthSuccess(token, player) {
    const normalized = normalizePlayer(player);
    saveAuth(token, normalized);
    setAuth({ token, player: normalized });
    setAuthUsername("");
    setAuthPassword("");
    setAuthError("");

    socket.auth = { token };
    if (socket.connected && !room) {
      socket.disconnect();
      socket.connect();
    }
  }

  function handleLogout() {
    clearAuth();
    setAuth(null);
    setAuthError("");
    socket.auth = {};
    if (socket.connected && !room) {
      socket.disconnect();
      socket.connect();
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (authBusy) return;

    setAuthError("");

    const username = authUsername.trim();
    const email = authEmail.trim();

    if (
      authMode === "register" &&
      (username.length < 3 || username.length > 16)
    ) {
      setAuthError("Username must be 3–16 characters.");
      return;
    }

    if (!email) {
      setAuthError("Enter your email address.");
      return;
    }

    if (authPassword.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }

    setAuthBusy(true);

    const result =
      authMode === "register"
        ? await register({ username, email, password: authPassword })
        : await login({ email, password: authPassword });

    setAuthBusy(false);

    if (!result.ok) {
      setAuthError(result.error || "Authentication failed.");
      return;
    }

    handleAuthSuccess(result.data.token, result.data.player);
    setAuthEmail("");
  }

  function enterRoom(action) {
    const authed = Boolean(auth?.token);
    const cleanName = name.trim();

    if (!authed && !cleanName) {
      setError("Enter your player name first.");
      return;
    }

    if (action === "join" && roomCode.trim().length !== 6) {
      setError("Enter a six-character room code.");
      return;
    }

    setError("");
    setBusy(true);

    const sendRequest = () => {
      const payload =
        action === "create"
          ? { name: cleanName }
          : { name: cleanName, code: roomCode.trim().toUpperCase() };

      socket.emit(
        action === "create" ? "create-room" : "join-room",
        payload,
        (result) => {
          setBusy(false);

          if (!result?.ok) {
            setError(result?.error || "Unable to enter the room.");
            return;
          }

          setPlayerId(result.playerId);
          setRoomCode(result.code);
        }
      );
    };

    applySocketAuth();

    if (socket.connected) {
      sendRequest();
    } else {
      socket.connect();
      socket.once("connect", sendRequest);
      socket.once("connect_error", () => {
        setBusy(false);
        setError("Cannot reach the server. Check that it is running.");
      });
    }
  }

  function leaveRoom() {
    socket.emit("leave-room");
    setRoom(null);
    setPlayerId("");
    setRoomCode("");
    setSubmittedRound(null);
    setError("");
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setError("Room code copied!");
    } catch {
      setError(`Share this code: ${roomCode}`);
    }
  }

  const account = auth?.player || null;
  const players = room?.players || [];
  const me = players.find((player) => player.id === playerId);
  const opponent = players.find((player) => player.id !== playerId);
  const countdown = room?.countdownEndsAt
    ? Math.max(0, Math.ceil((room.countdownEndsAt - now) / 1000))
    : 0;

  const inBattle = room && room.phase !== "waiting";
  const myHp = me?.hp ?? 200;
  const opponentHp = opponent?.hp ?? 200;

  const musicOn = Boolean(
    soundEnabled && room && room.phase !== "waiting"
  );

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

  useEffect(() => {
    if (!soundEnabled) return;
    if (room?.lastResult?.type === "hit") {
      playHit();
    }
  }, [room?.lastResult, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled || room?.phase !== "finished") return;

    if (room.winnerId === playerId) {
      playVictory();
    } else {
      playDefeat();
    }
  }, [room?.phase, room?.winnerId, playerId, soundEnabled]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = room?.phase ?? null;

    if (room?.phase !== "playing" || previousPhase !== "countdown") {
      return;
    }

    setFightBanner(true);

    const timer = setTimeout(() => {
      setFightBanner(false);
    }, 900);

    return () => clearTimeout(timer);
  }, [room?.phase]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">⚔</span>
          LETTER<span>CLASH</span>
        </a>
        <div className="topbar-meta">
          <div className="connection">
            <span className={`dot ${connected ? "online" : ""}`} />
            {connected ? "SERVER CONNECTED" : "SERVER OFFLINE"}
          </div>
          <div className={`account-badge ${account ? "signed-in" : ""}`}>
            {account ? `⬢ ${account.username}` : "GUEST MODE"}
          </div>
        </div>
      </header>

      <div className="audio-controls">
        <button
          type="button"
          onClick={async () => {
            if (soundEnabled) {
              stopMusic();
              setSoundEnabled(false);
            } else {
              const ready = await enableAudio();

              if (ready) {
                setAudioVolume(musicVolume / 100);
                setSoundEnabled(true);
              }
            }
          }}
        >
          {soundEnabled ? "🔊 Sound On" : "🔇 Enable Sound"}
        </button>

        <label>
          Volume: {musicVolume}%
          <input
            type="range"
            min="0"
            max="100"
            value={musicVolume}
            onChange={(event) => {
              const value = Number(event.target.value);
              setMusicVolume(value);
              setAudioVolume(value / 100);
            }}
          />
        </label>
      </div>

      <section className="hero">
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

      {!room ? (
        <>
        <section className="entry-grid">
          <article className="panel">
            <p className="eyebrow">PLAYER SETUP</p>
            <h2>Enter the arena</h2>

            {account ? (
              <div className="account-chip">
                <div>
                  <span className="account-label">SIGNED IN</span>
                  <strong>{account.username}</strong>
                </div>
                <button
                  type="button"
                  className="link-button"
                  onClick={handleLogout}
                >
                  LOG OUT
                </button>
              </div>
            ) : (
              <div className="auth-block">
                <div className="auth-tabs">
                  <button
                    type="button"
                    className={`auth-tab ${authMode === "login" ? "active" : ""}`}
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                    }}
                  >
                    LOG IN
                  </button>
                  <button
                    type="button"
                    className={`auth-tab ${authMode === "register" ? "active" : ""}`}
                    onClick={() => {
                      setAuthMode("register");
                      setAuthError("");
                    }}
                  >
                    SIGN UP
                  </button>
                </div>

                <form className="auth-form" onSubmit={submitAuth}>
                  {authMode === "register" && (
                    <>
                      <label htmlFor="authUsername">USERNAME</label>
                      <input
                        id="authUsername"
                        value={authUsername}
                        maxLength={16}
                        placeholder="YourName"
                        onChange={(e) => setAuthUsername(e.target.value)}
                      />
                    </>
                  )}

                  <label htmlFor="authEmail">EMAIL</label>
                  <input
                    id="authEmail"
                    type="email"
                    value={authEmail}
                    placeholder="you@example.com"
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />

                  <label htmlFor="authPassword">PASSWORD</label>
                  <input
                    id="authPassword"
                    type="password"
                    value={authPassword}
                    placeholder={
                      authMode === "register" ? "8+ characters" : "Your password"
                    }
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={authBusy}
                  >
                    {authBusy
                      ? "PLEASE WAIT..."
                      : authMode === "register"
                        ? "CREATE ACCOUNT"
                        : "LOG IN"}
                  </button>

                  {authError && <p className="message">{authError}</p>}
                </form>

                <div className="separator">
                  <span>OR PLAY AS A GUEST</span>
                </div>
              </div>
            )}

            {!account && (
              <>
                <label htmlFor="playerName">FIGHTER NAME</label>
                <input
                  id="playerName"
                  value={name}
                  maxLength={16}
                  placeholder="Enter your name"
                  onChange={(e) => setName(e.target.value)}
                />
              </>
            )}

            <button
              className="primary-button"
              disabled={busy}
              onClick={() => enterRoom("create")}
            >
              {busy ? "CONNECTING..." : "＋ CREATE A ROOM"}
            </button>

            <div className="separator"><span>OR JOIN A FRIEND</span></div>

            <label htmlFor="roomCode">ROOM CODE</label>
            <input
              id="roomCode"
              className="code-input"
              value={roomCode}
              maxLength={6}
              placeholder="ABC123"
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            />

            <button
              className="secondary-button"
              disabled={busy || roomCode.trim().length !== 6}
              onClick={() => enterRoom("join")}
            >
              JOIN ROOM →
            </button>

            {error && <p className="message">{error}</p>}
          </article>

          <aside className="feature-panel">
            <p className="eyebrow">BATTLE RULES</p>
            <h2>Only the fastest survive.</h2>
            <div className="feature-row">
              <span>01</span>
              <div><strong>200 HP EACH</strong><p>Start with equal health.</p></div>
            </div>
            <div className="feature-row">
              <span>02</span>
              <div><strong>RACE THE LETTER</strong><p>Both players see the same target.</p></div>
            </div>
            <div className="feature-row">
              <span>03</span>
              <div><strong>10–30 DAMAGE</strong><p>Faster accepted reactions deal more damage.</p></div>
            </div>
          </aside>
        </section>

        <Leaderboard />
        </>
      ) : (
        <section className="panel battle-panel">
          <p className="eyebrow">
            {inBattle ? "LIVE BATTLE" : "PRIVATE BATTLE LOBBY"}
          </p>
          <h2>{room.phase === "finished" ? "Battle complete" : "Room " + room.code}</h2>

          <button className="room-code" onClick={copyCode}>
            {room.code} <span>▢ COPY ROOM CODE</span>
          </button>

          <div className="battle-players">
            {[me, opponent].map((player, index) => (
              <div
                className={[
                  "battle-player",
                  index === 0 ? "blue-border" : "purple-border",
                  combatEffect?.defenderId === player?.id ? "hit-flash" : "",
                  combatEffect?.attackerId === player?.id ? "attack-flash" : "",
                  room.winnerId === player?.id ? "winner-card" : "",
                ].filter(Boolean).join(" ")}
                key={player?.id || index}
              >
                <div className={`fighter-avatar ${index === 0 ? "blue-avatar" : "purple-avatar"}`}>
                  P{index + 1}
                </div>
                <p className="eyebrow">
                  {player?.id === playerId ? "YOU" : index === 0 ? "PLAYER ONE" : "PLAYER TWO"}
                </p>
                <h3>{player?.name || "Waiting for rival..."}</h3>

                {(combos[player?.id] || 0) >= 2 && (
                  <div className="combo-badge" key={combos[player?.id]}>
                    COMBO ×{combos[player.id]}
                  </div>
                )}

                {combatEffect && combatEffect.defenderId === player?.id && (
                  <div className="damage-popup" key={combatEffect.id}>
                    −{combatEffect.damage} HP
                  </div>
                )}
                <div className="hp-label">
                  <span>HEALTH</span>
                  <strong>{player?.hp ?? 200} / 200</strong>
                </div>
                <div className="health-track">
                  <div
                    className={`health-fill ${index === 0 ? "blue-fill" : "purple-fill"}`}
                    style={{ width: `${Math.max(0, (player?.hp ?? 200) / 200 * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            className={`arena ${
              room.phase === "finished" ? "victory-arena" : ""
            }`}
          >
            {fightBanner && (
              <div className="fight-overlay" key="fight-banner">
                <div className="fight-banner-text">FIGHT!</div>
                <div className="fight-banner-subtitle">NO MERCY · NO DELAY</div>
              </div>
            )}

            {room.phase === "waiting" && (
              <>
                <p className="eyebrow">ARE YOU READY?</p>
                <h3>{players.length < 2 ? "Waiting for your rival..." : "Both fighters connected!"}</h3>
                {me?.isHost && (
                  <button
                    className="primary-button arena-button"
                    disabled={players.length !== 2}
                    onClick={() => {
                      setError("");
                      socket.emit("start-battle");
                    }}
                  >
                    START BATTLE ⚔
                  </button>
                )}
                {!me?.isHost && <p className="message">The host will start the battle.</p>}
              </>
            )}

            {room.phase === "countdown" && (
              <div className="countdown-stage" key={countdown}>
                <p className="eyebrow countdown-label">PREPARE FOR BATTLE</p>

                <div className="countdown-ring">
                  <div
                    className={`big-count ${countdown === 1 ? "countdown-final" : ""}`}
                    key={countdown}
                  >
                    {countdown > 0 ? countdown : "GO!"}
                  </div>
                </div>

                <p className="countdown-caption">
                  {countdown > 1
                    ? "LOCK IN YOUR REFLEXES"
                    : countdown === 1
                      ? "GET READY TO STRIKE!"
                      : "FIGHT!"}
                </p>
              </div>
            )}

            {room.phase === "playing" && room.currentRound && (
              <>
                <p className="eyebrow">ROUND {room.currentRound.id}</p>
                <div className="big-letter">{room.currentRound.letter}</div>
                <p className="arena-instruction">
                  PRESS <strong>{room.currentRound.letter}</strong> NOW
                </p>
                <div className="round-timer">
                  Time remaining: {Math.max(0, (room.currentRound.deadline - now) / 1000).toFixed(1)}s
                </div>
                {submittedRound === room.currentRound.id && (
                  <p className="message">Input sent — waiting for the server...</p>
                )}
              </>
            )}

            {room.phase === "resolving" && (
              <><p className="eyebrow">ROUND COMPLETE</p><h3>Calculating damage...</h3></>
            )}

            {room.phase === "roundOver" && (
              <>
                <p className="eyebrow">ROUND RESULT</p>
                {room.lastResult?.type === "hit" ? (
                  <>
                    <h3 className="result-hit">
                      {room.lastResult.attackerId === playerId ? "HIT LANDED!" : "YOU WERE HIT!"}
                    </h3>
                    <p>
                      <strong>{room.lastResult.attackerName}</strong> dealt{" "}
                      <strong>{room.lastResult.damage} damage</strong>
                    </p>
                    <p className="muted">
                      Reaction: {room.lastResult.reactionTimeMs} ms
                    </p>
                  </>
                ) : (
                  <h3>{room.lastResult?.message || "Round over"}</h3>
                )}
                <p className="muted">Next round loading...</p>
              </>
            )}

            {room.phase === "finished" && (
              <>
                <p className="eyebrow">FINAL RESULT</p>

                <div className="victory-banner" key={room.winnerId}>
                  {room.winnerId === playerId ? "VICTORY!" : "DEFEATED"}
                </div>

                <div className="big-letter final-letter">
                  {room.winnerId === playerId ? "W" : "L"}
                </div>
                <h3>{room.winnerId === playerId ? "YOU WIN!" : "YOU LOSE!"}</h3>
                <p className="muted">
                  {players.find((player) => player.id === room.winnerId)?.name} wins the battle.
                </p>
                {me?.isHost && (
                  <button
                    className="primary-button arena-button"
                    onClick={() => socket.emit("start-battle")}
                  >
                    PLAY AGAIN
                  </button>
                )}
              </>
            )}
          </div>

          {error && <p className="message">{error}</p>}
          <button className="secondary-button leave-button" onClick={leaveRoom}>
            LEAVE ROOM
          </button>
        </section>
      )}

      <footer>LETTER CLASH © 2026 · MAY THE FASTEST WIN</footer>
    </main>
  );
}
