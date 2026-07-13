import User from "../Models/ModelUser.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import { uploadOnCloudinary } from "../Utils/cloudinary.js";
import { STATUS } from "../Utils/constants.js";

// --- 1. GET CURRENT USER PROFILE ---
export const getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User account nahi mila");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, user, "User profile fetched successfully"));
});


// --- 2. UPDATE PROFILE DETAILS ---
export const updateProfile = asyncHandler(async (req, res) => {
    const { name, phoneNumber } = req.body;

    // 1. Image Check: 
    let avatarUrl = req.user.avatar; // image default 

    if (req.file) {
        const localFilePath = req.file.path; // Multerfile
        
        // Cloudinary par upload 
        const cloudinaryResponse = await uploadOnCloudinary(localFilePath);
        
        if (cloudinaryResponse) {
            avatarUrl = cloudinaryResponse.secure_url; // Naya URL mil gaya!
        }
    }

    // 2. Validation: 
    if (!name && !phoneNumber && !req.file) {
        throw new ApiError(400, "Update karne ke liye koi data nahi bheja gaya");
    }

    // 3. Database Update
    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                name: name || req.user.name,
                phoneNumber: phoneNumber || req.user.phoneNumber,
                avatar: avatarUrl // ✨ Nayi ya purani avatar URL save hogi
            },
        },
        { returnDocument: 'after', 
        runValidators: true }
    ).select("-password"); // Security 

    return res
        .status(200)
        .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});

export const updateLocation = asyncHandler(async (req, res) => {
    const { longitude, latitude, address } = req.body;

    if (!longitude || !latitude) {
        throw new ApiError(400, "Coordinates are required");
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                location: {
                    type: 'Point',
                    coordinates: [longitude, latitude],
                    address: address || ""
                }
            }
        },
        { new: true }
    );

    return res.status(200).json(new ApiResponse(200, updatedUser, "Location updated successfully"));
});
export const getWallet = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("wallet name email");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(new ApiResponse(200, { wallet: user.wallet }, "Wallet fetched successfully"));
});
export const getRideHistory = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate("rideHistory");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(new ApiResponse(200, user.rideHistory, "Ride history fetched successfully"));
});
// --- 3. DELETE ACCOUNT (SOFT DELETE) ---
export const deleteMe = asyncHandler(async (req, res) => {

    await User.findByIdAndUpdate(req.user._id, {
        $set: {
            isDeleted: true,
            deletionDate: new Date(),
            status: STATUS.REJECTED // 👈 Ab yahan error nahi ayega
        }
    });

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    };

    return res
        .status(200)
        .clearCookie("token", options) 
        .json(new ApiResponse(200, null, "Account deactivate ho gaya hai."));
});