import User from "../Models/ModelUser.js";
import Ride from "../Models/ModelRide.js";
import { calculateDistance, calculateETA } from "../Utils/geoUtils.js";

export const handleTrackingEvents = (io, socket) => {
    const userId = socket.user?._id?.toString();
    const userRole = socket.user?.role;

    // ============================================
    // DRIVER LOCATION UPDATE (Real-time tracking)
    // ============================================
    socket.on("location:update", async (coords, callback) => {
        try {
            const { latitude, longitude, rideId, heading, accuracy } = coords;

            if (!rideId || !latitude || !longitude) {
                if (callback) callback({ success: false, error: "Missing coordinates or rideId" });
                return;
            }

            const lat = Number(latitude);
            const lng = Number(longitude);
            if (isNaN(lat) || isNaN(lng)) {
                if (callback) callback({ success: false, error: "Invalid coordinates" });
                return;
            }

            // Update driver's location in DB
            if (socket.user?._id) {
                await User.findByIdAndUpdate(socket.user._id, {
                    currentLocation: { type: "Point", coordinates: [lng, lat] },
                    lastLocationUpdate: new Date(),
                    heading: heading || 0,
                    locationAccuracy: accuracy || 10
                });
            }

            // Get ride details
            const ride = await Ride.findById(rideId)
                .populate("passenger", "currentLocation")
                .populate("partner", "currentLocation");

            if (!ride) {
                if (callback) callback({ success: false, error: "Ride not found" });
                return;
            }

            // Save route point
            try {
                await Ride.findByIdAndUpdate(rideId, {
                    $push: {
                        driverRoute: {
                            latitude: lat,
                            longitude: lng,
                            timestamp: new Date()
                        }
                    },
                    lastDriverLocation: {
                        latitude: lat,
                        longitude: lng,
                        heading: heading || 0,
                        accuracy: accuracy || 10,
                        timestamp: new Date()
                    }
                });
            } catch (err) {
                console.error("Route save error:", err.message);
            }

            let distanceToPickup = null;
            let etaMinutes = null;

            if (userRole === "partner" || userRole === "driver") {
                if (ride.pickupLocation?.coordinates) {
                    distanceToPickup = calculateDistance(
                        lat, lng,
                        ride.pickupLocation.coordinates[1],
                        ride.pickupLocation.coordinates[0]
                    );
                    etaMinutes = calculateETA(distanceToPickup);
                }
            }

            const locationData = {
                partnerId: userId,
                role: userRole,
                latitude: lat,
                longitude: lng,
                heading: heading || 0,
                accuracy: accuracy || 10,
                timestamp: new Date(),
                distanceToPickup: distanceToPickup ? Math.round(distanceToPickup * 100) / 100 : null,
                etaMinutes: etaMinutes ? Math.ceil(etaMinutes) : null,
                rideStatus: ride.status
            };

            // ✅ Broadcast driver location to ride room
            io.to(`ride_${rideId}`).emit("location:partner_updated", locationData);
            
            // ✅ Also emit to passenger's personal room (backup)
            if (ride.passenger?._id) {
                io.to(`user:${ride.passenger._id.toString()}`).emit("location:partner_updated", locationData);
            }

            if (callback) callback({ success: true, data: locationData });

        } catch (error) {
            console.error("❌ location:update error:", error.message);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    // ============================================
    // PASSENGER LOCATION UPDATE (Driver ko dikhane ke liye)
    // ============================================
    socket.on("passenger:location_update", async (coords) => {
        try {
            const { latitude, longitude, rideId } = coords;
            if (!rideId || latitude === undefined || longitude === undefined) {
                console.log("❌ passenger:location_update missing data");
                return;
            }

            const lat = Number(latitude);
            const lng = Number(longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            // ✅ Ride room mein broadcast karo (driver bhi is room mein hoga)
            io.to(`ride_${rideId}`).emit("location:passenger_updated", {
                latitude: lat,
                longitude: lng,
                timestamp: new Date()
            });

            console.log(`📍 Passenger location broadcast: ride_${rideId} | ${lat}, ${lng}`);
        } catch (error) {
            console.error("❌ passenger:location_update error:", error.message);
        }
    });
    // ============================================
    // ✅ NEW: PASSENGER LOCATION UPDATE
    // ============================================
    socket.on("passenger:location_update", async (data, callback) => {
        try {
            const { latitude, longitude, rideId } = data;
            
            if (!rideId || latitude === undefined || longitude === undefined) {
                if (callback) callback({ success: false, error: "Missing data" });
                return;
            }

            const lat = Number(latitude);
            const lng = Number(longitude);

            // Update passenger location in DB
            await User.findByIdAndUpdate(userId, {
                currentLocation: { type: "Point", coordinates: [lng, lat] },
                lastLocationUpdate: new Date()
            });

            const locationData = {
                passengerId: userId,
                role: "passenger",
                latitude: lat,
                longitude: lng,
                timestamp: new Date(),
                rideId
            };

            // ✅ Emit to ride room so driver can see
            io.to(`ride_${rideId}`).emit("location:passenger_updated", locationData);
            
            // ✅ Also emit to driver's personal room (backup)
            const ride = await Ride.findById(rideId);
            if (ride?.partner) {
                io.to(`driver:${ride.partner.toString()}`).emit("location:passenger_updated", locationData);
            }

            if (callback) callback({ success: true });

        } catch (error) {
            console.error("❌ passenger:location_update error:", error.message);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ============================================
    // DRIVER ARRIVED EVENT
    // ============================================
    socket.on("driver:arrived", async (data, callback) => {
        try {
            const { rideId } = data;
            if (!rideId) {
                if (callback) callback({ success: false, error: "Ride ID required" });
                return;
            }

            const ride = await Ride.findById(rideId);
            if (!ride) {
                if (callback) callback({ success: false, error: "Ride not found" });
                return;
            }

            if (ride.partner?.toString() !== userId) {
                if (callback) callback({ success: false, error: "Unauthorized" });
                return;
            }

            ride.status = "ARRIVED";
            ride.arrivedAt = new Date();
            ride.actualArrivalTime = new Date();
            await ride.save();

            const arrivalData = {
                rideId,
                status: "ARRIVED",
                driverId: userId,
                driverName: socket.user?.name,
                driverPhone: socket.user?.phone,
                arrivedAt: new Date(),
                message: "Driver has arrived at pickup location"
            };

            // Notify passenger
            if (ride.passenger) {
                io.to(`user:${ride.passenger.toString()}`).emit("ride:driver_arrived", arrivalData);
            }
            
            // Also broadcast to ride room
            io.to(`ride_${rideId}`).emit("ride:status_updated", {
                rideId,
                status: "ARRIVED",
                timestamp: new Date()
            });

            if (callback) callback({ success: true, data: arrivalData });
            console.log(`✅ Driver ${userId} arrived for ride ${rideId}`);

        } catch (error) {
            console.error("❌ driver:arrived error:", error.message);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ============================================
    // JOIN RIDE ROOM
    // ============================================
    socket.on("join:ride", async (rideId, callback) => {
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

            // Verify user is part of this ride (LOOSER CHECK for pending rides)
            const isParticipant = 
                ride.passenger?.toString() === userId || 
                ride.partner?.toString() === userId ||
                (userRole === "partner" && ride.status === "PENDING"); // Driver can join pending rides

            if (!isParticipant) {
                if (callback) callback({ success: false, error: "Not authorized for this ride" });
                return;
            }

            socket.join(`ride_${rideId}`);
            socket.join(`ride_chat_${rideId}`);

            // Get current partner location if available
            let partnerLocation = null;
            if (ride.partner) {
                const partner = await User.findById(ride.partner).select("currentLocation name phone vehicleDetails");
                if (partner?.currentLocation) {
                    partnerLocation = {
                        latitude: partner.currentLocation.coordinates[1],
                        longitude: partner.currentLocation.coordinates[0],
                        name: partner.name,
                        phone: partner.phone
                    };
                }
            }

            const response = {
                success: true,
                rideId,
                message: "Tracking room joined successfully",
                currentStatus: ride.status,
                partnerLocation,
                pickup: ride.pickupLocation,
                dropoff: ride.dropoffLocation
            };

            socket.emit("tracking:room_joined", response);
            if (callback) callback(response);

            console.log(`✅ User ${userId} joined ride room: ${rideId}`);

        } catch (error) {
            console.error("❌ join:ride error:", error.message);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ============================================
    // LEAVE RIDE ROOM
    // ============================================
    socket.on("leave:ride", (rideId, callback) => {
        try {
            if (!rideId) {
                if (callback) callback({ success: false, error: "Ride ID required" });
                return;
            }
            socket.leave(`ride_${rideId}`);
            socket.leave(`ride_chat_${rideId}`);
            socket.emit("tracking:room_left", { rideId, message: "Left tracking room" });
            if (callback) callback({ success: true, message: "Left ride room" });
        } catch (error) {
            console.error("❌ leave:ride error:", error.message);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ============================================
    // REQUEST CURRENT LOCATION
    // ============================================
    socket.on("location:request", async (data, callback) => {
        try {
            const { rideId } = data;
            if (!rideId) {
                if (callback) callback({ success: false, error: "Ride ID required" });
                return;
            }

            const ride = await Ride.findById(rideId)
                .populate("partner", "currentLocation name phone vehicleDetails")
                .populate("passenger", "currentLocation name phone");

            if (!ride) {
                if (callback) callback({ success: false, error: "Ride not found" });
                return;
            }

            // Return partner location to requester
            const partner = ride.partner;
            if (partner?.currentLocation) {
                const locationData = {
                    partnerId: partner._id,
                    latitude: partner.currentLocation.coordinates[1],
                    longitude: partner.currentLocation.coordinates[0],
                    name: partner.name,
                    phone: partner.phone,
                    vehicleDetails: partner.vehicleDetails,
                    timestamp: new Date()
                };
                socket.emit("location:partner_updated", locationData);
                if (callback) callback({ success: true, data: locationData });
            } else {
                if (callback) callback({ success: false, error: "Driver location not available" });
            }
        } catch (error) {
            console.error("❌ location:request error:", error.message);
            if (callback) callback({ success: false, error: error.message });
        }
    });
};