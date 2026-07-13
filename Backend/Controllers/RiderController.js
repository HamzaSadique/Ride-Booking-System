import Ride from "../Models/ModelRide.js";
import User from "../Models/ModelUser.js";
import PartnerProfile from "../Models/ModelPartner.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import mongoose from "mongoose";

// 1. REQUEST A RIDE (Passenger Side) - OTP REMOVED
export const requestRide = asyncHandler(async (req, res) => {
    const { pickup, dropoff, fare, distance, duration, vehicleType } = req.body;

    if (!pickup || !dropoff || !fare) {
        throw new ApiError(400, "Pickup, dropoff, and fare are required.");
    }

    const ride = await Ride.create({
        passenger: req.user._id,
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        fare,
        distance: distance || "Calculating...",
        duration: duration || "Calculating...",
        vehicleType: vehicleType || "car",
        status: "PENDING"
    });

    const io = req.app.get("io");
    if (io) {
        io.emit("ride:new_request", {
            message: "New ride available near you!",
            ride: ride
        });

        io.to(req.user._id.toString()).emit("ride:request_confirmed", {
            message: "Your ride request has been submitted.",
            rideId: ride._id,
            status: "PENDING"
        });
    }

    return res.status(201).json(
        new ApiResponse(201, ride, "Ride request submitted successfully.")
    );
});

// 2. ACCEPT RIDE (Partner Side) - OTP REMOVED
export const acceptRide = asyncHandler(async (req, res) => {
    const { rideId } = req.params;

    const ride = await Ride.findById(rideId);
    if (!ride) throw new ApiError(404, "Ride not found.");

    if (ride.status !== "PENDING") {
        throw new ApiError(400, "This ride is no longer available.");
    }

    ride.partner = req.user._id;
    ride.status = "ACCEPTED";
    ride.acceptedAt = new Date();
    await ride.save();

    const io = req.app.get("io");
    if (io) {
        io.to(ride.passenger.toString()).emit("ride:accepted", {
            message: "A driver has accepted your ride!",
            rideId: ride._id,
            partner: req.user,
            driverName: req.user.name,
            driverPhone: req.user.phone,
            driverLocation: req.user.currentLocation,
            estimatedArrival: "5 mins"
        });
    }

    return res.status(200).json(
        new ApiResponse(200, ride, "Ride accepted successfully!")
    );
});

// 3. CANCEL RIDE (User/Passenger Side)
export const cancelRide = asyncHandler(async (req, res) => {
    const { rideId } = req.params;
    const ride = await Ride.findById(rideId);

    if (!ride) throw new ApiError(404, "Ride not found.");

    if (!["PENDING", "ACCEPTED", "ARRIVED"].includes(ride.status)) {
        throw new ApiError(400, "Ride cannot be cancelled at this stage.");
    }

    ride.status = "CANCELLED";
    ride.cancelledBy = "user";
    ride.cancelledAt = new Date();
    await ride.save();

    const io = req.app.get("io");
    if (io) {
        if (ride.partner) {
            io.to(`driver:${ride.partner.toString()}`).emit("ride:cancelled_by_user", {
                rideId: ride._id,
                message: "Passenger has cancelled the ride",
                cancelledBy: "user"
            });

            await User.findByIdAndUpdate(ride.partner, { currentStatus: 'available' });
            await PartnerProfile.findOneAndUpdate(
                { user: ride.partner },
                { isAvailable: true }
            );
        }

        io.emit("ride:cancelled", { 
            rideId: ride._id, 
            message: "Ride cancelled by passenger" 
        });
    }

    return res.status(200).json(new ApiResponse(200, {}, "Ride cancelled successfully."));
});

// 4. CANCEL RIDE BY DRIVER (NEW)
export const cancelRideByDriver = asyncHandler(async (req, res) => {
    const { rideId } = req.params;
    const { reason } = req.body;

    const ride = await Ride.findById(rideId);
    if (!ride) throw new ApiError(404, "Ride not found.");

    if (ride.partner?.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only cancel rides assigned to you.");
    }

    if (!["ACCEPTED", "ARRIVED"].includes(ride.status)) {
        throw new ApiError(400, "Ride cannot be cancelled at this stage.");
    }

    ride.status = "CANCELLED";
    ride.cancelledBy = "partner";
    ride.cancellationReason = reason || "Driver cancelled";
    ride.cancelledAt = new Date();
    await ride.save();

    const io = req.app.get("io");
    if (io) {
        io.to(`user:${ride.passenger.toString()}`).emit("ride:cancelled_by_driver", {
            rideId: ride._id,
            message: "Driver has cancelled the ride",
            reason: ride.cancellationReason,
            cancelledBy: "partner"
        });

        await User.findByIdAndUpdate(req.user._id, { currentStatus: 'available' });
        await PartnerProfile.findOneAndUpdate(
            { user: req.user._id },
            { isAvailable: true }
        );
    }

    return res.status(200).json(
        new ApiResponse(200, ride, "Ride cancelled successfully. Passenger notified.")
    );
});

