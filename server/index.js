require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { connectDB } = require("./db");
const Player = require("./models/Player");
const Match = require("./models/Match");
const { evaluateSubmission } = require("./game/rules");
const { createMatchSaver } = require("./game/persistence");
const { allowEvent, RATE_LIMIT_MESSAGE } = require("./lib/rateLimit");

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
].filter(Boolean);

const app = express();

// Render (and most hosts) terminate TLS at a proxy, so the real
// client IP only appears in X-Forwarded-For. Required for per-IP
// limits to work behind the load balancer.
app.set("trust proxy", 1);

app.use(express.json({ limit: "10kb" }));

app.use(cors({
  origin: allowedOrigins,
}));

app.use("/api/auth", require("./routes/auth"));

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

const rooms = new Map();
const playerRooms = new Map();
// sessionId -> { code, playerId }, lets a reconnecting socket
// reclaim its seat within the disconnect grace period.
const sessionIds = new Map();

const FIGHTER_IDS = new Set([
  "kai",
  "maya",
  "syntax",
  "void",
]);
const DEFAULT_FIGHTER_BY_SLOT = { 1: "kai", 2: "maya" };

function normalizeFighter(value, slot) {
  return FIGHTER_IDS.has(value)
    ? value
    : DEFAULT_FIGHTER_BY_SLOT[slot] || "kai";
}

// Per-IP throttle for guest profile creation. Socket reconnects reset
// the per-socket limiter, so this closes the "reconnect and flood the
// database with guest players" hole.
const guestIpWindows = new Map();
const GUEST_IP_LIMIT = {
  max: Number(process.env.GUEST_IP_LIMIT_MAX) || 60,
  windowMs: 10 * 60 * 1000,
};
const GUEST_IP_MESSAGE =
  "Too many new players from this network. Please try again later.";

function clientIp(socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return socket.handshake.address || "unknown";
}

function allowGuestProfile(socket, now = Date.now()) {
  const ip = clientIp(socket);
  let state = guestIpWindows.get(ip);

  if (!state || now > state.resetAt) {
    state = { count: 0, resetAt: now + GUEST_IP_LIMIT.windowMs };
    guestIpWindows.set(ip, state);
  }

  state.count += 1;

  // Opportunistic cleanup so the map cannot grow without bound.
  if (guestIpWindows.size > 5000) {
    for (const [key, value] of guestIpWindows) {
      if (now > value.resetAt) guestIpWindows.delete(key);
    }
  }

  return state.count <= GUEST_IP_LIMIT.max;
}

// Overridable so integration tests can run fast; production uses
// the defaults when these variables are unset.
const STARTING_HP = Number(process.env.STARTING_HP) || 200;
const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS) || 3000;
const ROUND_DURATION_MS = Number(process.env.ROUND_DURATION_MS) || 2500;
const NEXT_ROUND_DELAY_MS = Number(process.env.NEXT_ROUND_DELAY_MS) || 1800;
// A dropped connection (Wi-Fi -> mobile data, etc.) must not
// instantly count as a loss. Keep the seat "disconnected" for this
// long so the player can reconnect and resume.
const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS) || 12000;

const { saveCompletedMatch, recordAbandonment } = createMatchSaver({
  Match,
  Player,
});

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = Array.from(
      { length: 6 },
      () => chars[crypto.randomInt(chars.length)]
    ).join("");
  } while (rooms.has(code));

  return code;
}

async function getOrCreatePlayerProfile(name) {
  const username = name.trim();
  const usernameKey = username.toLowerCase();

  // First, check whether this username already exists.
  const existing = await Player.findOne({ usernameKey })
    .select("+passwordHash");

  if (existing) {
    // Never let a guest use a registered account.
    if (existing.passwordHash) {
      throw new Error(
        "This username belongs to a registered account. Please log in or choose another username."
      );
    }

    // Preserve existing guest profiles and their statistics.
    return existing;
  }

  try {
    return await Player.create({
      username,
      usernameKey,
    });
  } catch (error) {
    // Handle two guests trying to create the same username.
    if (error.code === 11000) {
      const latest = await Player.findOne({ usernameKey })
        .select("+passwordHash");

      if (latest && !latest.passwordHash) {
        return latest;
      }

      throw new Error(
        "Username is unavailable. Please log in or choose another username."
      );
    }

    throw error;
  }
}

