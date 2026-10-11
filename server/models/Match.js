const mongoose = require("mongoose");

const matchSchema = new mongoose.Schema(
  {
    matchKey: {
      type: String,
      required: true,
      unique: true,
    },

    roomCode: {
      type: String,
      required: true,
    },

    players: [
      {
        playerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Player",
          required: true,
        },
        username: { type: String, required: true },
        finalHP: { type: Number, default: 0 },
      },
    ],

    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },

    winnerUsername: {
      type: String,
      required: true,
    },

    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

matchSchema.index({ completedAt: -1 });

module.exports = mongoose.model("Match", matchSchema);
