import jwt from "jsonwebtoken";
import User from "../Models/ModelUser.js"; // Make sure this path is correct!
import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";

const ROLES = {
    PARTNER: 'partner',
    USER: 'user',
    ADMIN: 'admin'
};

const STATUS = {
    ACTIVE: 'active',
    BLOCKED: 'blocked',
    PENDING: 'pending',
    REJECTED: 'rejected'
};

// --- 1. IsAuthenticated (for Express HTTP routes) ---
export const isAuthenticated = asyncHandler(async (req, res, next) => {
    // Token nikaalna (Cookie ya Header se)
    const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Pehle login karein (Token missing)");
    }

    try {
        // .env mein jo bhi naam hai (JWT_SECRET ya ACCESS_TOKEN_SECRET), woh yahan likhein
        const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET);

        // FIX: Hamne token mein '_id' save kiya tha, isliye yahan '_id' dhoondenge
        const user = await User.findById(decoded._id || decoded.id);

        if (!user) {
            throw new ApiError(404, "User nahi mila, token invalid ho sakta hai");
        }

        req.user = user;
        next();
    } catch (error) {
        // Agar yahan error aye toh samjhein token ya secret match nahi ho raha
        throw new ApiError(401, "Invalid ya Expired Token");
    }
});

// --- 2. AuthorizeRoles ---
export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            throw new ApiError(
                403, 
                `Role (${req.user?.role || "Unknown"}) ko ye resource use karne ki ijazat nahi hai`
            );
        }
        next();
    };
};

// --- 3. isVerifiedPartner ---

export const isVerifiedPartner = asyncHandler(async (req, res, next) => {
    
    if (req.user.role !== ROLES.PARTNER) {
        throw new ApiError(403, "Only partners can access this.");
    }

    // Sirf blocked ko rokein
    if (req.user.status === STATUS.BLOCKED) {
        throw new ApiError(403, "Your account is blocked. Contact Admin.");
    }

    // Pending ya Rejected ko aage jane dein (Frontend handle karega redirect)
    next();
});

  export const verifySocketToken = async (token) => {
    try {
        const secret = process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        
        // ✅ SAHI: _id se dhoondo (aapke isAuthenticated mein bhi yahi hai)
        const user = await User.findById(decoded._id || decoded.id).select("-password");
        
        if (!user) throw new Error("User not found in DB");
        return user;
    } catch (error) {
        throw new Error("Auth Failed: " + error.message);
    }
};
// --- 5. isAdmin (Specifically for Admin check) ---
export const isAdmin = asyncHandler(async (req, res, next) => {
    // Check karein ke user auth hai ya nahi, aur role admin hai ya nahi
    if (!req.user || req.user.role !== 'admin') {
        throw new ApiError(
            403, 
            "Access Denied Admin can assess this resource. role: " + (req.user ? req.user.role : "Unknown")
        );
    }
    next();
});