function getRoomPlayers(room) {
  return room.players.map((player, index) => ({
    id: player.id,
    name: player.name,
    hp: player.hp,
    slot: index + 1,
    isHost: index === 0,
    connected: player.connected !== false,
    fighter: player.fighter || DEFAULT_FIGHTER_BY_SLOT[index + 1] || null,
  }));
}

function sendRoomUpdate(code) {
  const room = rooms.get(code);
  if (!room) return;

  io.to(code).emit("room-updated", {
    code,
    players: getRoomPlayers(room),
    status: room.players.length === 2 ? "ready" : "waiting",
    phase: room.phase,
    countdownEndsAt: room.countdownEndsAt,
    currentRound: room.currentRound,
    lastResult: room.lastResult,
    winnerId: room.winnerId,
    paused: room.paused === true,
    matchNumber: room.matchNumber,
    maxHp: STARTING_HP,
    serverNow: Date.now(),
  });
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

// Hard removal: the player is really gone (explicit leave, or the
// grace period expired). Records an abandonment loss if a battle was
// in progress, then tears the seat down.
function removePlayer(socket) {
  removePlayerById(socket.id, socket);
}

function removePlayerById(playerId, socket) {
  const code = playerRooms.get(playerId);
  if (!code) return;

  const room = rooms.get(code);
  playerRooms.delete(playerId);

  if (!room) return;

  const departing = room.players.find(
    (player) => player.id === playerId
  );

  if (departing) {
    if (departing.disconnectTimer) {
      clearTimeout(departing.disconnectTimer);
      departing.disconnectTimer = null;
    }

    const session = sessionIds.get(departing.sessionId);
    if (session && session.playerId === playerId) {
      sessionIds.delete(departing.sessionId);
    }
  }

  if (socket) socket.leave(code);

  // Quitting a battle in progress counts as a loss, so leaving
  // cannot be used to dodge a defeat.
  if (departing) {
    void recordAbandonment(room, departing);
  }

  clearRoomTimer(room);
  room.players = room.players.filter(
    (player) => player.id !== playerId
  );

  room.currentRound = null;
  room.countdownEndsAt = null;
  room.lastResult = null;
  room.winnerId = null;
  room.paused = false;
  room.phase = "waiting";

  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }

  // Let the remaining player know their opponent is gone.
  if (departing) {
    io.to(code).emit("player-left", {
      name: departing.name,
      remaining: room.players.length,
    });
  }

  sendRoomUpdate(code);
}

// Soft disconnect: keep the seat warm and start a grace timer. The
// player can reconnect with their session id and resume the match.
function handleDisconnect(socket) {
  const code = playerRooms.get(socket.id);

  if (!code) {
    return;
  }

  const room = rooms.get(code);

  if (!room) return;

  const player = room.players.find((entry) => entry.id === socket.id);
  if (!player) return;

  player.connected = false;

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
  }

  // Freeze an in-progress round so the absent player is not
  // unfairly timed out while they are reconnecting. The phase is
  // kept so the match still counts as an abandonment if the grace
  // period expires.
  if (
    room.phase === "countdown" ||
    room.phase === "playing" ||
    room.phase === "resolving" ||
    room.phase === "roundOver"
  ) {
    clearRoomTimer(room);
    room.paused = true;
    room.currentRound = null;
    room.countdownEndsAt = null;
  }

  player.disconnectTimer = setTimeout(() => {
    const liveRoom = rooms.get(code);

    if (!liveRoom) return;

    const stillThere = liveRoom.players.find(
      (entry) => entry.id === socket.id
    );

    if (stillThere && stillThere.connected === false) {
      removePlayerById(socket.id, null);
    }
  }, DISCONNECT_GRACE_MS);

  sendRoomUpdate(code);
}

