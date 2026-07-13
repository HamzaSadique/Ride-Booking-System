import PartnerProfile from "../Models/ModelPartner.js";
import User from "../Models/ModelUser.js"; 
import { STATUS } from "../Utils/constants.js";
import { uploadOnCloudinary } from "../Utils/cloudinary.js";
import { deleteFromCloudinary } from "../Utils/cloudinary.js"; 
import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";

// ==========================================
// 🚀 1. SUBMIT / UPDATE KYC ASSETS (Updated with Steps Lock)

export const submitKYC = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    
    try {
        await PartnerProfile.collection.dropIndex("cnicNumber_1");
        console.log("✅ Successfully dropped old cnicNumber_1 index via Backend!");
    } catch (err) {}

    try {
        await PartnerProfile.collection.dropIndex("vehicleNumber_1");
        console.log("✅ Successfully dropped old vehicleNumber_1 index via Backend!");
    } catch (err) {}

    const existingProfile = await PartnerProfile.findOne({ user: userId }).lean();

    const updateData = {
        status: "pending", 
        rejectionReason: "" 
    };

    // Text metrics injection parsing
    if (req.body.cnicNumber) updateData.cnicNumber = req.body.cnicNumber;
    if (req.body.licenseNumber) updateData.licenseNumber = req.body.licenseNumber;
    if (req.body.vehicleType) updateData.vehicleType = req.body.vehicleType;     
    if (req.body.vehicleModel) updateData.vehicleModel = req.body.vehicleModel;   
    if (req.body.vehicleNumber) updateData.vehicleNumber = req.body.vehicleNumber; 

    // 🚨 FIX LAYER: Dynamic currentStep track karna taake step lock open rahe
    if (req.body.currentStep) {
        updateData.currentStep = Number(req.body.currentStep);
    }

    if (req.files) {
        const fileKeys = Object.keys(req.files);

        const uploadPromises = fileKeys.map(async (key) => {
            if (req.files[key] && req.files[key][0]) {
                
                if (existingProfile && existingProfile[key]) {
                    try { 
                        await deleteFromCloudinary(existingProfile[key]); 
                    } catch (e) { 
                        console.error("Cloudinary Delete Failed: ", e); 
                    }
                }

                const localPath = req.files[key][0].path;
                const result = await uploadOnCloudinary(localPath);
                
                if (result && result.url) {
                    return { key, url: result.url };
                }
            }
            return null;
        });

        const uploadedFiles = await Promise.all(uploadPromises);

        uploadedFiles.forEach((item) => {
            if (item) {
                updateData[item.key] = item.url;
                
                if (item.key === 'profilePic') updateData.profilePicStatus = "pending";
                if (item.key === 'cnicFront' || item.key === 'cnicBack') updateData.cnicStatus = "pending";
                if (item.key === 'licenseFront') updateData.licenseStatus = "pending";
                if (item.key === 'vehicleImage' || item.key === 'registrationBook') updateData.vehicleStatus = "pending";
            }
        });
    }

    try {
        const updatedProfile = await PartnerProfile.findOneAndUpdate(
            { user: userId },
            { $set: updateData },
            { 
                upsert: true, 
                returnDocument: 'after' 
            }
        );

        await User.findByIdAndUpdate(userId, { status: "pending" });

        return res.status(200).json(new ApiResponse(200, updatedProfile, "KYC Assets deployed successfully."));
    } catch (dbError) {
        console.error("🔥 CRASHING AT DATABASE LAYER:", dbError.message);
        throw new ApiError(500, dbError.message || "Database update failed");
    }
});

// ==========================================
// 2. GET DASHBOARD METRICS (Overwritten Populate Bug Fixed)
// ==========================================
export const getDashboard = asyncHandler(async (req, res) => {
    // 🚨 FIX LAYER: .populate("vehicle") ko hata diya hai kyunki vehicle fields flat isi model mein hain
    const dashboardData = await PartnerProfile.findOne({ user: req.user._id })
        .populate("user", "name email avatar status role");

    if (!dashboardData) {
        throw new ApiError(404, "Partner Profile Not Found.");
    }

    return res.status(200).json(
        new ApiResponse(200, dashboardData, "Dashboard data fetched successfully")
    );
});

