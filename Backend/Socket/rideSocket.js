import User from "../Models/ModelUser.js";
import Ride from "../Models/ModelRide.js";
import PartnerProfile from "../Models/ModelPartner.js";
import { Chat } from "../Models/ChatModel.js";

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const resolveRide = async (rideId) => {
    if (!rideId) return null;
    if (/^[0-9a-fA-F]{24}$/.test(rideId)) {
        return await Ride.findById(rideId);
    }
    if (typeof rideId === 'string' && rideId.startsWith("ride_")) {
        return await Ride.findOne({ rideId: rideId });
    }
    const byId = await Ride.findById(rideId);
    if (byId) return byId;
    return await Ride.findOne({ rideId: rideId });
};

const resolveAndUpdateRide = async (rideId, updateData, options = {}) => {
    if (!rideId) return null;
    const opts = { returnDocument: 'after', ...options };
    if (/^[0-9a-fA-F]{24}$/.test(rideId)) {
        return await Ride.findByIdAndUpdate(rideId, updateData, opts);
    }
    if (typeof rideId === 'string' && rideId.startsWith("ride_")) {
        return await Ride.findOneAndUpdate({ rideId: rideId }, updateData, opts);
    }
    const byId = await Ride.findByIdAndUpdate(rideId, updateData, opts);
    if (byId) return byId;
    return await Ride.findOneAndUpdate({ rideId: rideId }, updateData, opts);
};

