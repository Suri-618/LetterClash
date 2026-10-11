const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Player = require("../models/Player");

async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        error: "Please log in to continue.",
      });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (
      typeof payload.sub !== "string" ||
      !mongoose.isValidObjectId(payload.sub)
    ) {
      return res.status(401).json({ error: "Invalid access token." });
    }

    const player = await Player.findById(payload.sub)
      .select("username email wins losses matchesPlayed rating createdAt")
      .lean();

    if (!player) {
      return res.status(401).json({ error: "Player account not found." });
    }

    req.player = player;
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        error: "Your session is invalid or expired. Please log in again.",
      });
    }

    console.error("Authentication error:", error.message);
    return res.status(500).json({ error: "Authentication failed." });
  }
}

module.exports = { requireAuth };
