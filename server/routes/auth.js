const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Player = require("../models/Player");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const authWindows = new Map();
const AUTH_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function authRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  let state = authWindows.get(ip);

  if (!state || now > state.resetAt) {
    state = { count: 0, resetAt: now + AUTH_LIMIT.windowMs };
    authWindows.set(ip, state);
  }

  state.count += 1;

  if (authWindows.size > 5000) {
    for (const [key, value] of authWindows) {
      if (now > value.resetAt) authWindows.delete(key);
    }
  }

  if (state.count > AUTH_LIMIT.max) {
    return res
      .status(429)
      .json({ error: "Too many authentication attempts. Try again later." });
  }

  next();
}

function createToken(player) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(
    { sub: player._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "7d", algorithm: "HS256" }
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

router.post("/register", authRateLimit, async (req, res) => {
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

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        error: "Password must be at least 8 characters and under 72 bytes.",
      });
    }

    // A guest may already be using this name. That must not block a
    // real person from registering it: we take over (and reset) the
    // unregistered profile instead. Existing *accounts* still block.
    const existing = await Player.findOne({
      $or: [
        { usernameKey: username.toLowerCase() },
        { email },
      ],
    }).select("_id usernameKey email passwordHash");

    if (existing) {
      const isGuest = !existing.passwordHash;
      const sameName =
        existing.usernameKey === username.toLowerCase();

      if (!isGuest || !sameName || existing.email) {
        return res.status(409).json({
          error: "Username or email is already in use. Try another one.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      // Claim the guest profile. Reset its stats so a stranger cannot
      // hand a new account a fabricated record.
      const claimed = await Player.findOneAndUpdate(
        { _id: existing._id, passwordHash: { $exists: false } },
        {
          $set: {
            username,
            usernameKey: username.toLowerCase(),
            email,
            passwordHash,
            wins: 0,
            losses: 0,
            matchesPlayed: 0,
            rating: 1000,
          },
        },
        { new: true }
      );

      if (!claimed) {
        return res.status(409).json({
          error: "Username or email is already in use. Try another one.",
        });
      }

      const token = createToken(claimed);

      return res.status(201).json({
        message: "Account created successfully.",
        token,
        player: publicPlayer(claimed),
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
router.post("/login", authRateLimit, async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    if (!email || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const player = await Player.findOne({ email }).select("+passwordHash");

    const dummyHash =
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.OX5qX7Sxe6G4M3gJtI5GKu2KxGnL9m2";
    const hash = player?.passwordHash || dummyHash;
    const valid = await bcrypt.compare(password, hash);

    if (!player || !player.passwordHash || !valid) {
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
