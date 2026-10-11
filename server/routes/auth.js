const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Player = require("../models/Player");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function createToken(player) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(
    { sub: player._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function publicPlayer(player) {
  return {
    id: player._id,
    username: player.username,
    email: player.email,
    wins: player.wins,
    losses: player.losses,
    matchesPlayed: player.matchesPlayed,
    rating: player.rating,
    createdAt: player.createdAt,
  };
}

// Register a new account.
router.post("/register", async (req, res) => {
  try {
    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim()
        : "";

    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    if (!/^[a-zA-Z0-9_-]{3,16}$/.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–16 characters: letters, numbers, _ or -.",
      });
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: "Password must be between 8 and 72 characters.",
      });
    }

    // Do not let someone claim an existing guest profile.
    const existing = await Player.findOne({
      $or: [
        { usernameKey: username.toLowerCase() },
        { email },
      ],
    }).select("_id usernameKey email passwordHash");

    if (existing) {
      return res.status(409).json({
        error: "Username or email is already in use. Try another one.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const player = await Player.create({
      username,
      usernameKey: username.toLowerCase(),
      email,
      passwordHash,
    });

    const token = createToken(player);

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      player: publicPlayer(player),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Username or email is already in use.",
      });
    }

    console.error("Registration error:", error.message);
    return res.status(500).json({ error: "Could not create your account." });
  }
});

// Log in to an existing account.
router.post("/login", async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    if (!email || !password || password.length > 72) {
      return res.status(400).json({ error: "Enter your email and password." });
    }

    const player = await Player.findOne({ email }).select("+passwordHash");

    if (
      !player ||
      !player.passwordHash ||
      !(await bcrypt.compare(password, player.passwordHash))
    ) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const token = createToken(player);

    return res.json({
      message: "Login successful.",
      token,
      player: publicPlayer(player),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ error: "Could not log in." });
  }
});

// Get the currently authenticated player's profile.
router.get("/me", requireAuth, (req, res) => {
  res.json({ player: req.player });
});

module.exports = router;
