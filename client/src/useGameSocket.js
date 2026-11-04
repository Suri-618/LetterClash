  import { useCallback, useEffect, useRef, useState } from "react";
  import { socket } from "./socket";
  import { SESSION_STORAGE_KEY } from "./config";

  function readSessionId() {
    try {
      return sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function writeSessionId(sessionId) {
    try {
      if (sessionId) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  export default function useGameSocket({ enabled = false } = {}) {
    const [room, setRoom] = useState(null);
    const [roomCode, setRoomCode] = useState("");
    const [playerId, setPlayerId] = useState("");
    const [connected, setConnected] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");
    const [battleNotice, setBattleNotice] = useState("");
  const [combos, setCombos] = useState({});
  const [combatEffect, setCombatEffect] = useState(null);
  const [matchSaveVersion, setMatchSaveVersion] = useState(0);

    // Difference between the server clock and this device's clock.
    // All countdown/deadline math must use it, so offsets on the
    // player's PC cannot skew the timers.
    const clockOffsetRef = useRef(0);
    const lastRttRef = useRef(0);
    const processedResultRef = useRef(null);
    const combosRef = useRef({});
    const pingTimerRef = useRef(null);

    const getServerNow = useCallback(
      () => Date.now() + clockOffsetRef.current,
      []
    );

    const measurePing = useCallback(() => {
      if (!socket.connected) return;
      const sentAt = Date.now();

      socket.timeout(4000).emit("ping-check", sentAt, (err, data) => {
        if (err) return;

        const receivedAt = Date.now();
        const rtt = receivedAt - sentAt;
        lastRttRef.current = rtt;

        // The server timestamp was taken roughly half a round-trip ago.
        if (Number.isFinite(data?.serverNow)) {
          clockOffsetRef.current = data.serverNow + rtt / 2 - receivedAt;
        }
      });
    }, []);

    useEffect(() => {
      const onConnect = () => {
        setConnected(true);
        setError("");

        const sessionId = readSessionId();
        if (sessionId) {
          socket.emit("resume-session", { sessionId }, (result) => {
            if (!result?.ok) {
              writeSessionId("");
              setRoom(null);
              setPlayerId("");
              setRoomCode("");
            }
          });
        }

        measurePing();
      };

      const onDisconnect = () => {
        setConnected(false);
        // Keep the room on screen: the server holds the seat for a
        // grace period so a brief network blip does not lose the match.
        setBattleNotice("Connection lost. Reconnecting…");
      };

      const onResumed = (data) => {
        setPlayerId(data.playerId);
        setRoomCode(data.code);
        setBattleNotice("");
      };

      const onRoomUpdated = (data) => {
        // Trust the server's clock, not this device's.
        if (Number.isFinite(data.serverNow)) {
          clockOffsetRef.current = data.serverNow - Date.now();
        }

        setRoom(data);
        setRoomCode(data.code);

        if (data.phase === "countdown") {
          combosRef.current = {};
          setCombos({});
          setCombatEffect(null);
        }

        if (
          data.phase === "countdown" ||
          data.phase === "playing" ||
          data.players?.length === 2
        ) {
          setBattleNotice("");
        }
      };

      const onGameError = (message) => setError(message);

    const onMatchSaved = () => {
      setMatchSaveVersion((version) => version + 1);
    };

      const onPlayerLeft = (info) => {
        setBattleNotice(
          info?.name
            ? `${info.name} left the battle.`
            : "Your opponent left the battle."
        );
      };

      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("room-resumed", onResumed);
      socket.on("room-updated", onRoomUpdated);
      socket.on("game-error", onGameError);
    socket.on("match:saved", onMatchSaved);
      socket.on("player-left", onPlayerLeft);

      let initialConnectTimer;
      if (socket.connected) {
        initialConnectTimer = window.setTimeout(() => setConnected(true), 0);
      }

      return () => {
        window.clearTimeout(initialConnectTimer);
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("room-resumed", onResumed);
        socket.off("room-updated", onRoomUpdated);
        socket.off("game-error", onGameError);
      socket.off("match:saved", onMatchSaved);
        socket.off("player-left", onPlayerLeft);
      };
    }, [measurePing]);

    // Connect when the game route mounts so the header reflects server
    // state, and a refreshed tab can resume its saved room session.
    useEffect(() => {
      if (!enabled) return;
      if (!socket.connected) socket.connect();
    }, [enabled]);

    // Refresh the latency estimate periodically.
    useEffect(() => {
      if (!connected) return;

      pingTimerRef.current = window.setInterval(measurePing, 5000);
      return () => window.clearInterval(pingTimerRef.current);
    }, [connected, measurePing]);

    // Apply each round result exactly once, keyed by resultId. Socket
    // messages create a new object each time, which used to double-fire
    // effects and sounds.
    useEffect(() => {
      const result = room?.lastResult;
      if (!result) return;

      const key = result.resultId || null;
      if (key && processedResultRef.current === key) return;
      if (key) processedResultRef.current = key;

      if (result.type === "timeout") {
        const reset = window.setTimeout(() => {
          combosRef.current = {};
          setCombos({});
        }, 0);
        return () => window.clearTimeout(reset);
      }

      if (result.type !== "hit") return;

      const effectId = key || `${result.attackerId}-${Date.now()}`;
      let removeTimer;

      const showTimer = window.setTimeout(() => {
        const combo = (combosRef.current[result.attackerId] || 0) + 1;
        const nextCombos = {
          ...combosRef.current,
          [result.attackerId]: combo,
          [result.defenderId]: 0,
        };

        combosRef.current = nextCombos;
        setCombos(nextCombos);
        setCombatEffect({
          id: effectId,
          attackerId: result.attackerId,
          defenderId: result.defenderId,
          damage: result.damage,
          combo,
          isFinisher: result.remainingHp === 0,
        });

        removeTimer = window.setTimeout(() => {
          setCombatEffect((current) =>
            current?.id === effectId ? null : current
          );
        }, 1100);
      }, 0);

      return () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(removeTimer);
      };
    }, [room?.lastResult]);

    function enterRoom(action, rawName, fighter) {
      const cleanName = (rawName || "").trim();

      if (action === "join" && roomCode.trim().length !== 6) {
        setError("Enter a six-character room code.");
        return;
      }

      if (!cleanName && action === "create") {
        setError("Enter your player name first.");
        return;
      }

      setError("");
      setBusy(true);

      let settled = false;

      const finish = () => {
        if (settled) return false;
        settled = true;
        socket.off("connect", sendRequest);
        socket.off("connect_error", onConnectError);
        return true;
      };

      const onConnectError = (err) => {
        if (!finish()) return;
        setBusy(false);
        const message =
          err?.message && /jwt|authentication token/i.test(err.message)
            ? "Session expired, please log in again"
            : "Cannot reach the server. Check that it is running.";
        setError(message);
      };

      const sendRequest = () => {
        if (!finish()) return;

        const payload =
          action === "create"
            ? { name: cleanName, fighter }
            : {
                name: cleanName,
                code: roomCode.trim().toUpperCase(),
                fighter,
              };

        socket.emit(
          action === "create" ? "create-room" : "join-room",
          payload,
          (result) => {
            setBusy(false);

            if (!result?.ok) {
              setError(result?.error || "Unable to enter the room.");
              return;
            }

            if (result.sessionId) writeSessionId(result.sessionId);
            setPlayerId(result.playerId);
            setRoomCode(result.code);
          }
        );
      };

      if (socket.connected) {
        sendRequest();
      } else {
        socket.connect();
        socket.once("connect", sendRequest);
        socket.once("connect_error", onConnectError);
      }
    }

    function leaveRoom() {
      socket.emit("leave-room");
      writeSessionId("");
      setRoom(null);
      setPlayerId("");
      setRoomCode("");
      setBattleNotice("");
      setError("");
      combosRef.current = {};
      setCombos({});
      setCombatEffect(null);
    }

    function toastMessage(message) {
      setToast(message);
      window.clearTimeout(toastMessage.timer);
      toastMessage.timer = window.setTimeout(() => setToast(""), 2200);
    }

    function clearToast() {
      window.clearTimeout(toastMessage.timer);
      setToast("");
    }

    async function copyCode() {
      try {
        await navigator.clipboard.writeText(roomCode);
        toastMessage("Room code copied!");
      } catch {
        toastMessage(`Share this code: ${roomCode}`);
      }
    }

    function startBattle() {
      setError("");
      socket.emit("start-battle");
    }

    function submitLetter(letter, roundId) {
      socket.emit("submit-letter", {
        code: room?.code,
        roundId,
        letter,
        rttMs: Math.round(lastRttRef.current),
      });
    }

    return {
      room,
      roomCode,
      setRoomCode,
      playerId,
      connected,
      busy,
      error,
      setError,
      toast,
      clearToast,
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
    };
  }
