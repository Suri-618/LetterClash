// Match persistence: saving finished battles and updating player
// statistics. Models are injected so the logic can be unit-tested
// with fakes instead of a live MongoDB connection.

const { canSaveMatch } = require("./rules");

const K = 32;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

// Save the match and update both profiles atomically.
async function persistMatch(
  { matchKey, roomCode, players, winner },
  { Match, Player }
) {
  const session = await Match.startSession();

  try {
    const ids = players.map((p) => p.profileId).filter(Boolean);
    const docs = await Player.find({ _id: { $in: ids } })
      .select("rating")
      .session(session)
      .lean();

    const ratingOf = (id) => {
      const doc = docs.find((d) => String(d._id) === String(id));
      return typeof doc?.rating === "number" ? doc.rating : 1000;
    };

    const opponentOf = (player) =>
      players.find((p) => String(p.profileId) !== String(player.profileId));

    const updates = new Map();

    for (const player of players) {
      const opponent = opponentOf(player);
      const won =
        String(player.profileId) === String(winner?.profileId);
      const playerRating = ratingOf(player.profileId);
      const opponentRating = opponent ? ratingOf(opponent.profileId) : playerRating;
      const expected = expectedScore(playerRating, opponentRating);
      const delta = Math.round(K * ((won ? 1 : 0) - expected));
      updates.set(String(player.profileId), delta);
    }

    const matchDocument = {
      matchKey,
      roomCode,

      players: players.map((player) => ({
        playerId: player.profileId,
        username: player.name,
        finalHP: player.hp,
        ratingChange: updates.get(String(player.profileId)) || 0,
      })),

      winnerId: winner.profileId,
      winnerUsername: winner.name,
      completedAt: new Date(),
    };

    await session.withTransaction(async () => {
      await Match.create([matchDocument], { session });

      for (const player of players) {
        const won =
          String(player.profileId) === String(winner?.profileId);
        const delta = updates.get(String(player.profileId)) || 0;

        await Player.updateOne(
          { _id: player.profileId },
          {
            $inc: {
              matchesPlayed: 1,
              rating: delta,
              ...(won ? { wins: 1 } : { losses: 1 }),
            },
          },
          { session }
        );
      }
    });

    return { saved: true, ratingChanges: Object.fromEntries(updates) };
  } catch (error) {
    if (error.code === 11000) {
      // The unique matchKey already exists, so don't
      // increment statistics for the same match again.
      return { duplicate: true };
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

async function persistMatchWithRetry(payload, models) {
  try {
    return await persistMatch(payload, models);
  } catch (error) {
    // Only retry on transient failures (network/transaction aborts).
    // Validation and duplicate-key errors should not be retried.
    if (error.code === 11000) {
      return { duplicate: true };
    }

    // Give a transient failure (e.g., a network blip) one retry
    // instead of silently dropping the match from history.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return persistMatch(payload, models);
  }
}

function createMatchSaver({ Match, Player }) {
  const models = { Match, Player };
  // Track in-flight/saved matches by key so a slow retry cannot
  // be overwritten by flags reset when the host starts a new battle.
  const inFlight = new Set();
  const saved = new Set();

  async function saveCompletedMatch(code, room) {
    if (!canSaveMatch(room)) {
      return;
    }

    const winner = room.players.find(
      (player) => player.id === room.winnerId
    );

    const players = room.players.slice();
    const matchId = room.matchId;
    const matchKey = room.matchId
      ? `${room.code}:${room.matchId}`
      : `${room.code}:${room.matchNumber}`;

    if (saved.has(matchKey) || inFlight.has(matchKey)) {
      return;
    }

    inFlight.add(matchKey);
    room.matchSaving = true;

    try {
      const result = await persistMatchWithRetry(
        { matchKey, roomCode: room.code, players, winner },
        models
      );

      // The host may already have started a rematch while this save
      // was in flight; don't stamp the new match with old flags.
      if (room.matchId === matchId) {
        room.matchSaved = true;
      }

      if (result.duplicate) {
        saved.add(matchKey);
        console.log("Match already saved; skipping duplicate.");
      } else {
        saved.add(matchKey);
        console.log(`Saved completed match ${matchKey}`);
      }

      return { saved: true, duplicate: Boolean(result.duplicate) };
    } catch (error) {
      console.error("Failed to save completed match:", error.message);
    } finally {
      inFlight.delete(matchKey);
      if (room.matchId === matchId) {
        room.matchSaving = false;
      }
    }
  }

  // A player who abandons a battle in progress concedes it: the
  // survivor is credited with the win and the leaver with the loss.
  async function recordAbandonment(room, leaver) {
    if (
      room.matchSaved ||
      room.matchSaving ||
      room.phase === "waiting" ||
      room.phase === "finished" ||
      room.players.length !== 2 ||
      room.abandonmentCounted
    ) {
      return;
    }

    // Only count abandonment after at least one round has resolved.
    if (!room.roundsResolved || room.roundsResolved < 1) {
      return;
    }

    const survivor = room.players.find(
      (player) => player.id !== leaver.id
    );

    if (!survivor?.profileId || !leaver.profileId) return;

    const players = room.players.slice();
    const matchId = room.matchId;
    const matchKey = room.matchId
      ? `${room.code}:${room.matchId}`
      : `${room.code}:${room.matchNumber}`;

    if (saved.has(matchKey) || inFlight.has(matchKey)) {
      return;
    }

    room.abandonmentCounted = true;
    inFlight.add(matchKey);
    room.matchSaving = true;

    try {
      const result = await persistMatchWithRetry(
        { matchKey, roomCode: room.code, players, winner: survivor },
        models
      );

      if (room.matchId === matchId) {
        room.matchSaved = true;
      }

      if (!result.duplicate) {
        saved.add(matchKey);
        console.log(
          `Recorded abandonment in ${matchKey}: ${leaver.name} left, ` +
            `${survivor.name} wins.`
        );
      } else {
        saved.add(matchKey);
      }
    } catch (error) {
      console.error("Failed to record abandonment:", error.message);
      // Allow a different call path to retry if persistence failed.
      room.abandonmentCounted = false;
    } finally {
      inFlight.delete(matchKey);
      if (room.matchId === matchId) {
        room.matchSaving = false;
      }
    }
  }

  return { saveCompletedMatch, recordAbandonment };
}

module.exports = { persistMatch, persistMatchWithRetry, createMatchSaver };
