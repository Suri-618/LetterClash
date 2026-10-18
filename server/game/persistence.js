// Match persistence: saving finished battles and updating player
// statistics. Models are injected so the logic can be unit-tested
// with fakes instead of a live MongoDB connection.

const { canSaveMatch } = require("./rules");

// Save the match and update both profiles atomically.
// MongoDB Atlas supports transactions on replica sets.
async function persistMatch(
  { matchKey, roomCode, players, winner },
  { Match, Player }
) {
  const session = await Match.startSession();

  try {
    const matchDocument = {
      matchKey,
      roomCode,

      players: players.map((player) => ({
        playerId: player.profileId,
        username: player.name,
        finalHP: player.hp,
      })),

      winnerId: winner.profileId,
      winnerUsername: winner.name,
      completedAt: new Date(),
    };

    await session.withTransaction(async () => {
      await Match.create([matchDocument], { session });

      for (const player of players) {
        await Player.updateOne(
          { _id: player.profileId },
          {
            $inc: {
              matchesPlayed: 1,
              ...(String(player.profileId) === String(winner.profileId)
                ? { wins: 1 }
                : { losses: 1 }),
            },
          },
          { session }
        );
      }
    });

    return { saved: true };
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
    // Give a transient failure (e.g., a network blip) one retry
    // instead of silently dropping the match from history.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return persistMatch(payload, models);
  }
}

function createMatchSaver({ Match, Player }) {
  const models = { Match, Player };

  async function saveCompletedMatch(code, room) {
    if (!canSaveMatch(room)) {
      return;
    }

    const winner = room.players.find(
      (player) => player.id === room.winnerId
    );

    const players = room.players.slice();
    const matchKey = `${room.code}:${room.matchNumber}`;

    room.matchSaving = true;

    try {
      const result = await persistMatchWithRetry(
        { matchKey, roomCode: room.code, players, winner },
        models
      );

      room.matchSaved = true;

      if (result.duplicate) {
        console.log("Match already saved; skipping duplicate.");
      } else {
        console.log(`Saved completed match ${matchKey}`);
      }
    } catch (error) {
      console.error("Failed to save completed match:", error.message);
    } finally {
      room.matchSaving = false;
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
      room.players.length !== 2
    ) {
      return;
    }

    const survivor = room.players.find(
      (player) => player.id !== leaver.id
    );

    if (!survivor?.profileId || !leaver.profileId) return;

    const players = room.players.slice();
    const matchKey = `${room.code}:${room.matchNumber}`;

    room.matchSaving = true;

    try {
      const result = await persistMatchWithRetry(
        { matchKey, roomCode: room.code, players, winner: survivor },
        models
      );

      room.matchSaved = true;

      if (!result.duplicate) {
        console.log(
          `Recorded abandonment in ${matchKey}: ${leaver.name} left, ` +
            `${survivor.name} wins.`
        );
      }
    } catch (error) {
      console.error("Failed to record abandonment:", error.message);
    } finally {
      room.matchSaving = false;
    }
  }

  return { saveCompletedMatch, recordAbandonment };
}

module.exports = { persistMatch, persistMatchWithRetry, createMatchSaver };
