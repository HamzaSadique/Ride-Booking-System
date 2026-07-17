import { Chat } from "../Models/ChatModel.js";
import Ride from "../Models/ModelRide.js";

export const handleChatEvents = (io, socket) => {

    // Join chat room for a ride
    socket.on("chat:join_room", async (rideId) => {
        if (!rideId) return;

        // Validate rideId format
        if (!rideId.match(/^[0-9a-fA-F]{24}$/)) {
            console.log("Invalid rideId for chat room:", rideId);
            socket.emit("chat:error", { message: "Invalid ride ID format" });
            return;
        }

        try {
            // VERIFY user is part of this ride
            const ride = await Ride.findById(rideId);
            if (!ride) {
                socket.emit("chat:error", { message: "Ride not found" });
                return;
            }

            const userId = socket.user?._id?.toString();
            const isPassenger = ride.passenger?.toString() === userId;
            const isPartner = ride.partner?.toString() === userId;

            if (!isPassenger && !isPartner) {
                console.log(`🚫 Unauthorized chat access: User ${userId} tried to join ride ${rideId}`);
                socket.emit("chat:error", { message: "You are not part of this ride" });
                return;
            }

            const roomName = `ride_chat_${rideId}`;
            socket.join(roomName);
            console.log(`💬 Authorized user ${userId} joined chat room: ${roomName}`);

            // Load and send chat history
            const messages = await Chat.find({ rideId: rideId })
                .populate("senderId", "name avatar")
                .sort({ createdAt: 1 })
                .limit(100);

            socket.emit("chat:history_loaded", {
                rideId: rideId,
                messages: messages.map(m => ({
                    _id: m._id,
                    senderId: m.senderId,
                    senderRole: m.senderRole,
                    message: m.message,
                    createdAt: m.createdAt,
                    timestamp: m.createdAt
                }))
            });
        } catch (err) {
            console.error("Chat history error:", err.message);
            socket.emit("chat:error", { message: "Failed to load chat history" });
        }
    });

    // Send message
    socket.on("chat:send_message", async (data) => {
        const { rideId, message } = data;

        if (!rideId || !message || !message.trim()) {
            console.log("Invalid chat data:", data);
            return;
        }

        // Validate rideId
        if (!rideId.match(/^[0-9a-fA-F]{24}$/)) {
            console.error("Invalid rideId format:", rideId);
            socket.emit("chat:error", { message: "Invalid ride ID" });
            return;
        }

        try {
            // Verify user is part of this ride
            const ride = await Ride.findById(rideId);
            if (!ride) {
                socket.emit("chat:error", { message: "Ride not found" });
                return;
            }

            const userId = socket.user?._id?.toString();
            const isPassenger = ride.passenger?.toString() === userId;
            const isPartner = ride.partner?.toString() === userId;

            if (!isPassenger && !isPartner) {
                socket.emit("chat:error", { message: "Not authorized for this ride" });
                return;
            }

            const role = isPassenger ? "passenger" : "partner";

            // Save message to database
            const chatMessage = await Chat.create({
                rideId: rideId,
                senderId: socket.user._id,
                senderRole: role,
                message: message.trim(),
                messageType: "text"
            });

            // Populate sender info
            await chatMessage.populate("senderId", "name avatar");

            const broadcastMessage = {
                _id: chatMessage._id,
                senderId: {
                    _id: chatMessage.senderId._id,
                    name: chatMessage.senderId.name,
                    avatar: chatMessage.senderId.avatar
                },
                senderRole: chatMessage.senderRole,
                message: chatMessage.message,
                createdAt: chatMessage.createdAt,
                timestamp: chatMessage.createdAt
            };

            // Broadcast to ride chat room
            const roomName = `ride_chat_${rideId}`;
            io.to(roomName).emit("chat:receive_message", broadcastMessage);

            // Also emit to individual user rooms for reliability
            const otherPartyId = isPassenger ? ride.partner?.toString() : ride.passenger?.toString();
            if (otherPartyId) {
                // Send to both personal room and user-specific room
                io.to(otherPartyId).emit("chat:new_notification", {
                    rideId: rideId,
                    message: `New message from ${role}`,
                    senderName: socket.user.name
                });
                
                // Also send to user-prefixed room as fallback
                const otherPartyRoom = isPassenger ? `driver:${otherPartyId}` : `user:${otherPartyId}`;
                io.to(otherPartyRoom).emit("chat:receive_message", broadcastMessage);
            }

            console.log(`💬 Message sent in ${roomName} by ${role}: ${message}`);

        } catch (err) {
            console.error("Chat send error:", err.message);
            socket.emit("chat:error", { message: "Failed to send message" });
        }
    });

    // Typing indicator
    socket.on("chat:typing", (data) => {
        const { rideId, isTyping } = data;
        if (!rideId) return;

        const roomName = `ride_chat_${rideId}`;
        socket.to(roomName).emit("chat:typing", {
            userId: socket.user?._id?.toString(),
            userName: socket.user?.name,
            isTyping: isTyping
        });
    });

    // Mark messages as read
    socket.on("chat:mark_read", async (data) => {
        const { rideId } = data;
        if (!rideId) return;

        try {
            await Chat.updateMany(
                { 
                    rideId: rideId, 
                    senderId: { $ne: socket.user?._id },
                    isRead: false 
                },
                { isRead: true }
            );
        } catch (err) {
            console.error("Mark read error:", err.message);
        }
    });
};