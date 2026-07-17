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
            methods: ["GET", "POST"]
        }
    });

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.headers?.token;
            if (!token) return next(new Error("Authentication error: No token provided"));
            const user = await verifySocketToken(token);
            socket.user = user;
            next();
        } catch (err) {
            next(new Error("Authentication error: " + err.message));
        }
    });

    io.on("connection", async (socket) => {
        console.log(`⚡ User Connected: ${socket.user._id} | Role: ${socket.user.role}`);
        const userId = socket.user._id.toString();

        socket.join(userId);
        if (socket.user.role === "partner" || socket.user.role === "driver") {
            socket.join(`driver:${userId}`);
        }
        if (socket.user.role === "passenger" || socket.user.role === "user") {
            socket.join(`user:${userId}`);
        }

        // Auto-join active ride rooms
        try {
            const activeRide = await Ride.findOne({
                $or: [{ passenger: userId }, { partner: userId }],
                status: { $in: ["PENDING", "ACCEPTED", "ARRIVED", "ONGOING"] }
            });
            if (activeRide) {
                socket.join(`ride_${activeRide._id}`);
                socket.join(`ride_chat_${activeRide._id}`);
                console.log(`  ✅ Auto-joined ride rooms for: ${activeRide._id} (${activeRide.status})`);
            }
        } catch (err) {
            console.error("Auto-join error:", err.message);
        }

        handleRideEvents(io, socket);
        handleTrackingEvents(io, socket);
        handleChatEvents(io, socket);

        socket.on("disconnect", async (reason) => {
            console.log(`🔌 User Disconnected: ${socket.user?._id} | Reason: ${reason}`);
            try {
                await User.findByIdAndUpdate(socket.user?._id, {
                    isOnline: false, currentStatus: "offline", socketId: null
                });
                if (socket.user?.role === "partner" || socket.user?.role === "driver") {
                    await PartnerProfile.findOneAndUpdate(
                        { user: socket.user._id },
                        { isOnline: false, isAvailable: false }
                    );
                }
                // ✅ Rides are NOT cancelled on disconnect
            } catch (error) {
                console.error("Disconnect cleanup error:", error.message);
            }
        });
    });

    return io;
};