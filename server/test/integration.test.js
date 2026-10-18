// End-to-end integration tests: the real Socket.IO server driven by
// two socket.io-client connections against a real MongoDB running as
// an in-memory single-node replica set (needed for transactions).
//
// Covers: room creation/joining, server-authoritative damage, single
// round resolution, invalid submissions, match persistence, duplicate
// protection, abandonment losses and rate limiting.

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const {
  test,
  before,
  after,
  beforeEach,
  afterEach,
} = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { io: ioClient } = require("socket.io-client");
const { RATE_LIMIT_MESSAGE } = require("../lib/rateLimit");
const Player = require("../models/Player");
const Match = require("../models/Match");

const HOST_NAME = "Hostman";
const GUEST_NAME = "Challenger";
const HOST_KEY = HOST_NAME.toLowerCase();
const GUEST_KEY = GUEST_NAME.toLowerCase();

// Prefer an already-installed MongoDB binary so tests never have to
// download one. Falls back to mongodb-memory-server's download if the
// system binary cannot be found.
function findSystemMongod() {
  if (process.env.MONGOMS_SYSTEM_BINARY) {
    return process.env.MONGOMS_SYSTEM_BINARY;
  }

  const candidates = [];

  if (process.platform === "win32") {
    const base = "C:\\Program Files\\MongoDB\\Server";
    try {
      for (const version of fs.readdirSync(base)) {
        candidates.push(path.join(base, version, "bin", "mongod.exe"));
      }
    } catch {
      // MongoDB may be installed elsewhere; fall through to download.
    }
  } else {
    candidates.push("/usr/bin/mongod", "/usr/local/bin/mongod");
  }

  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

let replSet;
let httpServer;
let io;
let baseUrl;
let createMatchSaver;
let clients = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  check,
  { timeout = 5000, interval = 10, message = "condition" } = {}
) {
  const started = Date.now();

  for (;;) {
    if (await check()) return;

    if (Date.now() - started > timeout) {
      throw new Error(`Timed out after ${timeout}ms waiting for ${message}`);
    }

    await sleep(interval);
  }
}

function createClient() {
  const socket = ioClient(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });

  const state = {
    connected: false,
    room: null,
    updates: [],
    playerLeft: null,
    gameError: null,
  };

  socket.on("connect", () => {
    state.connected = true;
  });

  socket.on("room-updated", (room) => {
    state.room = room;
    state.updates.push(room);
  });

  socket.on("player-left", (payload) => {
    state.playerLeft = payload;
  });

  socket.on("game-error", (message) => {
    state.gameError = message;
  });

  const client = { socket, state };
  clients.push(client);
  return client;
}

async function connectClient() {
  const client = createClient();
  await waitUntil(() => client.state.connected, { message: "socket connect" });
  return client;
}

function emitAck(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`No ack for "${event}" within ${timeout}ms`)),
      timeout
    );

    socket.emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

// Every room-updated payload received after `marker` is inspected, so
// short-lived round states cannot be missed between polls.
function updatesSince(client, marker) {
  return client.state.updates.slice(marker);
}

function playerBySlot(room, slot) {
  return room.players.find((player) => player.slot === slot);
}

async function setupRoom() {
  const host = await connectClient();
  const guest = await connectClient();

  const created = await emitAck(host.socket, "create-room", { name: HOST_NAME });
  assert.equal(created.ok, true, "host should create a room");
  await waitUntil(() => host.state.room?.players.length === 1, {
    message: "host room update",
  });

  const joined = await emitAck(guest.socket, "join-room", {
    code: created.code,
    name: GUEST_NAME,
  });
  assert.equal(joined.ok, true, "guest should join the room");
  await waitUntil(() => guest.state.room?.players.length === 2, {
    message: "guest room update",
  });

  return { host, guest, code: created.code };
}

async function waitForPlaying(client) {
  await waitUntil(
    () => client.state.room?.phase === "playing" && client.state.room.currentRound,
    { message: "round to start", timeout: 5000 }
  );
}

