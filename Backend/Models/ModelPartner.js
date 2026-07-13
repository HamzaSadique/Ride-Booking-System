import mongoose from "mongoose";

const partnerProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true
    },

    // 1: Profile Pic, 2: CNIC, 3: License, 4: Vehicle, 5: Fully Approved
    currentStep: {
        type: Number,
        default: 1
    },

    // --- STEP 1: PROFILE ---
    Name: { type: String, trim: true },
    profilePic: { type: String }, 
    profilePicStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },

    // --- STEP 2: CNIC ---
    cnicNumber: { 
        type: String, 
        unique: true, 
        sparse: true, // ✨ FIX: Yeh null values ko duplicate count karne se rokta hai
        trim: true 
    }, 
    cnicFront: { type: String },
    cnicBack: { type: String },
    cnicStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },
    cnicNote: { type: String, default: "" },

    // --- STEP 3: LICENSE ---
    licenseNumber: { type: String },
    licenseFront: { type: String },
    licenseStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },

    // --- STEP 4: VEHICLE ---
    vehicleType: { type: String },
    vehicleModel: { type: String },
    vehicleNumber: { 
        type: String, 
        unique: true, 
        sparse: true, // ✨ FIX: Plate ID agar empty bhi ho toh doosre user ka account crash nahi hoga
        trim: true 
    }, 
    vehicleImage: { type: String },
    registrationBook: { type: String },
    vehicleStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },

    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },

    rejectionReason: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },

    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle",
        default: null
    },
    rating: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: false },

    isOnline: { 
        type: Boolean, 
        default: false // Driver console trigger toggle active karega
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // ⚠️ REMEMBER: [Longitude, Latitude] indexing order
            default: [74.3587, 31.5204] // Default baseline coordinates (e.g., Lahore/Islamabad centre point)
        }
    },
currentLocation: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            default: [0, 0]
        }
    }


}, { timestamps: true });

partnerProfileSchema.index({ location: "2dsphere" });
partnerProfileSchema.index({ currentLocation: "2dsphere" });

const PartnerProfile = mongoose.model("PartnerProfile", partnerProfileSchema);
export default PartnerProfile;