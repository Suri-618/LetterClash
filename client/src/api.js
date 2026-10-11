import { SERVER_URL } from "./config";

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${SERVER_URL}${path}`, options);
  } catch {
    return { ok: false, error: "Cannot reach the server. Try again." };
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.error || "Something went wrong. Try again.",
    };
  }

  return { ok: true, data };
}

export function register({ username, email, password }) {
  return request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
}

export function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function me(token) {
  return request("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getLeaderboard() {
  return request("/api/leaderboard");
}