before(
  async () => {
    process.env.STARTING_HP = "100";
    process.env.COUNTDOWN_MS = "60";
    process.env.ROUND_DURATION_MS = "1500";
    process.env.NEXT_ROUND_DELAY_MS = "60";
    process.env.PORT = "0";

    const systemBinary = findSystemMongod();
    if (systemBinary) {
      process.env.MONGOMS_SYSTEM_BINARY = systemBinary;
    }

    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replSet.getUri();

    // Required only after the env overrides above are in place, since
    // index.js reads its constants at load time.
    const serverModule = require("../index");
    createMatchSaver = serverModule.createMatchSaver;
    httpServer = serverModule.httpServer;
    io = serverModule.io;

    await serverModule.startServer();
    await waitUntil(() => httpServer.listening, { message: "server listening" });

    const { port } = httpServer.address();
    baseUrl = `http://127.0.0.1:${port}`;
  },
  { timeout: 120000 }
);

after(async () => {
  for (const client of clients) client.socket.disconnect();
  clients = [];

  if (io) io.close();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  await Match.deleteMany({});
  await Player.deleteMany({});
});

afterEach(async () => {
  for (const client of clients) client.socket.disconnect();
  clients = [];
  // Give any in-flight persistence a moment before the next test
  // clears the collections.
  await sleep(200);
});

