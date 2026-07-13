import { Server } from "socket.io";
import { verifySocketToken } from "../Middlewares/authMiddleware.js"; // CHANGED: use verifySocketToken!
import { handleRideEvents } from "./rideSocket.js";
import { handleTrackingEvents } from "./trackingSocket.js";
import { handleChatEvents } from "./chatSocket.js";

export const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST"]
        }
    });

    // Authentication Middleware for Socket
    io.use(async (socket, next) => {
        try {
            // Get token from auth object (sent from frontend)
            const token = socket.handshake.auth?.token || socket.handshake.headers?.token;
            
            console.log("Token received:", token ? "YES" : "NO");
            
            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }
            
            // CHANGED: Use verifySocketToken instead of isAuthenticated
            const user = await verifySocketToken(token);
            
            console.log("User authenticated:", user._id);
            
            socket.user = user;
            next();
        } catch (err) {
            console.log("Auth error:", err.message);
            next(new Error("Authentication error: " + err.message));
        }
    });

    io.on("connection", (socket) => {
        console.log(`⚡ User Connected: ${socket.user._id} (${socket.id})`);

        // Join a private room for personal notifications
        socket.join(socket.user._id.toString());

        // Initialize Module-wise Events
        handleRideEvents(io, socket);
        handleTrackingEvents(io, socket);
        handleChatEvents(io, socket);

        socket.on("disconnect", () => {
            console.log(` User Disconnected: ${socket.id}`);
        });
    });

    return io;
};