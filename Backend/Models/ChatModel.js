import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    messageType: {
        type: String,
        enum: ["text", "image", "location", "system"],
        default: "text"
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Index for fast history queries
chatSchema.index({ rideId: 1, createdAt: 1 });

export const Chat = mongoose.model("Chat", chatSchema);