test("a room accepts only two players", async () => {
  const { code } = await setupRoom();

  const third = await connectClient();
  const response = await emitAck(third.socket, "join-room", {
    code,
    name: "Thirdwheel",
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /full/i);
});

test("joining an unknown room code is rejected", async () => {
  const client = await connectClient();

  const response = await emitAck(client.socket, "join-room", {
    code: "ZZZZZZ",
    name: "Nobody",
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /not found/i);
});

test("both players receive the round once the battle starts", async () => {
  const { host, guest } = await setupRoom();

  host.socket.emit("start-battle");

  await waitForPlaying(host);
  await waitForPlaying(guest);

  assert.equal(host.state.room.status, "ready");
  assert.equal(host.state.room.phase, "playing");
  assert.match(host.state.room.currentRound.letter, /^[A-Z]$/);
});

test("damage is calculated on the server and client values are ignored", async () => {
  const { host, guest } = await setupRoom();
  host.socket.emit("start-battle");
  await waitForPlaying(guest);

  const marker = guest.state.updates.length;
  const { currentRound } = guest.state.room;

  guest.socket.emit("submit-letter", {
    letter: currentRound.letter,
    roundId: currentRound.id,
    damage: 9999,
    opponentHp: 0,
  });

  await waitUntil(
    () => updatesSince(guest, marker).some((u) => u.lastResult?.type === "hit"),
    { message: "server-resolved hit" }
  );

  const result = updatesSince(guest, marker).find(
    (u) => u.lastResult?.type === "hit"
  ).lastResult;

  assert.ok(
    [10, 15, 20, 25, 30].includes(result.damage),
    `unexpected damage ${result.damage}`
  );
  assert.equal(result.defenderId, host.socket.id);
  assert.equal(result.remainingHp, 100 - result.damage);
});

test("wrong letters and stale round ids do not resolve the round", async () => {
  const { host, guest } = await setupRoom();
  host.socket.emit("start-battle");
  await waitForPlaying(guest);

  const { currentRound } = guest.state.room;
  const wrong = currentRound.letter === "A" ? "B" : "A";

  guest.socket.emit("submit-letter", { letter: wrong, roundId: currentRound.id });
  guest.socket.emit("submit-letter", {
    letter: currentRound.letter,
    roundId: currentRound.id + 1000,
  });

  await sleep(200);

  assert.equal(guest.state.room.phase, "playing");
  assert.equal(guest.state.room.lastResult, null);
});

test("only the first correct answer resolves a round", async () => {
  const { host, guest } = await setupRoom();
  host.socket.emit("start-battle");
  await waitForPlaying(guest);

  const marker = guest.state.updates.length;
  const { currentRound } = guest.state.room;

  guest.socket.emit("submit-letter", {
    letter: currentRound.letter,
    roundId: currentRound.id,
  });

  await waitUntil(
    () => updatesSince(guest, marker).some((u) => u.lastResult?.type === "hit"),
    { message: "first hit" }
  );

  const hpAfterFirstHit = updatesSince(guest, marker).find(
    (u) => u.lastResult?.type === "hit"
  ).lastResult.remainingHp;

  // The host now tries to answer the same, already-resolved round.
  host.socket.emit("submit-letter", {
    letter: currentRound.letter,
    roundId: currentRound.id,
  });

  await sleep(200);

  assert.equal(playerBySlot(guest.state.room, 1).hp, hpAfterFirstHit);
});

test("a finished match is persisted once with atomic statistics", async () => {
  const { host, guest } = await setupRoom();
  host.socket.emit("start-battle");

  for (let round = 0; round < 60; round += 1) {
    await waitForPlaying(guest);

    const marker = guest.state.updates.length;
    const { currentRound } = guest.state.room;

    guest.socket.emit("submit-letter", {
      letter: currentRound.letter,
      roundId: currentRound.id,
    });

    await waitUntil(
      () => updatesSince(guest, marker).some((u) => u.lastResult),
      { message: "round resolved" }
    );

    if (guest.state.room.phase === "finished") break;
  }

  assert.equal(guest.state.room.phase, "finished");
  assert.equal(guest.state.room.winnerId, guest.socket.id);

  await waitUntil(async () => (await Match.countDocuments()) === 1, {
    message: "match saved",
    timeout: 8000,
  });

  const winner = await Player.findOne({ usernameKey: GUEST_KEY });
  const loser = await Player.findOne({ usernameKey: HOST_KEY });

  assert.equal(winner.wins, 1);
  assert.equal(winner.matchesPlayed, 1);
  assert.equal(loser.losses, 1);
  assert.equal(loser.matchesPlayed, 1);
});

test("re-saving the same match key never double-counts", async () => {
  const alpha = await Player.create({ username: "Alpha", usernameKey: "alpha" });
  const bravo = await Player.create({ username: "Bravo", usernameKey: "bravo" });

  const saver = createMatchSaver({ Match, Player });

  const snapshot = {
    code: "TESTRM",
    matchNumber: 1,
    phase: "finished",
    matchSaved: false,
    matchSaving: false,
    winnerId: "socket-alpha",
    players: [
      { id: "socket-alpha", profileId: alpha._id, name: "Alpha", hp: 40 },
      { id: "socket-bravo", profileId: bravo._id, name: "Bravo", hp: 0 },
    ],
  };

  await saver.saveCompletedMatch("TESTRM", snapshot);
  await saver.saveCompletedMatch("TESTRM", snapshot);
  await saver.saveCompletedMatch("TESTRM", snapshot);

  assert.equal(await Match.countDocuments({ roomCode: "TESTRM" }), 1);

  const alphaAfter = await Player.findById(alpha._id);
  const bravoAfter = await Player.findById(bravo._id);

  assert.equal(alphaAfter.wins, 1);
  assert.equal(alphaAfter.matchesPlayed, 1);
  assert.equal(bravoAfter.losses, 1);
  assert.equal(bravoAfter.matchesPlayed, 1);
});

test("leaving mid-battle records an abandonment and notifies the survivor", async () => {
  const { host, guest } = await setupRoom();
  host.socket.emit("start-battle");
  await waitForPlaying(host);

  guest.socket.disconnect();

  await waitUntil(() => host.state.playerLeft !== null, {
    message: "player-left notice",
  });

  assert.equal(host.state.playerLeft.name, GUEST_NAME);
  assert.equal(host.state.playerLeft.remaining, 1);

  await waitUntil(
    async () =>
      (await Match.countDocuments({ roomCode: host.state.room.code })) === 1,
    { message: "abandonment saved", timeout: 8000 }
  );

  const survivor = await Player.findOne({ usernameKey: HOST_KEY });
  const leaver = await Player.findOne({ usernameKey: GUEST_KEY });

  assert.equal(survivor.wins, 1);
  assert.equal(survivor.matchesPlayed, 1);
  assert.equal(leaver.losses, 1);
  assert.equal(leaver.matchesPlayed, 1);
});

test("flooding create-room is rate limited", async () => {
  const client = await connectClient();

  const calls = [];
  for (let i = 0; i < 25; i += 1) {
    calls.push(emitAck(client.socket, "create-room", { name: "Flooder" }, 4000));
  }

  const responses = await Promise.all(calls);
  const limited = responses.filter(
    (response) => response?.error === RATE_LIMIT_MESSAGE
  ).length;

  assert.ok(
    limited >= 15,
    `expected the rate limiter to block most calls, only ${limited} blocked`
  );
});
