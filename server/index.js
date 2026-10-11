require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { connectDB } = require("./db");

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
].filter(Boolean);

const app = express();
app.use(cors({
  origin: allowedOrigins,
}));

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

function calculateDamage(reactionTimeMs) {
  if (reactionTimeMs < 200) return 30;
  if (reactionTimeMs < 350) return 25;
  if (reactionTimeMs < 500) return 20;
  if (reactionTimeMs < 700) return 15;
  return 10;
}

function submitLetter(socket, payload = {}) {
  const membership = getPlayerRoom(socket);

  if (!membership) return;

  const { code, room } = membership;
  const round = room.currentRound;

  if (room.phase !== "playing" || !round) return;
  if (room.players.length !== 2) return;

  // The player must belong to this room.
  const attacker = room.players.find(
    (player) => player.id === socket.id
  );

  if (!attacker) return;

  // Reject stale round IDs and incorrect letters.
  if (payload.roundId !== round.id) return;

  const submittedLetter =
    typeof payload.letter === "string"
      ? payload.letter.toUpperCase()
      : "";

  if (submittedLetter !== round.letter) return;

  const now = Date.now();

  if (now > round.deadline) return;

  // Lock the round immediately. Only one answer can win.
  room.phase = "resolving";
  clearRoomTimer(room);

  const reactionTimeMs = Math.max(0, now - round.startedAt);
  const damage = calculateDamage(reactionTimeMs);

  const defender = room.players.find(
    (player) => player.id !== attacker.id
  );

  if (!defender) return;

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

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create-room", ({ name } = {}, callback = () => {}) => {
    if (playerRooms.has(socket.id)) {
      return callback({
        ok: false,
        error: "Leave your current room first.",
      });
    }

    const playerName =
      typeof name === "string" ? name.trim().slice(0, 16) : "";

    if (!playerName) {
      return callback({ ok: false, error: "Enter a player name." });
    }

    const code = generateRoomCode();

    const room = {
      code,
      players: [{ id: socket.id, name: playerName, hp: STARTING_HP }],
      phase: "waiting",
      countdownEndsAt: null,
      currentRound: null,
      roundCounter: 0,
      lastResult: null,
      winnerId: null,
      timer: null,
    };

    rooms.set(code, room);
    playerRooms.set(socket.id, code);
    socket.join(code);

    callback({ ok: true, code, playerId: socket.id, slot: 1 });
    sendRoomUpdate(code);

    console.log(`${playerName} created room ${code}`);
  });

  socket.on("join-room", ({ code, name } = {}, callback = () => {}) => {
    if (playerRooms.has(socket.id)) {
      return callback({
        ok: false,
        error: "Leave your current room first.",
      });
    }

    const roomCode =
      typeof code === "string" ? code.trim().toUpperCase() : "";

    const playerName =
      typeof name === "string" ? name.trim().slice(0, 16) : "";

    if (!playerName) {
      return callback({ ok: false, error: "Enter a player name." });
    }

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

    room.players.push({
      id: socket.id,
      name: playerName,
      hp: STARTING_HP,
    });

    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    callback({ ok: true, code: roomCode, playerId: socket.id, slot: 2 });
    sendRoomUpdate(roomCode);

    console.log(`${playerName} joined room ${roomCode}`);
  });

  socket.on("start-battle", () => {
    const membership = getPlayerRoom(socket);
    if (membership) startBattle(membership.code, socket);
  });

  socket.on("submit-letter", (payload) => {
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

startServer();
