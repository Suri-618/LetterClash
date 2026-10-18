const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateDamage,
  evaluateSubmission,
  canSaveMatch,
} = require("./rules");

function makeRoom(overrides = {}) {
  return {
    code: "ABC123",
    phase: "playing",
    matchNumber: 1,
    matchSaved: false,
    matchSaving: false,
    winnerId: null,
    players: [
      { id: "a", profileId: "p1", name: "Alpha", hp: 200 },
      { id: "b", profileId: "p2", name: "Bravo", hp: 200 },
    ],
    currentRound: { id: 1, letter: "K", startedAt: 1000, deadline: 3500 },
    ...overrides,
  };
}

test("calculateDamage returns the documented value at each boundary", () => {
  const cases = [
    [199, 30],
    [200, 25],
    [349, 25],
    [350, 20],
    [499, 20],
    [500, 15],
    [699, 15],
    [700, 10],
  ];

  for (const [ms, expected] of cases) {
    assert.equal(calculateDamage(ms), expected, `damage at ${ms}ms`);
  }
});

test("calculateDamage clamps outside the fastest and slowest buckets", () => {
  assert.equal(calculateDamage(0), 30);
  assert.equal(calculateDamage(-5), 30);
  assert.equal(calculateDamage(5000), 10);
});

test("evaluateSubmission accepts a correct, in-time answer", () => {
  const room = makeRoom();

  const result = evaluateSubmission(
    room,
    "a",
    { roundId: 1, letter: "k" },
    1300
  );

  assert.equal(result.accepted, true);
  assert.equal(result.attacker.id, "a");
  assert.equal(result.defender.id, "b");
  assert.equal(result.reactionTimeMs, 300);
  assert.equal(result.damage, 25);
});

test("evaluateSubmission rejects an incorrect letter", () => {
  const room = makeRoom();

  const result = evaluateSubmission(
    room,
    "a",
    { roundId: 1, letter: "Z" },
    1300
  );

  assert.deepEqual(result, { accepted: false, reason: "wrong-letter" });
});

test("evaluateSubmission rejects a stale round id", () => {
  const room = makeRoom();

  const result = evaluateSubmission(
    room,
    "a",
    { roundId: 99, letter: "K" },
    1300
  );

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "stale-round");
});

test("evaluateSubmission rejects an answer after the deadline", () => {
  const room = makeRoom();

  const result = evaluateSubmission(
    room,
    "a",
    { roundId: 1, letter: "K" },
    4000
  );

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "late");
});

test("evaluateSubmission rejects a player who is not in the room", () => {
  const room = makeRoom();

  const result = evaluateSubmission(
    room,
    "stranger",
    { roundId: 1, letter: "K" },
    1300
  );

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "not-in-room");
});

test("evaluateSubmission rejects submissions when not playing", () => {
  const room = makeRoom({ phase: "resolving" });

  const result = evaluateSubmission(
    room,
    "a",
    { roundId: 1, letter: "K" },
    1300
  );

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "phase");
});

test("only the first answer resolves a round", () => {
  const room = makeRoom();

  const first = evaluateSubmission(
    room,
    "a",
    { roundId: 1, letter: "K" },
    1300
  );
  assert.equal(first.accepted, true);

  // Mimic the server locking the round after the first accepted answer.
  room.phase = "resolving";
  room.currentRound = null;

  const second = evaluateSubmission(
    room,
    "b",
    { roundId: 1, letter: "K" },
    1310
  );
  assert.equal(second.accepted, false);
  assert.equal(second.reason, "phase");
});

test("canSaveMatch requires a finished, two-player, unsaved match", () => {
  assert.equal(
    canSaveMatch(makeRoom({ phase: "finished", winnerId: "a" })),
    true
  );
  assert.equal(
    canSaveMatch(makeRoom({ phase: "playing", winnerId: "a" })),
    false
  );
  assert.equal(
    canSaveMatch(makeRoom({ phase: "finished", winnerId: null })),
    false
  );
  assert.equal(
    canSaveMatch(
      makeRoom({ phase: "finished", winnerId: "a", matchSaved: true })
    ),
    false
  );
  assert.equal(
    canSaveMatch(
      makeRoom({ phase: "finished", winnerId: "a", matchSaving: true })
    ),
    false
  );
});

test("canSaveMatch requires a profile on both players", () => {
  const room = makeRoom({ phase: "finished", winnerId: "a" });
  room.players[1].profileId = null;

  assert.equal(canSaveMatch(room), false);
});
