import User from "../Models/ModelUser.js";

export const handleTrackingEvents = (io, socket) => {

    // ═══════════════════════════════════════════════════════════════
    // DRIVER LOCATION UPDATE (During trip)
    // ═══════════════════════════════════════════════════════════════
    socket.on("location:update", async (coords) => {
        try {
            const { latitude, longitude, rideId } = coords;
            if (!rideId || !latitude || !longitude) return;

            const lat = Number(latitude);
            const lng = Number(longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            // Update driver location in DB
            if (socket.user?._id) {
                await User.findByIdAndUpdate(socket.user._id, {
                    currentLocation: {
                        type: "Point",
                        coordinates: [lng, lat]
                    },
                    lastLocationUpdate: new Date()
                });
            }

            // Broadcast to ride room (both passenger AND driver are in this room)
            io.to(`ride_${rideId}`).emit("location:partner_updated", {
                partnerId: socket.user?._id,
                latitude: lat,
                longitude: lng,
                timestamp: new Date()
            });

            console.log(`Location update for ride ${rideId}: ${lat}, ${lng}`);
        } catch (error) {
            console.error("location:update error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PASSENGER LOCATION UPDATE (Passenger moving to pickup)
    // ═══════════════════════════════════════════════════════════════
    socket.on("passenger:location_update", (coords) => {
        try {
            const { latitude, longitude, rideId } = coords;
            if (!rideId || !latitude || !longitude) return;

            const lat = Number(latitude);
            const lng = Number(longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            console.log(`Passenger ${socket.user?._id} location update for ride ${rideId}: ${lat}, ${lng}`);

            // Broadcast passenger location to ride room (driver will receive it)
            io.to(`ride_${rideId}`).emit("location:passenger_updated", {
                passengerId: socket.user?._id,
                latitude: lat,
                longitude: lng,
                timestamp: new Date()
            });
        } catch (error) {
            console.error("passenger:location_update error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // JOIN RIDE ROOM (For tracking)
    // ═══════════════════════════════════════════════════════════════
    socket.on("join:ride", (rideId) => {
        if (!rideId) return;
        console.log(`Joined ride room for tracking: ride_${rideId}`);
        socket.join(`ride_${rideId}`);

        socket.emit("tracking:room_joined", {
            rideId,
            message: "Tracking enabled for this ride"
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // GET NEARBY AVAILABLE DRIVERS
    // ═══════════════════════════════════════════════════════════════
    socket.on("drivers:get_nearby", async (coords) => {
        try {
            const { latitude, longitude } = coords;

            if (!latitude || !longitude) {
                socket.emit("drivers:error", { message: "Coordinates required" });
                return;
            }

            const nearbyPartners = await User.find({
                role: 'partner',
                isOnline: true,
                currentStatus: 'available',
                currentLocation: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [Number(longitude), Number(latitude)]
                        },
                        $maxDistance: 5000
                    }
                }
            }).select("_id name currentLocation phone vehicle rating");

            socket.emit("drivers:nearby_list", nearbyPartners);
        } catch (error) {
            console.error("drivers:get_nearby error:", error.message);
            socket.emit("drivers:error", { message: error.message });
        }
    });
};