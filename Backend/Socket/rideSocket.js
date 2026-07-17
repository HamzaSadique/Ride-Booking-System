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
    console.log(`🔌 Socket active: ${socket.id} | User: ${socket.user?._id} | Role: ${socket.user?.role}`);

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
                console.log("❌ partner:online missing driverId");
                return;
            }

            const lat = Number(data.latitude || data.lat);
            const lng = Number(data.longitude || data.lng);

            console.log(`🟢 Partner ${data.driverId} ONLINE at ${lat}, ${lng}`);

            if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                console.error(`❌ Invalid coordinates`);
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

            // ✅ Send pending rides to driver (filtered by vehicleType)
            if (partnerProfile && partnerProfile.vehicleType) {
                console.log(`📋 Driver vehicle type: ${partnerProfile.vehicleType}`);
                
                const pendingRides = await Ride.find({
                    status: "PENDING",
                    vehicleType: partnerProfile.vehicleType // Match driver's vehicle type
                })
                .populate("passenger", "name phone")
                .sort({ createdAt: -1 })
                .limit(10);

                console.log(`📋 Found ${pendingRides.length} pending ${partnerProfile.vehicleType} rides`);

                if (pendingRides.length > 0) {
                    pendingRides.forEach(ride => {
                        console.log(`  → Sending ride ${ride._id} to ${partnerProfile.vehicleType} driver`);
                        
                        io.to(`driver:${data.driverId}`).emit("ride:new_request", {
                            rideId: ride._id,
                            frontendRideId: ride.rideId || ride._id,
                            passengerId: ride.passenger?._id || ride.passenger,
                            passengerName: ride.passenger?.name || "Passenger",
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
                } else {
                    console.log(`📋 No pending ${partnerProfile.vehicleType} rides available`);
                }
            } else {
                console.log(`⚠️ Partner profile incomplete or vehicleType not set`);
            }

        } catch (error) {
            console.error("❌ partner:online error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PARTNER OFFLINE
    // ═══════════════════════════════════════════════════════════════
    socket.on("partner:offline", async (data) => {
        try {
            if (!data || !data.driverId) return;
            console.log(`🔴 Partner ${data.driverId} OFFLINE`);
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
            console.error("❌ partner:offline error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PARTNER LOCATION SYNC
    // ═══════════════════════════════════════════════════════════════
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

            console.log(`📍 Driver ${data.driverId} location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } catch (error) {
            console.error("❌ partner:location_sync error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // RIDE REQUEST CREATE (Passenger books a ride)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:request_create", async (data) => {
        try {
            const { rideId, fare, actualFare, distance, duration, vehicleType, passenger, pickupLocation, dropoffLocation } = data;

            console.log("🚗 NEW RIDE REQUEST:", JSON.stringify({ 
                rideId, 
                vehicleType, 
                passenger: passenger?.name 
            }));

            if (!passenger?.id || !pickupLocation || !dropoffLocation || !vehicleType) {
                console.error("❌ Missing required fields:", { 
                    hasPassenger: !!passenger?.id, 
                    hasPickup: !!pickupLocation, 
                    hasDropoff: !!dropoffLocation, 
                    hasVehicleType: !!vehicleType 
                });
                socket.emit("ride:error", { message: "Missing required fields" });
                return;
            }

            const pickupLat = Number(pickupLocation.lat);
            const pickupLng = Number(pickupLocation.lng);
            if (isNaN(pickupLat) || isNaN(pickupLng)) {
                socket.emit("ride:error", { message: "Invalid pickup coordinates" });
                return;
            }

            // ✅ Create ride with vehicleType stored
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
                vehicleType: vehicleType, // ✅ Store vehicle type
                status: "PENDING"
            });

            console.log(`✅ Ride created: ${ride._id} | Vehicle: ${vehicleType} | Fare: Rs.${fare || actualFare}`);

            // ✅ Find drivers with MATCHING vehicle type within 5km
            let nearbyPartners = [];
            try {
                nearbyPartners = await PartnerProfile.find({
                    isOnline: true,
                    isVerified: true,
                    vehicleType: vehicleType, // ✅ Match vehicle type
                    currentLocation: {
                        $near: {
                            $geometry: {
                                type: "Point",
                                coordinates: [pickupLng, pickupLat]
                            },
                            $maxDistance: 5000 // 5km
                        }
                    }
                }).populate("user", "name phone rating");
                
                console.log(`📍 Geo query: Found ${nearbyPartners.length} ${vehicleType} drivers within 5km`);
            } catch (geoError) {
                console.log(`⚠️ Geo query failed: ${geoError.message}`);
                // Fallback: Find all online drivers with matching vehicle type
                nearbyPartners = await PartnerProfile.find({
                    isOnline: true,
                    isVerified: true,
                    vehicleType: vehicleType
                }).populate("user", "name phone rating").limit(20);
                console.log(`📍 Fallback: Found ${nearbyPartners.length} ${vehicleType} drivers`);
            }

            // Notify matching drivers
            if (nearbyPartners.length > 0) {
                console.log(`📢 Broadcasting to ${nearbyPartners.length} ${vehicleType} drivers`);
                
                nearbyPartners.forEach((partner, index) => {
                    const driverId = partner.user?._id?.toString();
                    if (!driverId) return;

                    console.log(`  ${index + 1}. → Driver: ${driverId} (${partner.user?.name})`);

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
                        vehicleType: vehicleType,
                        timestamp: new Date()
                    });
                });

                socket.emit("ride:searching", {
                    rideId: ride._id,
                    frontendRideId: ride.rideId,
                    driversNotified: nearbyPartners.length,
                    vehicleType: vehicleType,
                    status: "PENDING"
                });
            } else {
                console.log(`⚠️ No online ${vehicleType} drivers found!`);
                socket.emit("ride:searching", {
                    rideId: ride._id,
                    frontendRideId: ride.rideId,
                    driversNotified: 0,
                    vehicleType: vehicleType,
                    status: "PENDING",
                    note: `No ${vehicleType} drivers available. Try another vehicle type.`
                });
            }

        } catch (error) {
            console.error("❌ ride:request_create error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DRIVER ACCEPTS RIDE
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:accept_intent", async (data) => {
        try {
            const { rideId, driverId } = data;
            console.log(`✅ Driver ${driverId} accepting ride ${rideId}`);
            
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

            // Join ride room for tracking and chat
            socket.join(`ride_${ride._id}`);

            // Prepare passenger notification data
            const passengerData = {
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
            };

            // Notify passenger through multiple channels
            io.to(`user:${ride.passenger._id.toString()}`).emit("ride:accepted_by_driver", passengerData);
            io.to(ride.passenger._id.toString()).emit("ride:accepted_by_driver", passengerData);
            io.to(`ride_${ride._id}`).emit("ride:accepted_by_driver", passengerData);

            // Tell passenger to join ride room
            io.to(`user:${ride.passenger._id.toString()}`).emit("ride:join_room", {
                rideId: ride._id,
                room: `ride_${ride._id}`
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

            console.log(`🎉 Ride ${rideId} accepted by driver ${driverId}`);

        } catch (error) {
            console.error("❌ ride:accept_intent error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DRIVER COUNTER OFFER (Negotiation)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:driver_counter_offer", async (data) => {
        try {
            const { rideId, driverId, offeredFare } = data;
            console.log(`💰 Driver ${driverId} counter offer: Rs.${offeredFare} for ride ${rideId}`);
            
            const ride = await resolveRide(rideId);
            if (!ride || ride.status !== "PENDING") {
                socket.emit("ride:error", { message: "Ride not available" });
                return;
            }
            
            const driver = await User.findById(driverId).select("name vehicle rating");
            
            const counterData = {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                driverId,
                driverName: driver?.name || "Driver",
                vehicle: driver?.vehicle,
                rating: driver?.rating,
                offeredFare,
                timestamp: new Date()
            };

            // Send to passenger through multiple channels
            io.to(`user:${ride.passenger}`).emit("ride:partner_counter_offer", counterData);
            io.to(ride.passenger.toString()).emit("ride:partner_counter_offer", counterData);
            
            console.log(`📤 Counter offer sent to passenger`);
        } catch (error) {
            console.error("❌ ride:driver_counter_offer error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PASSENGER ACCEPTS COUNTER OFFER
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:passenger_accept_counter", async (data) => {
        try {
            const { rideId, driverId, finalFare } = data;
            console.log(`✅ Passenger accepted counter offer for ride ${rideId}. Fare: Rs.${finalFare}`);

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

            // Join ride room
            socket.join(`ride_${ride._id}`);

            // Notify driver
            const driverConfirmData = {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                passengerId: populatedRide.passenger._id,
                passengerName: populatedRide.passenger.name,
                pickup: ride.pickupLocation,
                dropoff: ride.dropoffLocation,
                fare: finalFare
            };

            io.to(`driver:${driverId}`).emit("ride:accept_confirmed", driverConfirmData);
            io.to(driverId.toString()).emit("ride:accept_confirmed", driverConfirmData);
            io.to(`ride_${ride._id}`).emit("ride:accept_confirmed", driverConfirmData);

            // Notify passenger
            const passengerData = {
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
            };

            socket.emit("ride:accepted_by_driver", passengerData);

            console.log(`🎉 Counter offer accepted. Ride ${rideId} confirmed!`);

        } catch (error) {
            console.error("❌ ride:passenger_accept_counter error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // PASSENGER REJECTS COUNTER OFFER
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:passenger_reject_counter", async (data) => {
        try {
            const { rideId, driverId } = data;
            console.log(`❌ Passenger rejected counter offer for ride ${rideId}`);
            
            const ride = await resolveRide(rideId);
            const resolvedRideId = ride ? ride._id : rideId;

            const rejectionData = {
                rideId: resolvedRideId,
                frontendRideId: ride?.rideId,
                message: "Passenger declined your offer"
            };

            io.to(`driver:${driverId}`).emit("ride:counter_rejected", rejectionData);
            io.to(driverId.toString()).emit("ride:counter_rejected", rejectionData);
            
            console.log(`📤 Rejection sent to driver ${driverId}`);
        } catch (error) {
            console.error("❌ ride:passenger_reject_counter error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DRIVER MARKS AS ARRIVED
    // ═══════════════════════════════════════════════════════════════
    socket.on("driver:arrived", async (data) => {
        try {
            const { rideId } = data;
            console.log(`🚗 Driver arrived for ride ${rideId}`);
            
            const ride = await resolveRide(rideId);

            if (!ride || ride.status !== "ACCEPTED") {
                socket.emit("ride:error", { message: "Ride not in accepted state" });
                return;
            }

            if (ride.partner?.toString() !== socket.user?._id?.toString()) {
                socket.emit("ride:error", { message: "Not authorized" });
                return;
            }

            await Ride.findByIdAndUpdate(
                ride._id,
                { status: "ARRIVED", arrivedAt: new Date() },
                { returnDocument: 'after' }
            );

            const arrivalData = {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                message: "Driver has arrived at your pickup location!",
                timestamp: new Date()
            };

            // Notify passenger through multiple channels
            io.to(`user:${ride.passenger.toString()}`).emit("ride:driver_arrived", arrivalData);
            io.to(ride.passenger.toString()).emit("ride:driver_arrived", arrivalData);
            io.to(`ride_${ride._id}`).emit("ride:driver_arrived", arrivalData);
            io.to(`ride_${ride._id}`).emit("ride:status_updated", {
                status: "ARRIVED",
                rideId: ride._id
            });

            socket.emit("ride:arrive_confirmed", {
                rideId: ride._id,
                status: "ARRIVED"
            });

            console.log(`✅ Driver arrived at pickup for ride ${rideId}`);

        } catch (error) {
            console.error("❌ driver:arrived error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // START RIDE (Driver starts trip)
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

            const startData = { 
                rideId: ride._id,
                frontendRideId: ride.rideId,
                startedAt: new Date() 
            };

            // Notify all channels
            io.to(`ride_${ride._id}`).emit("ride:started", startData);
            io.to(`user:${ride.passenger}`).emit("ride:started", startData);
            io.to(ride.passenger.toString()).emit("ride:started", startData);

            console.log(`🏁 Trip started for ride ${rideId}`);

        } catch (error) {
            console.error("❌ ride:start_trip error:", error.message);
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

            const finishData = {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                status: "COMPLETED",
                fare: updatedRide.fare
            };

            io.to(`ride_${ride._id}`).emit("ride:finished", finishData);
            io.to(`user:${ride.passenger}`).emit("ride:finished", finishData);
            io.to(`driver:${ride.partner}`).emit("ride:finished", finishData);
            
            console.log(`✅ Ride ${rideId} completed successfully`);

        } catch (error) {
            console.error("❌ ride:complete error:", error.message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // CANCEL RIDE BY PASSENGER
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:cancel_by_passenger", async (data) => {
        try {
            const { rideId } = data;
            console.log(`❌ Passenger cancelling ride: ${rideId}`);

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

            const cancelData = {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                reason: "Passenger cancelled the ride",
                cancelledBy: "user"
            };

            if (ride.partner) {
                await User.findByIdAndUpdate(ride.partner, { currentStatus: 'available' });
                await PartnerProfile.findOneAndUpdate(
                    { user: ride.partner },
                    { isAvailable: true }
                );

                io.to(`driver:${ride.partner}`).emit("ride:cancelled_by_other_party", cancelData);
                io.to(ride.partner.toString()).emit("ride:cancelled_by_other_party", cancelData);
                io.to(`ride_${ride._id}`).emit("ride:cancelled_by_other_party", cancelData);
            }

            socket.emit("ride:cancelled_confirmed", { 
                rideId: ride._id,
                frontendRideId: ride.rideId 
            });

            io.to(`ride_${ride._id}`).emit("ride:cancelled_by_other_party", cancelData);

            console.log(`✅ Ride ${rideId} cancelled by passenger`);

        } catch (error) {
            console.error("❌ ride:cancel_by_passenger error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // CANCEL RIDE BY DRIVER
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:cancel_by_driver", async (data) => {
        try {
            const { rideId, reason } = data;
            console.log(`❌ Driver cancelling ride: ${rideId}`);

            const ride = await resolveRide(rideId);
            if (!ride) {
                socket.emit("ride:error", { message: "Ride not found" });
                return;
            }

            if (ride.partner?.toString() !== socket.user?._id?.toString()) {
                socket.emit("ride:error", { message: "You can only cancel your assigned rides" });
                return;
            }

            if (!["ACCEPTED", "ARRIVED"].includes(ride.status)) {
                socket.emit("ride:error", { message: "Cannot cancel ride at this stage" });
                return;
            }

            await Ride.findByIdAndUpdate(
                ride._id,
                { 
                    status: "CANCELLED", 
                    cancelledBy: "partner", 
                    cancellationReason: reason || "Driver cancelled",
                    cancelledAt: new Date() 
                },
                { returnDocument: 'after' }
            );

            await User.findByIdAndUpdate(socket.user._id, { currentStatus: 'available' });
            await PartnerProfile.findOneAndUpdate(
                { user: socket.user._id },
                { isAvailable: true }
            );

            const cancelData = {
                rideId: ride._id,
                frontendRideId: ride.rideId,
                reason: reason || "Driver cancelled",
                cancelledBy: "partner"
            };

            io.to(`user:${ride.passenger.toString()}`).emit("ride:cancelled_by_driver", cancelData);
            io.to(ride.passenger.toString()).emit("ride:cancelled_by_driver", cancelData);
            io.to(`ride_${ride._id}`).emit("ride:cancelled_by_driver", cancelData);

            socket.emit("ride:cancel_confirmed", {
                rideId: ride._id,
                message: "Ride cancelled successfully"
            });

            console.log(`✅ Ride ${rideId} cancelled by driver`);

        } catch (error) {
            console.error("❌ ride:cancel_by_driver error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // JOIN RIDE ROOM (For chat and tracking)
    // ═══════════════════════════════════════════════════════════════
    socket.on("ride:join_room", async (rideId) => {
        if (!rideId) return;
        
        try {
            const ride = await resolveRide(rideId);
            if (!ride) {
                socket.emit("ride:error", { message: "Ride not found" });
                return;
            }

            const userId = socket.user?._id?.toString();
            const isPassenger = ride.passenger?.toString() === userId;
            const isPartner = ride.partner?.toString() === userId;

            if (!isPassenger && !isPartner) {
                socket.emit("ride:error", { message: "Not authorized for this ride" });
                return;
            }
        } catch (err) {
            socket.emit("ride:error", { message: "Error verifying ride access" });
            return;
        }

        console.log(`🚪 User joined ride room: ride_${rideId}`);
        socket.join(`ride_${rideId}`);

        socket.emit("ride:room_joined", {
            rideId,
            room: `ride_${rideId}`,
            message: "Connected to ride updates and chat"
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // GET ACTIVE RIDE (For page refresh recovery)
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
                socket.join(`ride_${activeRide._id}`);
                socket.emit("ride:active_found", {
                    ride: activeRide,
                    room: `ride_${activeRide._id}`
                });
                console.log(`📦 Active ride recovered: ${activeRide._id} (${activeRide.status})`);
            } else {
                socket.emit("ride:no_active", { message: "No active ride" });
            }
        } catch (error) {
            console.error("❌ ride:get_active error:", error.message);
            socket.emit("ride:error", { message: error.message });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DISCONNECT CLEANUP
    // ═══════════════════════════════════════════════════════════════
    socket.on("disconnect", async () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
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