// Reconnect a previously-disconnected player to their old seat.
function resumePlayer(socket, sessionId) {
  const session = sessionIds.get(sessionId);

  if (!session) {
    return false;
  }

  const room = rooms.get(session.code);

  if (!room) {
    sessionIds.delete(sessionId);
    return false;
  }

  const player = room.players.find(
    (entry) => entry.id === session.playerId
  );

  if (!player) {
    sessionIds.delete(sessionId);
    return false;
  }

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }

  // Drop the stale mapping for the socket that dropped.
  playerRooms.delete(session.playerId);

  player.connected = true;
  player.id = socket.id;
  player.sessionId = sessionId;

  playerRooms.set(socket.id, session.code);
  sessionIds.set(sessionId, {
    code: session.code,
    playerId: socket.id,
  });

  socket.join(session.code);

  socket.emit("room-resumed", {
    code: session.code,
    playerId: socket.id,
    slot: room.players.findIndex((entry) => entry.id === socket.id) + 1,
  });

  // The match was paused when they dropped; restart the round for
  // both players once both seats are connected again.
  if (room.paused) {
    if (room.players.every((entry) => entry.connected !== false)) {
      room.paused = false;
      room.phase = "countdown";
      room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
      room.currentRound = null;
      room.lastResult = null;
      sendRoomUpdate(session.code);

      room.timer = setTimeout(() => {
        const liveRoom = rooms.get(session.code);
        if (!liveRoom || liveRoom !== room) return;
        if (liveRoom.players.some((entry) => entry.connected === false)) {
          return;
        }
        startRound(session.code);
      }, COUNTDOWN_MS);
    } else {
      // The other player is still away; keep showing the paused state.
      sendRoomUpdate(session.code);
    }

    return true;
  }

  sendRoomUpdate(session.code);
  maybeAutoStart(session.code);
  return true;
}

function getPlayerRoom(socket) {
  const code = playerRooms.get(socket.id);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  return { code, room };
}

function beginBattle(code) {
  const room = rooms.get(code);

  if (!room) return "Room not found.";

  if (room.players.length !== 2) return "Two players are required.";

  if (room.players.some((player) => player.connected === false)) {
    return "Your opponent is reconnecting. Wait for them to return.";
  }

  if (room.phase !== "waiting" && room.phase !== "finished") {
    return "The battle has already started.";
  }

  clearRoomTimer(room);

  room.matchNumber += 1;
  room.matchId = crypto.randomUUID();
  room.roundCounter = 0;
  room.matchSaved = false;
  room.matchSaving = false;
  room.abandonmentCounted = false;
  room.roundsResolved = 0;
  room.paused = false;

  room.players.forEach((player) => {
    player.hp = STARTING_HP;
  });

  room.phase = "countdown";
  room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  room.currentRound = null;
  room.lastResult = null;
  room.winnerId = null;

  sendRoomUpdate(code);

  room.timer = setTimeout(() => {
    if (rooms.get(code) !== room || room.players.length !== 2) return;
    startRound(code);
  }, COUNTDOWN_MS);

  return null;
}

function maybeAutoStart(code) {
  const room = rooms.get(code);

  if (!room || room.phase !== "waiting") return;
  if (room.players.length !== 2) return;
  if (room.players.some((player) => player.connected === false)) return;

  beginBattle(code);
}

function startBattle(code, socket) {
  const room = rooms.get(code);

  if (!room) {
    socket.emit("game-error", "Room not found.");
    return;
  }

  if (room.players[0]?.id !== socket.id) {
    socket.emit("game-error", "Only the host can start the battle.");
    return;
  }

  const error = beginBattle(code);
  if (error) socket.emit("game-error", error);
}