// ==========================================
// 🔄 3. GET KYC STATUS (Frontend Sync Endpoint)
export const getKYCStatus = asyncHandler(async (req, res) => {
    const partner = await PartnerProfile.findOne({ user: req.user._id })
        .populate("user", "name email status");

    if (!partner) {
        return res.status(200).json(
            new ApiResponse(200, { status: "none", isVerified: false, currentStep: 1 }, "Initialization workflow baseline loaded.")
        );
    }

    // 🚨 FIX LAYER: Agar profile database mein verified hai, toh direct screen lock bypass karein
    if (partner.isVerified === true || partner.status === STATUS.APPROVED) {
        return res.status(200).json(
            new ApiResponse(200, {
                ...partner.toObject(),
                status: STATUS.APPROVED,
                isVerified: true,
                currentStep: 5 // Lock screen on final dashboard step
            }, "Verified partner status loaded securely.")
        );
    }

    return res.status(200).json(new ApiResponse(200, partner, "Status telemetry fetched successfully."));
});


// ==========================================
// 🔌 4. TOGGLE AVAILABILITY (Online/Offline State Sync)
// ==========================================
export const toggleAvailability = asyncHandler(async (req, res) => {
    const partner = await PartnerProfile.findOne({ user: req.user._id });

    if (!partner || !partner.isVerified) {
        throw new ApiError(403, "Sirf verified partners hi online ja sakte hain.");
    }

    // 🚨 FIX: isOnline aur isAvailable ko ek sath sync rakhein taake spatial query break na ho
    partner.isAvailable = !partner.isAvailable;
    partner.isOnline = partner.isAvailable; 
    await partner.save();

    return res.status(200).json(
        new ApiResponse(200, { isAvailable: partner.isAvailable, isOnline: partner.isOnline }, `Partner state mapped to ${partner.isAvailable ? 'Online' : 'Offline'}`)
    );
});

// ==========================================
// 💰 5. GET EARNINGS
// ==========================================
export const getEarnings = asyncHandler(async (req, res) => {
    const earnings = await PartnerProfile.findOne({ user: req.user._id })
        .select("totalEarnings pendingBalance wallet");

    return res.status(200).json(
        new ApiResponse(200, earnings, "Earnings fetched successfully")
    );
});

// ==========================================
// 🗺️ 6. SPATIAL GEOLOCATION: GET NEARBY DRIVERS
// ==========================================
export const getNearbyDrivers = async (req, res) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: "Client telemetry coordinates missing." });
        }

        // Spatial query searching inside 7 KM radius grid
        const drivers = await PartnerProfile.find({
            isOnline: true, // ✅ Looks up matched active sockets indicators
            isVerified: true, 
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(lng), parseFloat(lat)] 
                    },
                    $maxDistance: 7000 
                }
            }
        }).populate("user", "name email"); 

        return res.status(200).json({
            success: true,
            count: drivers.length,
            drivers
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// 📍 7. LIVE TRACKING: UPDATE LIVE LOCATION
// ==========================================
export const updateLiveLocation = async (req, res) => {
    try {
        const { lat, lng, isOnline } = req.body;
        const partnerId = req.user._id; 

        const updatedProfile = await PartnerProfile.findOneAndUpdate(
            { user: partnerId },
            {
                isOnline,
                isAvailable: isOnline, // ✅ Parallel state integration
                location: {
                    type: "Point",
                    coordinates: [parseFloat(lng), parseFloat(lat)]
                }
            },
            { returnDocument: 'after' } // ✅ Replaced deprecated legacy { new: true } flag
        );

        return res.status(200).json({ success: true, updatedProfile });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};