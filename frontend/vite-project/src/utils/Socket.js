// src/utils/socket.js
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const socket = io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling']
});

export const connectSocketWithToken = (token) => {
    if (!token) {
        console.warn("❌ No token provided for socket connection");
        return;
    }

    // If already connected with same token, skip
    if (socket.connected && socket.auth?.token === token) {
        console.log("✅ Socket already connected with valid token");
        return;
    }

    // Disconnect first if connected with different token
    if (socket.connected) {
        console.log("🔄 Reconnecting socket with new token...");
        socket.disconnect();
    }

    socket.auth = { token };
    console.log("🔌 Connecting socket...");
    socket.connect();
};

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
};

export default socket;