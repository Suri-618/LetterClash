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

const STARTING_HP = 200;
const COUNTDOWN_MS = 3000;
const ROUND_DURATION_MS = 2500;
const NEXT_ROUND_DELAY_MS = 1800;

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
  });
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function removePlayer(socket) {
  const code = playerRooms.get(socket.id);
  if (!code) return;

  const room = rooms.get(code);
  playerRooms.delete(socket.id);
  socket.leave(code);

  if (!room) return;

  const departing = room.players.find(
    (player) => player.id === socket.id
  );

  // Quitting a battle in progress counts as a loss, so leaving
  // cannot be used to dodge a defeat.
  if (departing) {
    void recordAbandonment(room, departing);
  }

  clearRoomTimer(room);
  room.players = room.players.filter(
    (player) => player.id !== socket.id
  );

  room.currentRound = null;
  room.countdownEndsAt = null;
  room.lastResult = null;
  room.winnerId = null;
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

function getPlayerRoom(socket) {
  const code = playerRooms.get(socket.id);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  return { code, room };
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

  if (room.players.length !== 2) {
    socket.emit("game-error", "Two players are required.");
    return;
  }

  if (room.phase !== "waiting" && room.phase !== "finished") {
    socket.emit("game-error", "The battle has already started.");
    return;
  }

  clearRoomTimer(room);

  room.matchNumber += 1;
  room.matchSaved = false;
  room.matchSaving = false;

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
}

function startRound(code) {
  const room = rooms.get(code);
  if (!room || room.players.length !== 2) return;
  if (room.phase === "finished") return;

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

  sendRoomUpdate(code);

  room.timer = setTimeout(() => {
    const currentRoom = rooms.get(code);

    if (
      currentRoom !== room ||
      currentRoom.phase !== "playing" ||
      currentRoom.currentRound?.id !== room.currentRound?.id
    ) {
      return;
    }

    // No correct answer: no damage, move to the next round.
    room.lastResult = {
      type: "timeout",
      message: "Too slow! No damage this round.",
    };
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

  // Lock the round immediately. Only one answer can win.
  room.phase = "resolving";
  clearRoomTimer(room);

  defender.hp = Math.max(0, defender.hp - damage);

  room.lastResult = {
    type: "hit",
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

  if (defender.hp <= 0) {
    room.phase = "finished";
    room.winnerId = attacker.id;

    sendRoomUpdate(code);

    void saveCompletedMatch(code, room);

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
    const players = await Player.find({})
      .select("username wins losses matchesPlayed rating")
      .sort({ rating: -1, wins: -1 })
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
      .select("username wins losses matchesPlayed rating createdAt")
      .lean();

    if (!player) {
      return res.status(404).json({ error: "Player not found." });
    }

    res.json({ player });
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

    const payload = jwt.verify(token, process.env.JWT_SECRET);

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

  socket.on("create-room", async ({ name } = {}, callback = () => {}) => {
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

    const room = {
      code,
      players: [{
        id: socket.id,
        profileId: profile._id,
        name: profile.username,
        hp: STARTING_HP,
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
    socket.join(code);

    callback({ ok: true, code, playerId: socket.id, slot: 1 });
    sendRoomUpdate(code);

    console.log(`${profile.username} created room ${code}`);
  });

  socket.on("join-room", async ({ code, name } = {}, callback = () => {}) => {
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

    room.players.push({
      id: socket.id,
      profileId: profile._id,
      name: profile.username,
      hp: STARTING_HP,
    });

    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    callback({ ok: true, code: roomCode, playerId: socket.id, slot: 2 });
    sendRoomUpdate(roomCode);

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

  socket.on("leave-room", () => {
    removePlayer(socket);
  });

  socket.on("disconnect", () => {
    removePlayer(socket);
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