// ═══════════════════════════════════════════════════════════════
// MAIN SOCKET HANDLER
// ═══════════════════════════════════════════════════════════════
export const handleRideEvents = (io, socket) => {
    console.log(`Socket active: ${socket.id} | User: ${socket.user?._id} | Role: ${socket.user?.role}`);

    // Auto-join user's personal room on connection
    if (socket.user?._id) {
        socket.join(`user:${socket.user._id.toString()}`);
        if (socket.user.role === 'partner') {
            socket.join(`driver:${socket.user._id.toString()}`);
        }
    }

    socket.on("join", (userId) => {
        if (!userId) return;
        socket.join(`user:${userId}`);
    });

    // ═══════════════════════════════════════════════════════════════
    // PARTNER ONLINE
    // ═══════════════════════════════════════════════════════════════
    socket.on("partner:online", async (data) => {
        try {
            if (!data || !data.driverId) {
                console.log("partner:online missing driverId");
                return;
            }

            const lat = Number(data.latitude || data.lat);
            const lng = Number(data.longitude || data.lng);

            console.log(`Partner ${data.driverId} ONLINE at ${lat}, ${lng}`);

            if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                console.error(`Invalid coordinates`);
                socket.emit("ride:error", { message: "Invalid GPS location" });
                return;
            }

            socket.join(`driver:${data.driverId}`);
            socket.join("active_drivers");

            await User.findByIdAndUpdate(data.driverId, {
                isOnline: true,
                currentStatus: 'available',
                socketId: socket.id,
                currentLocation: {
                    type: "Point",
                    coordinates: [lng, lat]
                },
                lastLocationUpdate: new Date()
            });

            const partnerProfile = await PartnerProfile.findOneAndUpdate(
                { user: data.driverId },
                {
                    isOnline: true,
                    isAvailable: true,
                    currentLocation: {
                        type: "Point",
                        coordinates: [lng, lat]
                    }
                },
                { returnDocument: 'after' }
            );

            if (partnerProfile) {
                const pendingRides = await Ride.find({
                    status: "PENDING",
                    vehicleType: partnerProfile.vehicleType
                }).sort({ createdAt: -1 }).limit(5);

                if (pendingRides.length > 0) {
                    console.log(`Driver notified of ${pendingRides.length} pending rides`);
                    pendingRides.forEach(ride => {
                        io.to(`driver:${data.driverId}`).emit("ride:new_request", {
                            rideId: ride._id,
                            frontendRideId: ride.rideId || ride._id,
                            passengerId: ride.passenger,
                            pickupLocation: {
                                address: ride.pickupLocation.address,
                                lat: ride.pickupLocation.coordinates[1],
                                lng: ride.pickupLocation.coordinates[0]
                            },
                            dropoffLocation: {
                                address: ride.dropoffLocation.address,
                                lat: ride.dropoffLocation.coordinates[1],
                                lng: ride.dropoffLocation.coordinates[0]
                            },
                            fare: ride.fare,
                            distance: ride.distance,
                            duration: ride.duration,
                            vehicleType: ride.vehicleType,
                            timestamp: new Date()
                        });
                    });
                }
            }

        } catch (error) {
            console.error("partner:online error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    socket.on("partner:offline", async (data) => {
        try {
            if (!data || !data.driverId) return;
            console.log(`Partner ${data.driverId} OFFLINE`);
            socket.leave(`driver:${data.driverId}`);
            socket.leave("active_drivers");

            await User.findByIdAndUpdate(data.driverId, {
                isOnline: false,
                currentStatus: 'offline',
                socketId: null
            });

            await PartnerProfile.findOneAndUpdate(
                { user: data.driverId },
                { isOnline: false, isAvailable: false }
            );

        } catch (error) {
            console.error("partner:offline error:", error.message);
        }
    });

    socket.on("partner:location_sync", async (data) => {
        try {
            if (!data || !data.driverId || !data.latitude || !data.longitude) return;
            const lat = Number(data.latitude);
            const lng = Number(data.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            await User.findByIdAndUpdate(data.driverId, {
                currentLocation: {
                    type: "Point",
                    coordinates: [lng, lat]
                },
                lastLocationUpdate: new Date()
            });

            await PartnerProfile.findOneAndUpdate(
                { user: data.driverId },
                {
                    currentLocation: {
                        type: "Point",
                        coordinates: [lng, lat]
                    }
                }
            );

            console.log(`Driver ${data.driverId} location synced: ${lat}, ${lng}`);
        } catch (error) {
            console.error("partner:location_sync error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // RIDE REQUEST CREATE (Passenger books a ride) - OTP REMOVED
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:request_create", async (data) => {
        try {
            const { rideId, fare, actualFare, distance, duration, vehicleType, passenger, pickupLocation, dropoffLocation } = data;

            console.log("ride:request_create:", JSON.stringify({ rideId, vehicleType, passenger: passenger?.name }));

            if (!passenger?.id || !pickupLocation || !dropoffLocation || !vehicleType) {
                socket.emit("ride:error", { message: "Missing required fields" });
                return;
            }

            const pickupLat = Number(pickupLocation.lat);
            const pickupLng = Number(pickupLocation.lng);
            if (isNaN(pickupLat) || isNaN(pickupLng)) {
                socket.emit("ride:error", { message: "Invalid pickup coordinates" });
                return;
            }

            const ride = await Ride.create({
                rideId: rideId || undefined,
                passenger: passenger.id,
                pickupLocation: {
                    address: pickupLocation.address,
                    coordinates: [pickupLng, pickupLat]
                },
                dropoffLocation: {
                    address: dropoffLocation.address,
                    coordinates: [Number(dropoffLocation.lng), Number(dropoffLocation.lat)]
                },
                fare: fare || actualFare,
                distance,
                duration,
                vehicleType,
                status: "PENDING"
                // NO OTP generated
            });

            console.log(`Ride created: ${ride._id}`);

            // Find nearby drivers
            let nearbyPartners = [];
            try {
                nearbyPartners = await PartnerProfile.find({
                    isOnline: true,
                    isVerified: true,
                    vehicleType: vehicleType,
                    currentLocation: {
                        $near: {
                            $geometry: {
                                type: "Point",
                                coordinates: [pickupLng, pickupLat]
                            },
                            $maxDistance: 5000
                        }
                    }
                }).populate("user", "name phone rating");
            } catch (geoError) {
                console.log(`Geo query failed, using fallback: ${geoError.message}`);
                nearbyPartners = await PartnerProfile.find({
                    isOnline: true,
                    isVerified: true,
                    vehicleType: vehicleType
                }).populate("user", "name phone rating").limit(10);
            }

            // Notify nearby drivers
            if (nearbyPartners.length > 0) {
                nearbyPartners.forEach(partner => {
                    const driverId = partner.user?._id?.toString();
                    if (!driverId) return;

                    io.to(`driver:${driverId}`).emit("ride:new_request", {
                        rideId: ride._id,
                        frontendRideId: ride.rideId || ride._id,
                        passengerId: passenger.id,
                        passengerName: passenger.name,
                        pickupLocation,
                        dropoffLocation,
                        fare: fare || actualFare,
                        actualFare,
                        distance,
                        duration,
                        vehicleType,
                        timestamp: new Date()
                    });
                });

                socket.emit("ride:searching", {
                    rideId: ride._id,
                    frontendRideId: ride.rideId,
                    driversNotified: nearbyPartners.length,
                    status: "PENDING"
                });
            } else {
                // Fallback: broadcast to all online drivers
                const allOnlineDrivers = await PartnerProfile.find({
                    isOnline: true
                }).populate("user", "name phone rating").limit(20);

                allOnlineDrivers.forEach(partner => {
                    const driverId = partner.user?._id?.toString();
                    if (!driverId) return;

                    io.to(`driver:${driverId}`).emit("ride:new_request", {
                        rideId: ride._id,
                        frontendRideId: ride.rideId || ride._id,
                        passengerId: passenger.id,
                        passengerName: passenger.name,
                        pickupLocation,
                        dropoffLocation,
                        fare: fare || actualFare,
                        actualFare,
                        distance,
                        duration,
                        vehicleType,
                        timestamp: new Date()
                    });
                });

                socket.emit("ride:searching", {
                    rideId: ride._id,
                    frontendRideId: ride.rideId,
                    driversNotified: allOnlineDrivers.length,
                    status: "PENDING",
                    note: "Broadcast to all online drivers"
                });
            }

        } catch (error) {
            console.error("ride:request_create error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DRIVER ACCEPTS RIDE - OTP REMOVED
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:accept_intent", async (data) => {
        try {
            const { rideId, driverId } = data;
            const ride = await resolveRide(rideId);
            if (!ride || ride.status !== "PENDING") {
                socket.emit("ride:error", { message: "Ride not available" });
                return;
            }

            const updatedRide = await Ride.findByIdAndUpdate(
                ride._id,
                { partner: driverId, status: "ACCEPTED", acceptedAt: new Date() },
                { returnDocument: 'after' }
            ).populate('passenger');

            await User.findByIdAndUpdate(driverId, { currentStatus: 'busy' });
            await PartnerProfile.findOneAndUpdate(
                { user: driverId },
                { isAvailable: false }
            );

            const driver = await User.findById(driverId).select("name phone vehicle currentLocation rating");

            // Join ride room for both chat and tracking
            socket.join(`ride_${ride._id}`);

            // Also make passenger join the ride room
            io.to(`user:${ride.passenger._id.toString()}`).emit("ride:join_room", {
                rideId: ride._id,
                room: `ride_${ride._id}`
            });

            // Notify passenger - NO OTP
            io.to(`user:${ride.passenger._id.toString()}`).emit("ride:accepted_by_driver", {
                rideId: updatedRide._id,
                frontendRideId: updatedRide.rideId,
                driverId,
                driverName: driver.name,
                driverPhone: driver.phone,
                vehicle: driver.vehicle,
                driverLocation: driver.currentLocation,
                rating: driver.rating,
                estimatedArrival: "5 mins",
                fare: updatedRide.fare
                // OTP REMOVED
            });

            // Confirm to driver
            socket.emit("ride:accept_confirmed", {
                rideId: updatedRide._id,
                frontendRideId: updatedRide.rideId,
                passengerId: updatedRide.passenger._id,
                passengerName: updatedRide.passenger.name,
                pickup: updatedRide.pickupLocation,
                dropoff: updatedRide.dropoffLocation,
                fare: updatedRide.fare
            });

            console.log(`Ride ${rideId} accepted by driver: ${driverId}`);

        } catch (error) {
            console.error("ride:accept_intent error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DRIVER COUNTER OFFER (Negotiation)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:driver_counter_offer", async (data) => {
        try {
            const { rideId, driverId, offeredFare } = data;
            const ride = await resolveRide(rideId);
            if (!ride || ride.status !== "PENDING") {
                socket.emit("ride:error", { message: "Ride not available" });
                return;
            }
            const driver = await User.findById(driverId).select("name vehicle rating");
            io.to(`user:${ride.passenger}`).emit("ride:partner_counter_offer", {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                driverId,
                driverName: driver?.name || "Driver",
                vehicle: driver?.vehicle,
                rating: driver?.rating,
                offeredFare,
                timestamp: new Date()
            });
            console.log(`Driver ${driverId} offered Rs.${offeredFare} for ride ${rideId}`);
        } catch (error) {
            console.error("ride:driver_counter_offer error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PASSENGER ACCEPTS COUNTER OFFER
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:passenger_accept_counter", async (data) => {
        try {
            const { rideId, driverId, finalFare } = data;

            const ride = await resolveAndUpdateRide(
                rideId,
                { partner: driverId, fare: finalFare, status: "ACCEPTED", acceptedAt: new Date() },
                {}
            );

            if (!ride) {
                socket.emit("ride:error", { message: "Ride not found" });
                return;
            }

            const populatedRide = await Ride.findById(ride._id).populate('passenger');

            await User.findByIdAndUpdate(driverId, { currentStatus: 'busy' });
            await PartnerProfile.findOneAndUpdate(
                { user: driverId },
                { isAvailable: false }
            );

            const driver = await User.findById(driverId).select("name phone vehicle currentLocation rating");

            // Join rooms
            const driverSockets = await io.in(`driver:${driverId}`).fetchSockets();
            driverSockets.forEach(s => s.join(`ride_${ride._id}`));

            // Notify driver
            io.to(`driver:${driverId}`).emit("ride:accept_confirmed", {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                passengerId: populatedRide.passenger._id,
                passengerName: populatedRide.passenger.name,
                pickup: ride.pickupLocation,
                dropoff: ride.dropoffLocation,
                fare: finalFare
            });

            // Notify passenger - NO OTP
            io.to(`user:${populatedRide.passenger._id}`).emit("ride:accepted_by_driver", {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                driverId,
                driverName: driver.name,
                driverPhone: driver.phone,
                vehicle: driver.vehicle,
                driverLocation: driver.currentLocation,
                rating: driver.rating,
                estimatedArrival: "5 mins",
                fare: finalFare
            });

            console.log(`Ride ${rideId} accepted. Driver: ${driverId}`);

        } catch (error) {
            console.error("ride:passenger_accept_counter error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PASSENGER REJECTS COUNTER OFFER
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:passenger_reject_counter", async (data) => {
        try {
            const { rideId, driverId } = data;
            const ride = await resolveRide(rideId);
            const resolvedRideId = ride ? ride._id : rideId;

            io.to(`driver:${driverId}`).emit("ride:counter_rejected", {
                rideId: resolvedRideId,
                frontendRideId: ride?.rideId,
                message: "Passenger declined your offer"
            });
        } catch (error) {
            console.error("ride:passenger_reject_counter error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DRIVER MARKS AS ARRIVED (NEW - replaces OTP verification)
    // ═══════════════════════════════════════════════════════════════
    socket.on("driver:arrived", async (data) => {
        try {
            const { rideId } = data;
            const ride = await resolveRide(rideId);

            if (!ride || ride.status !== "ACCEPTED") {
                socket.emit("ride:error", { message: "Ride not in accepted state" });
                return;
            }

            if (ride.partner?.toString() !== socket.user?._id?.toString()) {
                socket.emit("ride:error", { message: "Not authorized" });
                return;
            }

            const updatedRide = await Ride.findByIdAndUpdate(
                ride._id,
                { status: "ARRIVED", arrivedAt: new Date() },
                { returnDocument: 'after' }
            );

            // Notify passenger
            io.to(`user:${ride.passenger.toString()}`).emit("ride:driver_arrived", {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                message: "Driver has arrived at your pickup location!",
                timestamp: new Date()
            });

            // Also notify ride room
            io.to(`ride_${ride._id}`).emit("ride:status_updated", {
                status: "ARRIVED",
                rideId: ride._id
            });

            socket.emit("ride:arrive_confirmed", {
                rideId: ride._id,
                status: "ARRIVED"
            });

            console.log(`Driver arrived at ride ${rideId}`);

        } catch (error) {
            console.error("driver:arrived error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // START RIDE (Driver starts trip - replaces OTP verification)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:start_trip", async (data) => {
        try {
            const { rideId } = data;
            const ride = await resolveRide(rideId);

            if (!ride || ride.status !== "ARRIVED") {
                socket.emit("ride:error", { message: "Driver must arrive first" });
                return;
            }

            if (ride.partner?.toString() !== socket.user?._id?.toString()) {
                socket.emit("ride:error", { message: "Not authorized" });
                return;
            }

            await Ride.findByIdAndUpdate(ride._id, { 
                status: "ONGOING", 
                startedAt: new Date() 
            });

            io.to(`ride_${ride._id}`).emit("ride:started", { 
                rideId: ride._id,
                frontendRideId: ride.rideId,
                startedAt: new Date() 
            });

            console.log(`Ride ${rideId} started`);

        } catch (error) {
            console.error("ride:start_trip error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // COMPLETE TRIP
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:complete", async (data) => {
        try {
            const { rideId } = data;
            const ride = await resolveRide(rideId);
            if (!ride) {
                socket.emit("ride:error", { message: "Ride not found" });
                return;
            }

            const updatedRide = await Ride.findByIdAndUpdate(
                ride._id,
                { status: "COMPLETED", completedAt: new Date() },
                { returnDocument: 'after' }
            );

            await User.findByIdAndUpdate(ride.partner, { currentStatus: 'available' });
            await PartnerProfile.findOneAndUpdate(
                { user: ride.partner },
                { isAvailable: true }
            );

            io.to(`ride_${ride._id}`).emit("ride:finished", {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                status: "COMPLETED",
                fare: updatedRide.fare
            });
        } catch (error) {
            console.error("ride:complete error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // CANCEL RIDE BY PASSENGER
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:cancel_by_passenger", async (data) => {
        try {
            const { rideId } = data;
            console.log(`Cancelling ride: ${rideId}`);

            let ride;
            if (rideId && typeof rideId === 'string' && rideId.startsWith("ride_")) {
                ride = await Ride.findOneAndUpdate(
                    { rideId: rideId, status: { $in: ["PENDING", "ACCEPTED", "ARRIVED"] } },
                    { status: "CANCELLED", cancelledBy: "user", cancelledAt: new Date() },
                    { returnDocument: 'after' }
                );
            } else {
                ride = await Ride.findByIdAndUpdate(
                    rideId,
                    { status: "CANCELLED", cancelledBy: "user", cancelledAt: new Date() },
                    { returnDocument: 'after' }
                );
            }

            if (!ride) {
                socket.emit("ride:error", { message: "No pending ride found" });
                return;
            }

            if (ride.partner) {
                await User.findByIdAndUpdate(ride.partner, { currentStatus: 'available' });
                await PartnerProfile.findOneAndUpdate(
                    { user: ride.partner },
                    { isAvailable: true }
                );
                io.to(`driver:${ride.partner}`).emit("ride:cancelled_by_other_party", {
                    rideId: ride._id,
                    frontendRideId: ride.rideId,
                    reason: "Passenger cancelled the ride",
                    cancelledBy: "user"
                });
            }

            socket.emit("ride:cancelled_confirmed", { 
                rideId: ride._id,
                frontendRideId: ride.rideId 
            });

        } catch (error) {
            console.error("ride:cancel_by_passenger error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // CANCEL RIDE BY DRIVER (NEW - Rider can cancel!)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:cancel_by_driver", async (data) => {
        try {
            const { rideId, reason } = data;
            console.log(`Driver cancelling ride: ${rideId}`);

            const ride = await resolveRide(rideId);
            if (!ride) {
                socket.emit("ride:error", { message: "Ride not found" });
                return;
            }

            // Verify driver owns this ride
            if (ride.partner?.toString() !== socket.user?._id?.toString()) {
                socket.emit("ride:error", { message: "You can only cancel your assigned rides" });
                return;
            }

            if (!["ACCEPTED", "ARRIVED"].includes(ride.status)) {
                socket.emit("ride:error", { message: "Cannot cancel ride at this stage" });
                return;
            }

            const updatedRide = await Ride.findByIdAndUpdate(
                ride._id,
                { 
                    status: "CANCELLED", 
                    cancelledBy: "partner", 
                    cancellationReason: reason || "Driver cancelled",
                    cancelledAt: new Date() 
                },
                { returnDocument: 'after' }
            );

            // Free driver
            await User.findByIdAndUpdate(socket.user._id, { currentStatus: 'available' });
            await PartnerProfile.findOneAndUpdate(
                { user: socket.user._id },
                { isAvailable: true }
            );

            // Notify passenger
            io.to(`user:${ride.passenger.toString()}`).emit("ride:cancelled_by_driver", {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                reason: reason || "Driver cancelled",
                cancelledBy: "partner"
            });

            socket.emit("ride:cancel_confirmed", {
                rideId: ride._id,
                message: "Ride cancelled successfully"
            });

            console.log(`Driver ${socket.user._id} cancelled ride ${rideId}`);

        } catch (error) {
            console.error("ride:cancel_by_driver error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // JOIN RIDE ROOM (For chat and tracking)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:join_room", (rideId) => {
        if (!rideId) return;
        console.log(`Joined ride room: ride_${rideId}`);
        socket.join(`ride_${rideId}`);

        // Confirm join
        socket.emit("ride:room_joined", {
            rideId,
            room: `ride_${rideId}`,
            message: "You are now connected to ride updates and chat"
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // GET ACTIVE RIDE (Socket version - for instant recovery)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:get_active", async () => {
        try {
            if (!socket.user?._id) {
                socket.emit("ride:error", { message: "Not authenticated" });
                return;
            }

            const activeRide = await Ride.findOne({
                $or: [
                    { passenger: socket.user._id },
                    { partner: socket.user._id }
                ],
                status: { $in: ["PENDING", "ACCEPTED", "ARRIVED", "ONGOING"] }
            })
            .populate("passenger", "name phone rating currentLocation")
            .populate("partner", "name phone rating currentLocation vehicle")
            .sort({ createdAt: -1 });

            if (activeRide) {
                // Auto-join room
                socket.join(`ride_${activeRide._id}`);

                socket.emit("ride:active_found", {
                    ride: activeRide,
                    room: `ride_${activeRide._id}`
                });
            } else {
                socket.emit("ride:no_active", { message: "No active ride" });
            }
        } catch (error) {
            console.error("ride:get_active error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DISCONNECT
    // ═══════════════════════════════════════════════════════════════
    socket.on("disconnect", async () => {
        console.log(`Disconnected: ${socket.id}`);
        await User.findOneAndUpdate(
            { socketId: socket.id },
            { isOnline: false, currentStatus: 'offline', socketId: null }
        );
        await PartnerProfile.findOneAndUpdate(
            { socketId: socket.id },
            { isOnline: false, isAvailable: false }
        );
    });
};