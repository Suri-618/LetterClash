// Pure Letter Clash game rules. No Socket.IO, no database, no I/O,
// so the logic can be unit-tested directly.

function calculateDamage(reactionTimeMs) {
  if (reactionTimeMs < 200) return 30;
  if (reactionTimeMs < 350) return 25;
  if (reactionTimeMs < 500) return 20;
  if (reactionTimeMs < 700) return 15;
  return 10;
}

// Decide whether a submitted letter is a valid answer for the
// current round of a room, and if so how much damage it deals.
// This mirrors the server-side validation in the socket handler.
function evaluateSubmission(room, playerId, payload = {}, now = Date.now()) {
  if (!room || room.phase !== "playing" || !room.currentRound) {
    return { accepted: false, reason: "phase" };
  }

  if (room.players.length !== 2) {
    return { accepted: false, reason: "players" };
  }

  const attacker = room.players.find((player) => player.id === playerId);

  if (!attacker) {
    return { accepted: false, reason: "not-in-room" };
  }

  const round = room.currentRound;

  // Reject stale round IDs and incorrect letters.
  if (payload.roundId !== round.id) {
    return { accepted: false, reason: "stale-round" };
  }

  const letter =
    typeof payload.letter === "string" ? payload.letter.toUpperCase() : "";

  if (letter !== round.letter) {
    return { accepted: false, reason: "wrong-letter" };
  }

  if (now > round.deadline) {
    return { accepted: false, reason: "late" };
  }

  const defender = room.players.find((player) => player.id !== playerId);

  if (!defender) {
    return { accepted: false, reason: "no-defender" };
  }

  const reactionTimeMs = Math.max(0, now - round.startedAt);

  return {
    accepted: true,
    attacker,
    defender,
    reactionTimeMs,
    damage: calculateDamage(reactionTimeMs),
  };
}

// A completed match may be saved exactly once, and only once the
// battle has truly finished with two profiled players.
function canSaveMatch(room) {
  if (!room) return false;
  if (room.matchSaved || room.matchSaving) return false;
  if (room.phase !== "finished") return false;
  if (!room.winnerId) return false;
  if (room.players.length !== 2) return false;
  return room.players.every((player) => Boolean(player.profileId));
}

module.exports = { calculateDamage, evaluateSubmission, canSaveMatch };
