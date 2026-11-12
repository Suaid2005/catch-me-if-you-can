/**
 * lib/socket.ts
 * ─────────────
 * Socket.IO client singleton.
 *
 * We create ONE socket connection and reuse it everywhere.
 * This prevents accidentally opening multiple connections.
 *
 * Usage:
 *   import { socket, connectSocket } from "@/lib/socket";
 *   connectSocket(token);
 *   socket.emit("lobby:join", { room_code: "ABC123", ... });
 *   socket.on("lobby:state", (data) => { ... });
 */
import { io, Socket } from "socket.io-client";

export function getSocketUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window !== "undefined") {
    if (envUrl && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      return envUrl.replace(/localhost|127\.0\.0\.1/, window.location.hostname).replace(/\/$/, "");
    }
    if (envUrl) {
      return envUrl.replace(/\/$/, "");
    }
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return window.location.origin;
  }
  return envUrl ? envUrl.replace(/\/$/, "") : "http://localhost:8000";
}

// The socket instance — null until connectSocket() is called
let socket: Socket | null = null;

/**
 * Connect to the game server.
 * Call this once after the user logs in.
 * Subsequent calls do nothing if already connected.
 */
export function connectSocket(token?: string): Socket {
  if (socket && socket.connected) return socket;

  const targetUrl = getSocketUrl();
  socket = io(targetUrl, {
    // Send JWT in the auth handshake so the server can identify the player
    auth: token ? { token } : undefined,
    // Reconnect automatically if the connection drops
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    console.log("🔌 Connected to game server:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.error("🔌 Connection error:", err.message);
  });

  return socket;
}

/**
 * Get the current socket instance.
 * Returns null if not connected yet.
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Disconnect and clean up the socket.
 * Call on logout.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export { socket };
