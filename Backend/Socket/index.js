import { Server } from "socket.io";
import { verifySocketToken } from "../Middlewares/authMiddleware.js";
import { handleRideEvents } from "./rideSocket.js";
import { handleTrackingEvents } from "./trackingSocket.js";
import { handleChatEvents } from "./chatSocket.js";
import User from "../Models/ModelUser.js";
import PartnerProfile from "../Models/ModelPartner.js";

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
            const token = socket.handshake.auth?.token || socket.handshake.headers?.token;

            console.log("Token received:", token ? "YES" : "NO");

            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            const user = await verifySocketToken(token);

            console.log("User authenticated:", user._id, "| Role:", user.role);

            socket.user = user;
            next();
        } catch (err) {
            console.log("Auth error:", err.message);
            next(new Error("Authentication error: " + err.message));
        }
    });

    io.on("connection", (socket) => {
        console.log(`⚡ User Connected: ${socket.user._id} (${socket.id}) | Role: ${socket.user.role}`);

        const userId = socket.user._id.toString();

        // ═══════════════════════════════════════════════════════════════
        // AUTO-JOIN ROOMS (NEW - Critical for notifications)
        // ═══════════════════════════════════════════════════════════════

        // Personal room for direct notifications
        socket.join(userId);
        console.log(`  Joined personal room: ${userId}`);

        // Driver-specific room
        if (socket.user.role === "partner" || socket.user.role === "driver") {
            socket.join(`driver:${userId}`);
            console.log(`  Joined driver room: driver:${userId}`);
        }

        // Passenger-specific room
        if (socket.user.role === "passenger" || socket.user.role === "user") {
            socket.join(`user:${userId}`);
            console.log(`  Joined user room: user:${userId}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // Initialize Module-wise Events
        // ═══════════════════════════════════════════════════════════════
        handleRideEvents(io, socket);
        handleTrackingEvents(io, socket);
        handleChatEvents(io, socket);

        // ═══════════════════════════════════════════════════════════════
        // DISCONNECT CLEANUP (NEW - Frees up driver status)
        // ═══════════════════════════════════════════════════════════════
        socket.on("disconnect", async (reason) => {
            console.log(`🔌 User Disconnected: ${socket.user?._id} (${socket.id}) | Reason: ${reason}`);

            try {
                // Update user as offline
                await User.findByIdAndUpdate(socket.user?._id, {
                    isOnline: false,
                    currentStatus: "offline",
                    socketId: null,
                    lastLogout: new Date()
                });

                // If driver, also update partner profile
                if (socket.user?.role === "partner" || socket.user?.role === "driver") {
                    await PartnerProfile.findOneAndUpdate(
                        { user: socket.user._id },
                        { isOnline: false, isAvailable: false }
                    );
                    console.log(`  Driver ${socket.user._id} marked offline`);
                }
            } catch (error) {
                console.error("Disconnect cleanup error:", error.message);
            }
        });
    });

    return io;
};