// 5. UPDATE RIDE STATUS
export const updateRideStatus = asyncHandler(async (req, res) => {
    const { rideId } = req.params;
    const { status } = req.body;

    const validStatuses = ["ARRIVED", "ONGOING", "COMPLETED"];
    if (!validStatuses.includes(status)) {
        throw new ApiError(400, "Invalid status update.");
    }

    const ride = await Ride.findById(rideId);
    if (!ride) throw new ApiError(404, "Ride not found.");

    if (ride.partner?.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only update your assigned rides.");
    }

    const flow = {
        "ACCEPTED": ["ARRIVED"],
        "ARRIVED": ["ONGOING"],
        "ONGOING": ["COMPLETED"]
    };

    if (!flow[ride.status]?.includes(status)) {
        throw new ApiError(400, `Cannot change status from ${ride.status} to ${status}.`);
    }

    ride.status = status;

    if (status === "ARRIVED") ride.arrivedAt = new Date();
    if (status === "ONGOING") ride.startedAt = new Date();
    if (status === "COMPLETED") ride.completedAt = new Date();

    await ride.save();

    const io = req.app.get("io");
    if (io) {
        const eventMap = {
            "ARRIVED": "ride:driver_arrived",
            "ONGOING": "ride:started", 
            "COMPLETED": "ride:completed"
        };

        io.to(`user:${ride.passenger.toString()}`).emit(eventMap[status], {
            status: status,
            message: `Ride is now ${status.toLowerCase()}.`,
            rideId: ride._id,
            timestamp: new Date()
        });

        io.to(`ride_${ride._id}`).emit("ride:status_updated", {
            status,
            rideId: ride._id
        });
    }

    return res.status(200).json(
        new ApiResponse(200, ride, `Status updated to: ${status}`)
    );
});

// 6. GET MY ACTIVE RIDE
export const getMyActiveRide = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const activeRide = await Ride.findOne({
        $or: [
            { passenger: userId },
            { partner: userId }
        ],
        status: { $in: ["PENDING", "ACCEPTED", "ARRIVED", "ONGOING"] }
    })
    .populate("passenger", "name phone rating currentLocation")
    .populate("partner", "name phone rating currentLocation vehicle")
    .sort({ createdAt: -1 });

    if (!activeRide) {
        return res.status(200).json(
            new ApiResponse(200, null, "No active ride found.")
        );
    }

    return res.status(200).json(
        new ApiResponse(200, activeRide, "Active ride fetched successfully.")
    );
});

// 7. GET RIDE BY ID
export const getRideById = asyncHandler(async (req, res) => {
    const { rideId } = req.params;

    const ride = await Ride.findById(rideId)
        .populate("passenger", "name phone rating currentLocation")
        .populate("partner", "name phone rating currentLocation vehicle");

    if (!ride) throw new ApiError(404, "Ride not found.");

    const userId = req.user._id.toString();
    const isPassenger = ride.passenger?._id?.toString() === userId;
    const isPartner = ride.partner?._id?.toString() === userId;

    if (!isPassenger && !isPartner) {
        throw new ApiError(403, "You don't have permission to view this ride.");
    }

    return res.status(200).json(
        new ApiResponse(200, ride, "Ride details fetched successfully.")
    );
});

// 8. GET RIDE HISTORY / ANALYSIS
export const getUserRideAnalysis = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const stats = await Ride.aggregate([
        { 
            $match: { 
                $or: [
                    { passenger: new mongoose.Types.ObjectId(userId) }, 
                    { partner: new mongoose.Types.ObjectId(userId) }
                ] 
            } 
        },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalFare: { $sum: "$fare" },
                cancelledByMe: { 
                    $sum: { 
                        $cond: [
                            { $eq: ["$cancelledById", new mongoose.Types.ObjectId(userId)] }, 
                            1, 
                            0
                        ] 
                    } 
                }
            }
        }
    ]);

    return res.status(200).json(
        new ApiResponse(200, stats, "User ride history analyzed successfully")
    );
});

// 9. GET ALL RIDES
export const getAllRides = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) query.status = status;

    if (req.user.role === 'partner') {
        query.$or = [
            { status: "PENDING" },
            { partner: req.user._id }
        ];
    }
    else if (req.user.role === 'passenger') {
        query.passenger = req.user._id;
    }

    const rides = await Ride.find(query)
        .populate("passenger", "name phone")
        .populate("partner", "name phone vehicle")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

    const total = await Ride.countDocuments(query);

    return res.status(200).json(
        new ApiResponse(200, { rides, total, pages: Math.ceil(total / limit) }, "Rides fetched successfully")
    );
});