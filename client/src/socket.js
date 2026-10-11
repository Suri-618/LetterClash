import { io } from "socket.io-client";
import { SERVER_URL } from "./config";

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

    callback({ token });
  },
});