import jwt from "jsonwebtoken";
import User from "../Models/ModelUser.js";

export const socketAuthMiddleware = async (socket, next) => {
    try {
        // Get token from handshake auth or query
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token) {
            return next(new Error("Authentication required"));
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        // Get user from DB
        const user = await User.findById(decoded._id || decoded.id).select("-password -refreshToken");

        if (!user) {
            return next(new Error("User not found"));
        }

        // Attach user to socket
        socket.user = user;
        next();
    } catch (error) {
        console.error("Socket auth error:", error.message);
        next(new Error("Invalid token"));
    }
};