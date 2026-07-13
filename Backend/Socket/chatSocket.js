import { Chat } from "../Models/ChatModel.js";

export const handleChatEvents = (io, socket) => {

    // ═══════════════════════════════════════════════════════════════
    // JOIN CHAT ROOM (Auto-loads history)
    // ═══════════════════════════════════════════════════════════════
    socket.on("chat:join_room", async (rideId) => {
        try {
            if (!rideId) return;

            socket.join(`ride_${rideId}`);
            console.log(`User joined chat room: ride_${rideId}`);

            // AUTO-LOAD CHAT HISTORY when joining
            const history = await Chat.find({ rideId })
                .populate("senderId", "name role avatar")
                .sort({ createdAt: 1 })
                .limit(100);

            // Send history only to the user who joined
            socket.emit("chat:history_loaded", {
                rideId,
                messages: history,
                count: history.length
            });

            // Notify room that user joined
            socket.to(`ride_${rideId}`).emit("chat:user_joined", {
                userId: socket.user?._id,
                userName: socket.user?.name,
                timestamp: new Date()
            });

        } catch (error) {
            console.error("chat:join_room error:", error.message);
            socket.emit("chat:error", { message: "Failed to load chat history" });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // SEND MESSAGE
    // ═══════════════════════════════════════════════════════════════
    socket.on("chat:send_message", async (data) => {
        try {
            const { rideId, message, messageType = "text" } = data;

            if (!rideId || !message || !message.trim()) {
                socket.emit("chat:error", { message: "Ride ID and message are required" });
                return;
            }

            if (!socket.user?._id) {
                socket.emit("chat:error", { message: "Authentication required" });
                return;
            }

            // Sanitize message (basic XSS prevention)
            const sanitizedMessage = message.trim()
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");

            const savedChat = await Chat.create({
                rideId,
                senderId: socket.user._id,
                message: sanitizedMessage,
                messageType
            });

            // Populate sender info before broadcasting
            const populatedChat = await Chat.findById(savedChat._id)
                .populate("senderId", "name role avatar")
                .lean();

            // Broadcast to ride room (both passenger and driver)
            io.to(`ride_${rideId}`).emit("chat:receive_message", {
                _id: populatedChat._id,
                rideId: populatedChat.rideId,
                senderId: populatedChat.senderId,
                message: populatedChat.message,
                messageType: populatedChat.messageType,
                createdAt: populatedChat.createdAt
            });

            // Confirm to sender
            socket.emit("chat:message_sent", {
                messageId: savedChat._id,
                status: "delivered"
            });

        } catch (error) {
            console.error("Chat Error:", error.message);
            socket.emit("chat:error", { message: "Failed to send message" });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // TYPING INDICATOR
    // ═══════════════════════════════════════════════════════════════
    socket.on("chat:typing", (data) => {
        const { rideId, isTyping } = data;
        if (!rideId) return;

        socket.to(`ride_${rideId}`).emit("chat:typing", {
            userId: socket.user?._id,
            userName: socket.user?.name,
            isTyping,
            timestamp: new Date()
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // LEAVE CHAT ROOM
    // ═══════════════════════════════════════════════════════════════
    socket.on("chat:leave_room", (rideId) => {
        socket.leave(`ride_${rideId}`);
        console.log(`User left chat room: ride_${rideId}`);

        socket.to(`ride_${rideId}`).emit("chat:user_left", {
            userId: socket.user?._id,
            userName: socket.user?.name,
            timestamp: new Date()
        });
    });
};