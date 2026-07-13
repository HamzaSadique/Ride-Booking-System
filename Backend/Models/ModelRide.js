import mongoose from "mongoose";

const rideSchema = new mongoose.Schema({
    passenger: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    partner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    pickupLocation: {
        address: { type: String, required: true },
        coordinates: { type: [Number], required: true }
    },
    dropoffLocation: {
        address: { type: String, required: true },
        coordinates: { type: [Number], required: true }
    },
    fare: { type: Number, required: true },
    
    adminCommission: { type: Number, default: 0 },
    partnerEarning: { type: Number, default: 0 },

    distance: { type: String }, 
    duration: { type: String }, 
    
    status: {
        type: String,
        enum: ["PENDING", "ACCEPTED", "ARRIVED", "ONGOING", "COMPLETED", "CANCELLED"],
        default: "PENDING"
    },

    cancelledBy: { 
        type: String, 
        enum: ["user", "partner", "admin", null], 
        default: null 
    },
    cancellationReason: { type: String, default: "" },

    paymentStatus: {
        type: String,
        enum: ["PAID", "UNPAID"],
        default: "UNPAID"
    },
    otp: { type: String },

    rideId: { 
        type: String, 
        unique: true, 
        sparse: true
    },

    acceptedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

}, { timestamps: true });

// CRITICAL: For 5km radius query
rideSchema.index({ "pickupLocation.coordinates": "2dsphere" });

// REMOVED: rideSchema.index({ rideId: 1 });  ← was duplicate, unique: true already handles it

// Additional indexes for performance
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ passenger: 1, status: 1 });
rideSchema.index({ partner: 1, status: 1 });

const Ride = mongoose.model("Ride", rideSchema);
export default Ride;