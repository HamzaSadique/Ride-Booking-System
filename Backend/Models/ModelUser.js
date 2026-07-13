import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ROLES, STATUS } from "../Utils/constants.js";

const userSchema = new mongoose.Schema({
    // ========== BASIC AUTH (Keep existing) ==========
    name: { type: String, required: [true, "Name is required"] },
    email: { 
        type: String, 
        required: [true, "Email is required"], 
        unique: true, 
        lowercase: true 
    },
    password: { 
        type: String, 
        required: function () { return !this.googleId; }, 
        select: false 
    },
    phoneNumber: { 
        type: String, 
        required: [true, "Phone number is required"], 
        unique: true, 
        trim: true 
    },
    role: { 
        type: String, 
        enum: Object.values(ROLES), 
        default: ROLES.USER 
    },
    isVerified: { type: Boolean, default: false },
    status: { 
        type: String, 
        enum: Object.values(STATUS), 
        default: STATUS.PENDING 
    },
    avatar: { type: String, default: "" },
    otp: { type: String, default: null },
    otpExpire: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpire: { type: Date, default: null },

    // ========== LOCATION (Keep existing - used for passenger) ==========
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] },
        address: { type: String, default: "" },
    },

    // ========== DRIVER-SPECIFIC FIELDS (NEW) ==========
    isOnline: { 
        type: Boolean, 
        default: false 
    },
    currentStatus: { 
        type: String, 
        enum: ['offline', 'available', 'busy', 'on_ride', 'on_break'], 
        default: 'offline' 
    },
    currentLocation: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] },
        address: { type: String, default: "" },
    },
    lastLocationUpdate: { 
        type: Date, 
        default: null 
    },
    socketId: { 
        type: String, 
        default: null 
    },

    // ========== VEHICLE INFO (FIXED: Match frontend types) ==========
    vehicle: {
        type: { 
            type: String, 
            // FIXED: Added 'rickshaw' to match frontend
            enum: ['bike', 'car', 'rickshaw', 'auto', 'van'], 
            default: null 
        },
        model: { type: String, default: "" },
        plateNumber: { type: String, default: "" },
        color: { type: String, default: "" },
        year: { type: Number, default: null },
    },

    // ========== DRIVER STATS (NEW) ==========
    rating: { 
        type: Number, 
        default: 5, 
        min: 1, 
        max: 5 
    },
    totalRides: { 
        type: Number, 
        default: 0 
    },
    totalEarnings: { 
        type: Number, 
        default: 0 
    },

    // ========== DOCUMENTS (NEW - For driver verification) ==========
    documents: {
        licenseNumber: { type: String, default: "" },
        licensePhoto: { type: String, default: "" },
        vehicleRegistration: { type: String, default: "" },
        insurancePhoto: { type: String, default: "" },
        isVerified: { type: Boolean, default: false },
    },

}, { timestamps: true });

// ========== INDEXES ==========

// CRITICAL: For 5km radius geospatial query (driver tracking)
userSchema.index({ currentLocation: '2dsphere' });

// For passenger location queries
userSchema.index({ location: '2dsphere' });

// For finding online available drivers quickly
userSchema.index({ role: 1, isOnline: 1, currentStatus: 1 });

// For socket disconnect cleanup
userSchema.index({ socketId: 1 });

// ========== PASSWORD HASHING (Keep existing) ==========
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        { _id: this._id, email: this.email, role: this.role },
        process.env.JWT_SECRET, 
        { expiresIn: "1d" }
    );
};

const User = mongoose.model("User", userSchema);
export default User;