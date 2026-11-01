import { io } from "socket.io-client";
import { SERVER_URL, SESSION_STORAGE_KEY } from "./config";

function readSessionId() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  auth: (callback) => {
    const stored = localStorage.getItem("letterclash.auth");

    let token = "";

    try {
      token = stored ? JSON.parse(stored)?.token || "" : "";
    } catch {
      token = "";
    }

    callback({ token, sessionId: readSessionId() });
  },
});