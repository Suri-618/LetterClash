import { useEffect, useState } from "react";
import { register, login, me as fetchMe } from "./api";
import { loadAuth, saveAuth, clearAuth, normalizePlayer } from "./auth";
import { SESSION_STORAGE_KEY } from "./config";
import { socket } from "./socket";

function readSessionId() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function applySocketAuth(token) {
  socket.auth = { token: token || "", sessionId: readSessionId() };
}

export default function useAuth({ navigate }) {
  const [auth, setAuth] = useState(() => loadAuth());
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const stored = loadAuth();
    if (!stored?.token) return;

    let cancelled = false;

    (async () => {
      const result = await fetchMe(stored.token);
      if (cancelled) return;

      if (!result.ok) {
        // Only clear the saved session when the server explicitly
        // rejects it. A network blip must not log the player out.
        if (result.status === 401 || result.status === 403) {
          clearAuth();
          setAuth(null);
          applySocketAuth("");
        }

        return;
      }

      const player = normalizePlayer(result.data.player);
      saveAuth(stored.token, player);
      setAuth({ token: stored.token, player });
      applySocketAuth(stored.token);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleAuthSuccess(token, player) {
    const normalized = normalizePlayer(player);
    saveAuth(token, normalized);
    setAuth({ token, player: normalized });
    setAuthUsername("");
    setAuthPassword("");
    setAuthError("");

    applySocketAuth(token);

    if (socket.connected) {
      socket.disconnect();
      socket.connect();
    }

    navigate("/game");
  }

  function handleLogout() {
    clearAuth();
    setAuth(null);
    setAuthError("");
    applySocketAuth("");

    if (socket.connected) {
      socket.disconnect();
    }

    navigate("/");
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

  return {
    auth,
    account: auth?.player || null,
    authMode,
    setAuthMode,
    authUsername,
    setAuthUsername,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authBusy,
    authError,
    submitAuth,
    handleLogout,
    applySocketAuth,
  };
}
