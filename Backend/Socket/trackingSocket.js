import User from "../Models/ModelUser.js";

export const handleTrackingEvents = (io, socket) => {

    // DRIVER LOCATION UPDATE (During trip)
    socket.on("location:update", async (coords) => {
        try {
            const { latitude, longitude, rideId } = coords;
            if (!rideId || !latitude || !longitude) return;

            const lat = Number(latitude);
            const lng = Number(longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            if (socket.user?._id) {
                await User.findByIdAndUpdate(socket.user._id, {
                    currentLocation: { type: "Point", coordinates: [lng, lat] },
                    lastLocationUpdate: new Date()
                });
            }

            // ✅ Broadcast to ride room (passenger will receive)
            io.to(`ride_${rideId}`).emit("location:partner_updated", {
                partnerId: socket.user?._id,
                latitude: lat,
                longitude: lng,
                timestamp: new Date()
            });
        } catch (error) {
            console.error("location:update error:", error.message);
        }
    });

    // JOIN RIDE ROOM
    socket.on("join:ride", (rideId) => {
        if (!rideId) return;
        socket.join(`ride_${rideId}`);
        socket.emit("tracking:room_joined", { rideId, message: "Tracking enabled" });
    });
};