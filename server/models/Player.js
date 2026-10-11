const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 16,
    },

    // Normalized key makes username lookups case-insensitive.
    usernameKey: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Used when we add registered accounts.
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      unique: true,
    },

    passwordHash: {
      type: String,
      select: false,
    },

    wins: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    matchesPlayed: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 1000, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Player", playerSchema);
