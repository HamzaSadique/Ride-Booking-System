import { Server } from "socket.io";
import { verifySocketToken } from "../Middlewares/authMiddleware.js";
import { handleRideEvents } from "./rideSocket.js";
import { handleTrackingEvents } from "./trackingSocket.js";
import { handleChatEvents } from "./chatSocket.js";
import User from "../Models/ModelUser.js";
import PartnerProfile from "../Models/ModelPartner.js";
import Ride from "../Models/ModelRide.js";

export const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST"],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        connectTimeout: 10000,
        transports: ["websocket", "polling"]
    });

    // ============================================
    // AUTHENTICATION MIDDLEWARE
    // ============================================
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || 
                         socket.handshake.headers?.token || 
                         socket.handshake.query?.token;

            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            const user = await verifySocketToken(token);
            if (!user) {
                return next(new Error("Authentication error: Invalid token"));
            }

            socket.user = user;
            next();
        } catch (err) {
            console.error("Socket auth error:", err.message);
            return next(new Error("Authentication error: " + err.message));
        }
    });

    io.on("connection", async (socket) => {
        const userId = socket.user?._id?.toString();
        const userRole = socket.user?.role;

        console.log(`⚡ User Connected: ${userId} | Role: ${userRole} | Socket: ${socket.id}`);

        // Update user online status
        try {
            await User.findByIdAndUpdate(userId, {
                isOnline: true,
                currentStatus: "online",
                socketId: socket.id,
                lastLogin: new Date()
            });

            if (userRole === "partner" || userRole === "driver") {
                await PartnerProfile.findOneAndUpdate(
                    { user: userId },
                    { isOnline: true, lastActive: new Date() }
                );
            }
        } catch (err) {
            console.error("Online status update error:", err.message);
        }

        // Join user-specific room
        socket.join(userId);

        // Join role-specific rooms
        if (userRole === "partner" || userRole === "driver") {
            socket.join(`driver:${userId}`);
            socket.join("drivers_online");
        }
        if (userRole === "passenger" || userRole === "user") {
            socket.join(`user:${userId}`);
        }

        // ============================================
        // AUTO-JOIN ACTIVE RIDE ROOMS
        // ============================================
        try {
            const activeRides = await Ride.find({
                $or: [
                    { passenger: userId, status: { $in: ["PENDING", "ACCEPTED", "ARRIVED", "ONGOING"] } },
                    { partner: userId, status: { $in: ["PENDING", "ACCEPTED", "ARRIVED", "ONGOING"] } }
                ]
            });

            for (const ride of activeRides) {
                socket.join(`ride_${ride._id}`);
                socket.join(`ride_chat_${ride._id}`);

                socket.emit("tracking:room_joined", {
                    rideId: ride._id,
                    status: ride.status,
                    message: "Reconnected to active ride",
                    autoJoined: true
                });

                console.log(`  ✅ Auto-joined ride: ${ride._id} (${ride.status})`);
            }
        } catch (err) {
            console.error("Auto-join error:", err.message);
        }

        // ============================================
        // NEW: FORCE JOIN RIDE ROOM (jab driver accept kare)
        // ============================================
        socket.on("force-join-ride", async (rideId, callback) => {
            try {
                if (!rideId) {
                    if (callback) callback({ success: false, error: "Ride ID required" });
                    return;
                }

                const ride = await Ride.findById(rideId);
                if (!ride) {
                    if (callback) callback({ success: false, error: "Ride not found" });
                    return;
                }

                // Check if user is part of this ride
                const isParticipant = 
                    ride.passenger?.toString() === userId || 
                    ride.partner?.toString() === userId;

                if (!isParticipant) {
                    if (callback) callback({ success: false, error: "Not authorized" });
                    return;
                }

                socket.join(`ride_${rideId}`);
                socket.join(`ride_chat_${rideId}`);

                const response = {
                    success: true,
                    rideId,
                    message: "Force joined ride room",
                    status: ride.status
                };

                socket.emit("tracking:room_joined", response);
                if (callback) callback(response);

                console.log(`  ✅ Force-joined ride: ${rideId} by user ${userId}`);

            } catch (err) {
                console.error("Force-join error:", err.message);
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ============================================
        // HANDLE RECONNECTION
        // ============================================
        socket.on("reconnect:request", async (data, callback) => {
            try {
                const { rideId } = data || {};

                const activeRides = await Ride.find({
                    $or: [
                        { passenger: userId, status: { $nin: ["COMPLETED", "CANCELLED"] } },
                        { partner: userId, status: { $nin: ["COMPLETED", "CANCELLED"] } }
                    ]
                });

                const rejoinedRides = [];
                for (const ride of activeRides) {
                    socket.join(`ride_${ride._id}`);
                    socket.join(`ride_chat_${ride._id}`);
                    rejoinedRides.push({ rideId: ride._id, status: ride.status });
                }

                const response = {
                    success: true,
                    socketId: socket.id,
                    rejoinedRides,
                    userId,
                    role: userRole
                };

                socket.emit("reconnect:success", response);
                if (callback) callback(response);

            } catch (err) {
                console.error("Reconnect error:", err.message);
                if (callback) callback({ success: false, error: err.message });
            }
        });

        // ============================================
        // HEARTBEAT / PING
        // ============================================
        socket.on("ping", (callback) => {
            if (callback) callback({ success: true, timestamp: new Date() });
        });

        // Initialize event handlers
        handleRideEvents(io, socket);
        handleTrackingEvents(io, socket);
        handleChatEvents(io, socket);

        // ============================================
        // DISCONNECT HANDLER
        // ============================================
        socket.on("disconnect", async (reason) => {
            console.log(`🔌 User Disconnected: ${userId} | Reason: ${reason}`);

            try {
                setTimeout(async () => {
                    const userSocket = await User.findById(userId).select("socketId");
                    if (userSocket && userSocket.socketId === socket.id) {
                        await User.findByIdAndUpdate(userId, {
                            isOnline: false,
                            currentStatus: "offline",
                            socketId: null,
                            lastLogout: new Date()
                        });

                        if (userRole === "partner" || userRole === "driver") {
                            await PartnerProfile.findOneAndUpdate(
                                { user: userId },
                                { isOnline: false, isAvailable: false }
                            );
                            socket.leave("drivers_online");
                        }

                        console.log(`   User ${userId} marked offline`);
                    }
                }, 30000);

            } catch (error) {
                console.error("Disconnect cleanup error:", error.message);
            }
        });

        socket.on("error", (error) => {
            console.error(`Socket error for user ${userId}:`, error.message);
        });
    });

    return io;
};