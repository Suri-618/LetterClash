// Lightweight per-socket flood protection. Generic utility, not
// game-specific. Limits are generous enough for normal play but
// block abusive bursts.

const RATE_LIMITS = {
  "create-room": { max: 5, windowMs: 10000 },
  "join-room": { max: 10, windowMs: 10000 },
  "start-battle": { max: 8, windowMs: 5000 },
  "submit-letter": { max: 20, windowMs: 5000 },
};

const RATE_LIMIT_MESSAGE = "Too many requests. Please slow down.";

function allowEvent(socket, event, now = Date.now()) {
  const limit = RATE_LIMITS[event];
  if (!limit) return true;

  if (!socket.rateState) socket.rateState = {};

  let state = socket.rateState[event];

  if (!state || now > state.resetAt) {
    state = { count: 0, resetAt: now + limit.windowMs };
    socket.rateState[event] = state;
  }

  state.count += 1;
  return state.count <= limit.max;
}

module.exports = { RATE_LIMITS, RATE_LIMIT_MESSAGE, allowEvent };
