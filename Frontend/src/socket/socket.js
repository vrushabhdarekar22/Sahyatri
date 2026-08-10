import { io } from "socket.io-client";

const SOCKET_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/api\/?$/, "");

const socket = io(SOCKET_URL, {
  autoConnect: false,
});

export default socket;