function startRound(code) {
  const room = rooms.get(code);
  if (!room || room.players.length !== 2) return;
  if (room.phase === "finished" || room.paused) return;
  if (room.players.some((player) => player.connected === false)) return;

  clearRoomTimer(room);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letter = alphabet[crypto.randomInt(alphabet.length)];

  room.phase = "playing";
  room.lastResult = null;
  room.countdownEndsAt = null;
  room.roundCounter += 1;

  room.currentRound = {
    id: room.roundCounter,
    letter,
    startedAt: Date.now(),
    deadline: Date.now() + ROUND_DURATION_MS,
  };

  const roundId = room.currentRound.id;

  sendRoomUpdate(code);

  room.timer = setTimeout(() => {
    const currentRoom = rooms.get(code);

    if (
      currentRoom !== room ||
      currentRoom.phase !== "playing" ||
      currentRoom.currentRound?.id !== roundId
    ) {
      return;
    }

    // No correct answer: no damage, move to the next round.
    room.lastResult = {
      type: "timeout",
      resultId: `${room.matchNumber}:${roundId}:timeout`,
      roundId,
      message: "Too slow! No damage this round.",
    };
    room.roundsResolved = (room.roundsResolved || 0) + 1;
    room.currentRound = null;
    room.phase = "roundOver";

    sendRoomUpdate(code);

    room.timer = setTimeout(() => {
      if (rooms.get(code) === room && room.players.length === 2) {
        startRound(code);
      }
    }, NEXT_ROUND_DELAY_MS);
  }, ROUND_DURATION_MS);
}

function submitLetter(socket, payload = {}) {
  const membership = getPlayerRoom(socket);

  if (!membership) return;

  const { code, room } = membership;

  // Validation (round id, letter, deadline, membership) lives in
  // the pure rules module so it can be unit-tested.
  const decision = evaluateSubmission(room, socket.id, payload);

  if (!decision.accepted) return;

  const { attacker, defender, damage, reactionTimeMs } = decision;

  const roundId = room.currentRound?.id ?? room.roundCounter;

  // Lock the round immediately. Only one answer can win.
  room.phase = "resolving";
  clearRoomTimer(room);

  defender.hp = Math.max(0, defender.hp - damage);

  room.lastResult = {
    type: "hit",
    resultId: `${room.matchNumber}:${roundId}`,
    roundId,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    damage,
    reactionTimeMs,
    remainingHp: defender.hp,
  };

  room.currentRound = null;
  room.countdownEndsAt = null;

  room.roundsResolved = (room.roundsResolved || 0) + 1;

  if (defender.hp <= 0) {
    room.phase = "finished";
    room.winnerId = attacker.id;

    sendRoomUpdate(code);

    void saveCompletedMatch(code, room)
      .then((result) => {
        if (!result?.saved) return;

        io.to(code).emit("match:saved", {
          matchId: room.matchId,
          matchNumber: room.matchNumber,
        });
      })
      .catch((error) => {
        console.error("Match save notification failed:", error);
      });

    return;
  }

  room.phase = "roundOver";
  sendRoomUpdate(code);

  room.timer = setTimeout(() => {
    if (rooms.get(code) === room && room.players.length === 2) {
      startRound(code);
    }
  }, NEXT_ROUND_DELAY_MS);
}

app.get("/", (req, res) => {
  res.send("Letter Clash battle server is running!");
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    // Only registered accounts are ranked. Guests can pick any name,
    // so their stats must never influence the leaderboard.
    const players = await Player.find({
      passwordHash: { $exists: true, $ne: null },
    })
      .select("username wins losses matchesPlayed rating")
      .sort({ wins: -1, rating: -1 })
      .limit(50)
      .lean();

    res.json({ players });
  } catch (error) {
    console.error("Leaderboard error:", error.message);
    res.status(500).json({ error: "Could not load leaderboard." });
  }
});

