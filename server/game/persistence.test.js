const test = require("node:test");
const assert = require("node:assert/strict");

const {
  persistMatch,
  persistMatchWithRetry,
  createMatchSaver,
} = require("./persistence");

// In-memory stand-ins for the Mongoose models. They mimic just enough
// of the API (transactions, unique key errors, $inc updates) to test
// the persistence contract without a live MongoDB connection.
function createFakeModels() {
  const state = {
    matches: [],
    increments: {},
    failCreateTimes: 0,
  };

  const Match = {
    async startSession() {
      return {
        async withTransaction(fn) {
          return fn();
        },
        async endSession() {},
      };
    },
    async create(docs) {
      if (state.failCreateTimes > 0) {
        state.failCreateTimes -= 1;
        throw new Error("transient failure");
      }

      const doc = docs[0];

      if (state.matches.some((match) => match.matchKey === doc.matchKey)) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }

      state.matches.push(doc);
      return docs;
    },
  };

  const Player = {
    async updateOne(filter, update) {
      const id = String(filter._id);
      const bucket =
        state.increments[id] ||
        (state.increments[id] = { wins: 0, losses: 0, matchesPlayed: 0 });

      bucket.wins += update.$inc.wins || 0;
      bucket.losses += update.$inc.losses || 0;
      bucket.matchesPlayed += update.$inc.matchesPlayed || 0;

      return { acknowledged: true };
    },
  };

  return { Match, Player, state };
}

const PLAYERS = [
  { id: "a", profileId: "p1", name: "Alpha", hp: 120 },
  { id: "b", profileId: "p2", name: "Bravo", hp: 0 },
];

function makeRoom(overrides = {}) {
  return {
    code: "ABC123",
    matchNumber: 2,
    phase: "finished",
    winnerId: "a",
    matchSaved: false,
    matchSaving: false,
    players: PLAYERS.map((player) => ({ ...player })),
    ...overrides,
  };
}

function payload(matchKey = "ABC123:2") {
  return {
    matchKey,
    roomCode: "ABC123",
    players: PLAYERS.map((player) => ({ ...player })),
    winner: { profileId: "p1", name: "Alpha" },
  };
}

test("persistMatch saves the match and updates both players", async () => {
  const { Match, Player, state } = createFakeModels();

  const result = await persistMatch(payload(), { Match, Player });

  assert.deepEqual(result, { saved: true });
  assert.equal(state.matches.length, 1);
  assert.deepEqual(state.increments.p1, {
    wins: 1,
    losses: 0,
    matchesPlayed: 1,
  });
  assert.deepEqual(state.increments.p2, {
    wins: 0,
    losses: 1,
    matchesPlayed: 1,
  });
});

test("persistMatch reports a duplicate matchKey instead of double-counting", async () => {
  const { Match, Player, state } = createFakeModels();

  await persistMatch(payload(), { Match, Player });
  const second = await persistMatch(payload(), { Match, Player });

  assert.deepEqual(second, { duplicate: true });
  assert.equal(state.matches.length, 1);
  assert.deepEqual(state.increments.p1, {
    wins: 1,
    losses: 0,
    matchesPlayed: 1,
  });
  assert.deepEqual(state.increments.p2, {
    wins: 0,
    losses: 1,
    matchesPlayed: 1,
  });
});

test("persistMatchWithRetry retries once after a transient failure", async () => {
  const { Match, Player, state } = createFakeModels();
  state.failCreateTimes = 1;

  const result = await persistMatchWithRetry(payload(), { Match, Player });

  assert.deepEqual(result, { saved: true });
  assert.equal(state.matches.length, 1);
});

test("saveCompletedMatch saves a finished match exactly once", async () => {
  const { Match, Player, state } = createFakeModels();
  const saver = createMatchSaver({ Match, Player });
  const room = makeRoom();

  await saver.saveCompletedMatch(room.code, room);
  assert.equal(room.matchSaved, true);
  assert.equal(state.matches.length, 1);

  // A second trigger must be a no-op.
  await saver.saveCompletedMatch(room.code, room);
  assert.equal(state.matches.length, 1);
  assert.deepEqual(state.increments.p1, {
    wins: 1,
    losses: 0,
    matchesPlayed: 1,
  });
});

test("saveCompletedMatch ignores matches that never finished", async () => {
  const { Match, Player, state } = createFakeModels();
  const saver = createMatchSaver({ Match, Player });
  const room = makeRoom({ phase: "playing", winnerId: null });

  await saver.saveCompletedMatch(room.code, room);

  assert.equal(state.matches.length, 0);
  assert.equal(room.matchSaved, false);
});

test("recordAbandonment credits the survivor with the win", async () => {
  const { Match, Player, state } = createFakeModels();
  const saver = createMatchSaver({ Match, Player });
  const room = makeRoom({ phase: "playing", winnerId: null });
  const leaver = room.players[1];

  await saver.recordAbandonment(room, leaver);

  assert.equal(room.matchSaved, true);
  assert.equal(state.matches.length, 1);
  assert.deepEqual(state.increments.p1, {
    wins: 1,
    losses: 0,
    matchesPlayed: 1,
  });
  assert.deepEqual(state.increments.p2, {
    wins: 0,
    losses: 1,
    matchesPlayed: 1,
  });
});

test("recordAbandonment does nothing outside an active battle", async () => {
  const { Match, Player, state } = createFakeModels();
  const saver = createMatchSaver({ Match, Player });
  const room = makeRoom({ phase: "waiting", winnerId: null });

  await saver.recordAbandonment(room, room.players[1]);

  assert.equal(state.matches.length, 0);
  assert.equal(room.matchSaved, false);
});
