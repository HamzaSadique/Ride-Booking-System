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
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    dropoffLocation: {
        address: { type: String, required: true },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    fare: { type: Number, required: true },

    adminCommission: { type: Number, default: 0 },
    partnerEarning: { type: Number, default: 0 },

    distance: { type: String }, 
    duration: { type: String }, 

    vehicleType: { 
        type: String, 
        enum: ['bike', 'car', 'rickshaw', 'auto', 'van', null],
        default: null
    },

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

    // ✅ NEW: Status history for timeline tracking
    statusHistory: [{
        status: {
            type: String,
            enum: ["PENDING", "ACCEPTED", "ARRIVED", "ONGOING", "COMPLETED", "CANCELLED"]
        },
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }],

    // ✅ NEW: Driver route tracking (for map polyline)
    driverRoute: [{
        latitude: Number,
        longitude: Number,
        timestamp: { type: Date, default: Date.now }
    }],

    // ✅ NEW: ETA tracking
    estimatedArrivalTime: { type: Date, default: null },
    actualArrivalTime: { type: Date, default: null },

    // ✅ NEW: Last known driver location
    lastDriverLocation: {
        latitude: Number,
        longitude: Number,
        heading: Number,
        accuracy: Number,
        timestamp: { type: Date, default: Date.now }
    },

    // ✅ NEW: Counter offer tracking
    counterOffer: {
        offeredFare: { type: Number, default: null },
        offeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        offeredAt: { type: Date, default: null },
        status: { 
            type: String, 
            enum: ["PENDING", "ACCEPTED", "REJECTED", null], 
            default: null 
        }
    },

}, { timestamps: true });

// ============================================
// INDEXES
// ============================================

// CRITICAL: For 5km radius query
rideSchema.index({ "pickupLocation.coordinates": "2dsphere" });

// ✅ NEW: For driver location queries
rideSchema.index({ "lastDriverLocation.coordinates": "2dsphere" });

// Additional indexes for performance
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ passenger: 1, status: 1 });
rideSchema.index({ partner: 1, status: 1 });
rideSchema.index({ vehicleType: 1, status: 1 });


// ============================================
// PRE-SAVE HOOKS
// ============================================

rideSchema.pre("save", function(next) {
    if (this.isModified("status") && this.status) {
        this.statusHistory.push({
            status: this.status,
            timestamp: new Date(),
            updatedBy: this._updatedBy || this.partner || this.passenger
        });
    }
    if (typeof next === 'function') next();  // ✅ Safety check
});


// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Update ride status with automatic timestamp tracking
 * @param {string} newStatus - New status value
 * @param {ObjectId} updatedBy - User who updated
 * @returns {Promise} Saved ride document
 */
rideSchema.methods.updateStatus = function(newStatus, updatedBy) {
    this.status = newStatus;
    this._updatedBy = updatedBy;

    const now = new Date();
    switch(newStatus) {
        case "ACCEPTED":
            this.acceptedAt = now;
            break;
        case "ARRIVED":
            this.arrivedAt = now;
            this.actualArrivalTime = now;
            break;
        case "ONGOING":
            this.startedAt = now;
            break;
        case "COMPLETED":
            this.completedAt = now;
            this.paymentStatus = "PAID";
            break;
        case "CANCELLED":
            this.cancelledAt = now;
            break;
    }
    return this.save();
};

/**
 * Add driver location point to route
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} heading - Direction
 * @param {number} accuracy - GPS accuracy
 */
rideSchema.methods.addRoutePoint = function(lat, lng, heading, accuracy) {
    this.lastDriverLocation = {
        latitude: lat,
        longitude: lng,
        heading: heading || 0,
        accuracy: accuracy || 10,
        timestamp: new Date()
    };
    this.driverRoute.push({
        latitude: lat,
        longitude: lng,
        timestamp: new Date()
    });
    return this.save();
};


const Ride = mongoose.model("Ride", rideSchema);
export default Ride;