app.get("/api/players/:username", async (req, res) => {
  try {
    const usernameKey = req.params.username.trim().toLowerCase();

    const player = await Player.findOne({ usernameKey })
      .select("username wins losses matchesPlayed rating createdAt passwordHash")
      .lean();

    if (!player) {
      return res.status(404).json({ error: "Player not found." });
    }

    const isRegistered = Boolean(player.passwordHash);
    delete player.passwordHash;

    // Same eligibility rules as /api/leaderboard: registered players only.
    // Ties share a rank.
    let rank = null;
    if (isRegistered) {
      rank =
        (await Player.countDocuments({
          passwordHash: { $exists: true, $ne: null },
          $or: [
            { wins: { $gt: player.wins } },
            {
              wins: player.wins,
              rating: { $gt: player.rating },
            },
          ],
        })) + 1;
    }

    res.json({ player: { ...player, rank } });
  } catch (error) {
    console.error("Player lookup error:", error.message);
    res.status(500).json({ error: "Could not load player profile." });
  }
});

app.get("/api/players/:username/matches", async (req, res) => {
  try {
    const usernameKey = req.params.username.trim().toLowerCase();

    const player = await Player.findOne({ usernameKey }).select("_id");

    if (!player) {
      return res.status(404).json({ error: "Player not found." });
    }

    const matches = await Match.find({
      "players.playerId": player._id,
    })
      .select("roomCode players winnerId winnerUsername completedAt")
      .sort({ completedAt: -1 })
      .limit(20)
      .lean();

    res.json({ matches });
  } catch (error) {
    console.error("Match history error:", error.message);
    res.status(500).json({ error: "Could not load match history." });
  }
});

