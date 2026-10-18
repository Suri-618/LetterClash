const test = require("node:test");
const assert = require("node:assert/strict");

const { allowEvent, RATE_LIMITS } = require("./rateLimit");

test("allowEvent permits traffic up to the limit and then blocks", () => {
  const socket = {};
  const { max } = RATE_LIMITS["submit-letter"];

  for (let i = 0; i < max; i += 1) {
    assert.equal(allowEvent(socket, "submit-letter", 1000), true, `call ${i + 1}`);
  }

  assert.equal(allowEvent(socket, "submit-letter", 1000), false);
});

test("allowEvent tracks each event in its own bucket", () => {
  const socket = {};
  const { max } = RATE_LIMITS["create-room"];

  for (let i = 0; i < max; i += 1) {
    allowEvent(socket, "create-room", 1000);
  }

  assert.equal(allowEvent(socket, "create-room", 1000), false);
  assert.equal(allowEvent(socket, "join-room", 1000), true);
});

test("allowEvent resets after the window elapses", () => {
  const socket = {};
  const { max, windowMs } = RATE_LIMITS["create-room"];

  for (let i = 0; i < max; i += 1) {
    allowEvent(socket, "create-room", 1000);
  }

  assert.equal(allowEvent(socket, "create-room", 1000 + windowMs), false);
  assert.equal(allowEvent(socket, "create-room", 1000 + windowMs + 1), true);
});

test("allowEvent ignores events without a configured limit", () => {
  assert.equal(allowEvent({}, "unknown-event", 1000), true);
  assert.equal(allowEvent({}, "leave-room", 1000), true);
});
