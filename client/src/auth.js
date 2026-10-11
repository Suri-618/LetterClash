const STORAGE_KEY = "letterclash.auth";

export function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.player) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function saveAuth(token, player) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, player }));
  } catch {
    // Storage unavailable: the session still lives in memory.
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function normalizePlayer(player) {
  if (!player) return null;
  return { ...player, id: player.id || player._id };
}