io.use(async (socket, next) => {
  const token =
    typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token
      : "";

  socket.player = null;

  // No token means this is an intentional guest connection.
  if (!token) {
    return next();
  }

  try {
    if (!process.env.JWT_SECRET) {
      return next(new Error("Authentication is not configured."));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
  });

    if (
      typeof payload.sub !== "string" ||
      !mongoose.isValidObjectId(payload.sub)
    ) {
      return next(new Error("Invalid authentication token."));
    }

    const player = await Player.findById(payload.sub)
      .select("_id username usernameKey")
      .lean();

    if (!player) {
      return next(new Error("Player account not found."));
    }

    socket.player = player;
    return next();
  } catch (error) {
    return next(new Error("Invalid or expired authentication token."));
  }
});

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.rateState = {};

  socket.on("create-room", async ({ name, fighter } = {}, callback = () => {}) => {
    if (!allowEvent(socket, "create-room")) {
      return callback({ ok: false, error: RATE_LIMIT_MESSAGE });
    }

    if (playerRooms.has(socket.id)) {
      return callback({
        ok: false,
        error: "Leave your current room first.",
      });
    }

    let profile;

    if (socket.player) {
      // Authenticated: trust the verified account, never the typed name.
      profile = socket.player;
    } else {
      const playerName =
        typeof name === "string" ? name.trim().slice(0, 16) : "";

      if (playerName.length < 3) {
        return callback({
          ok: false,
          error: "Username must be at least 3 characters.",
        });
      }

      if (!allowGuestProfile(socket)) {
        return callback({ ok: false, error: GUEST_IP_MESSAGE });
      }

      try {
        profile = await getOrCreatePlayerProfile(playerName);
      } catch (error) {
        console.error("Player profile error:", error.message);
        return callback({
          ok: false,
          error: "Could not create your player profile. Try again.",
        });
      }
    }

    const code = generateRoomCode();
    const sessionId = crypto.randomUUID();

    const room = {
      code,
      players: [{
        id: socket.id,
        sessionId,
        profileId: profile._id,
        name: profile.username,
        hp: STARTING_HP,
        fighter: normalizeFighter(fighter, 1),
        connected: true,
        disconnectTimer: null,
      }],
      phase: "waiting",
      countdownEndsAt: null,
      currentRound: null,
      roundCounter: 0,
      matchNumber: 0,
      matchSaved: false,
      matchSaving: false,
      lastResult: null,
      winnerId: null,
      timer: null,
    };

    rooms.set(code, room);
    playerRooms.set(socket.id, code);
    sessionIds.set(sessionId, { code, playerId: socket.id });
    socket.join(code);

    callback({ ok: true, code, playerId: socket.id, slot: 1, sessionId });
    sendRoomUpdate(code);

    console.log(`${profile.username} created room ${code}`);
  });

  socket.on("join-room", async ({ code, name, fighter } = {}, callback = () => {}) => {
    if (!allowEvent(socket, "join-room")) {
      return callback({ ok: false, error: RATE_LIMIT_MESSAGE });
    }

    if (playerRooms.has(socket.id)) {
      return callback({
        ok: false,
        error: "Leave your current room first.",
      });
    }

    const roomCode =
      typeof code === "string" ? code.trim().toUpperCase() : "";

    const room = rooms.get(roomCode);

    if (!room) {
      return callback({
        ok: false,
        error: "Room not found. Check the room code.",
      });
    }

    if (room.players.length >= 2) {
      return callback({ ok: false, error: "This room is already full." });
    }

    let profile;

    if (socket.player) {
      // Authenticated: trust the verified account, never the typed name.
      profile = socket.player;
    } else {
      const playerName =
        typeof name === "string" ? name.trim().slice(0, 16) : "";

      if (!playerName) {
        return callback({ ok: false, error: "Enter a player name." });
      }

      if (playerName.length < 3) {
        return callback({
          ok: false,
          error: "Username must be at least 3 characters.",
        });
      }

      if (!allowGuestProfile(socket)) {
        return callback({ ok: false, error: GUEST_IP_MESSAGE });
      }

      try {
        profile = await getOrCreatePlayerProfile(playerName);
      } catch (error) {
        console.error("Player profile error:", error.message);
        return callback({
          ok: false,
          error: "Could not load your player profile. Try again.",
        });
      }
    }

    if (
      String(room.players[0]?.profileId) === String(profile._id)
    ) {
      return callback({
        ok: false,
        error: "Choose a different username from the host.",
      });
    }

    const sessionId = crypto.randomUUID();

    room.players.push({
      id: socket.id,
      sessionId,
      profileId: profile._id,
      name: profile.username,
      hp: STARTING_HP,
      fighter: normalizeFighter(fighter, 2),
      connected: true,
      disconnectTimer: null,
    });

    playerRooms.set(socket.id, roomCode);
    sessionIds.set(sessionId, { code: roomCode, playerId: socket.id });
    socket.join(roomCode);

    callback({
      ok: true,
      code: roomCode,
      playerId: socket.id,
      slot: 2,
      sessionId,
    });
    sendRoomUpdate(roomCode);
    maybeAutoStart(roomCode);

    console.log(`${profile.username} joined room ${roomCode}`);
  });

  socket.on("start-battle", () => {
    if (!allowEvent(socket, "start-battle")) return;

    const membership = getPlayerRoom(socket);
    if (membership) startBattle(membership.code, socket);
  });

  socket.on("submit-letter", (payload) => {
    if (!allowEvent(socket, "submit-letter")) return;

    submitLetter(socket, payload);
  });

  // Round-trip probe so the client can report real latency and the
  // server can compensate reaction times fairly.
  socket.on("ping-check", (_clientTime, callback = () => {}) => {
    if (typeof callback === "function") {
      callback({ serverNow: Date.now() });
    }
  });

  // Reclaim a seat after a dropped connection (within the grace window).
  socket.on("resume-session", ({ sessionId } = {}, callback = () => {}) => {
    if (typeof sessionId !== "string") {
      return callback({ ok: false });
    }

    const resumed = resumePlayer(socket, sessionId);
    callback({ ok: resumed });
  });

  if (typeof socket.handshake.auth?.sessionId === "string") {
    resumePlayer(socket, socket.handshake.auth.sessionId);
  }

  socket.on("leave-room", () => {
    removePlayer(socket);
  });

  socket.on("disconnect", () => {
    handleDisconnect(socket);
    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await connectDB();

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Letter Clash server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

// Only boot when run directly, so tests can import the app without
// binding a port or connecting to the database.
if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  httpServer,
  io,
  startServer,
  createMatchSaver,
};
