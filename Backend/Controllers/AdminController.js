import User from "../Models/ModelUser.js";
import Ride from "../Models/ModelRide.js";
import PartnerProfile from "../Models/ModelPartner.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import { ApiError } from "../Utils/ApiError.js";
import { ROLES, STATUS } from "../Utils/constants.js";
import { sendEmail } from "../services/emailService.js"; 

// ==========================================
// ✅ 1. UPDATE KYC STATUS (With Strict User-Partner Sync)
// ==========================================
export const updateKYCStatus = asyncHandler(async (req, res) => {
    const { partnerProfileId } = req.params;
    const { status, rejectionReason, currentStep } = req.body; 

    const partner = await PartnerProfile.findById(partnerProfileId);
    if (!partner) throw new ApiError(404, "Partner profile nahi mili.");

    let updateData = {
        rejectionReason: status === STATUS.REJECTED ? rejectionReason : "",
        status: status === STATUS.REJECTED ? STATUS.REJECTED : "pending" 
    };

    if (status === STATUS.REJECTED) {
        if (currentStep === 1) updateData.profilePicStatus = STATUS.REJECTED;
        if (currentStep === 2) updateData.cnicStatus = STATUS.REJECTED;
        if (currentStep === 3) updateData.licenseStatus = STATUS.REJECTED;
        if (currentStep === 4) updateData.vehicleStatus = STATUS.REJECTED;

        // 🚨 SYNC FIX: User table ko bhi inform karein ke partner reject ho chuka hai
        await User.findByIdAndUpdate(partner.user, { status: STATUS.REJECTED });
    } 
    else if (status === STATUS.APPROVED) {
        if (currentStep === 1) updateData.profilePicStatus = STATUS.APPROVED;
        if (currentStep === 2) updateData.cnicStatus = STATUS.APPROVED;
        if (currentStep === 3) updateData.licenseStatus = STATUS.APPROVED;
        if (currentStep === 4) updateData.vehicleStatus = STATUS.APPROVED;

        if (partner.currentStep < 4) {
            updateData.currentStep = partner.currentStep + 1;
            // Background sync keeping user as pending while steps ongoing
            await User.findByIdAndUpdate(partner.user, { status: STATUS.PENDING });
        } else {
            // All steps completed -> Full Verification Triggered
            updateData.status = STATUS.APPROVED;
            updateData.isVerified = true;
            updateData.currentStep = 5; // Lock layout steps
            await User.findByIdAndUpdate(partner.user, { isVerified: true, status: STATUS.APPROVED });
        }
    }

    const updatedPartner = await PartnerProfile.findByIdAndUpdate(
        partnerProfileId, { $set: updateData }, { new: true }
    ).populate("user", "name email phoneNumber status");

    // ✨ Email Dispatcher (Background Thread)
    const partnerUser = await User.findById(partner.user);
    if (partnerUser) {
        const emailOptions = {
            email: partnerUser.email,
            subject: status === STATUS.APPROVED ? "KYC Step Approved! ✅" : "KYC Action Required ⚠️",
            message: status === STATUS.APPROVED 
                ? `Hello ${partnerUser.name}, your document for Step ${currentStep} has been approved.` 
                : `Hello ${partnerUser.name}, your document for Step ${currentStep} was rejected.\nReason: ${rejectionReason}`
        };
        sendEmail(emailOptions).catch(err => console.error("Email Error:", err));
    }

    return res.status(200).json(new ApiResponse(200, updatedPartner, "Status Updated Successfully"));
});

// ==========================================
// ✅ 2. GET KYC REQUESTS (Clean Population Filtering)
// ==========================================
export const getKYCRequests = asyncHandler(async (req, res) => {
    // Fetch unverified records and populate associated core profile metrics
    const requests = await PartnerProfile.find({ isVerified: false })
        .populate({
            path: "user",
            select: "name email phoneNumber status" 
        })
        .sort({ updatedAt: -1 });

    // 🚨 SAFE CLEANUP LAYER: Agar kisi document ka main user table se delete ho gaya ho, 
    // toh backend filter karke sirf valid objects bhejega taake frontend card render crash na ho.
    const validRequests = requests.filter(req => req.user !== null);

    return res.status(200).json(
        new ApiResponse(200, validRequests, "KYC Requests Fetched Successfully")
    );
});

// ==========================================
// ✅ 3. DASHBOARD STATS (Aggregated from Source of Truth)
// ==========================================
export const getAdminStats = asyncHandler(async (req, res) => {
    const [userCount, partnerStats, rideStats] = await Promise.all([
        User.countDocuments({ role: ROLES.USER }),
        
        // 🚨 FIX: Aggregating from PartnerProfile collection directly to get accurate status indicators
        PartnerProfile.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
                    pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } }
                }
            }
        ]),
        
        Ride.aggregate([
            { $group: {
                _id: null,
                totalRides: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
                adminEarnings: { $sum: "$adminCommission" }
            }}
        ])
    ]);

    const stats = {
        users: { total: userCount },
        partners: {
            total: partnerStats[0]?.total || 0,
            approved: partnerStats[0]?.approved || 0,
            pending: partnerStats[0]?.pending || 0,
            rejected: partnerStats[0]?.rejected || 0
        },
        financials: {
            revenue: rideStats[0]?.adminEarnings || 0,
            totalRides: rideStats[0]?.totalRides || 0
        }
    };

    return res.status(200).json(new ApiResponse(200, stats, "Stats Fetched"));
});

// ==========================================
// ✅ 4. BLOCK / UNBLOCK USER OR PARTNER
// ==========================================
export const toggleBlockStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, "User not found");

    const newStatus = user.status === STATUS.BLOCKED ? STATUS.APPROVED : STATUS.BLOCKED;
    
    // Update User Collection
    await User.findByIdAndUpdate(user._id, { $set: { status: newStatus } });

    // 🚨 SYNC FIX: If the user is a partner, block them in PartnerProfile collection too
    if (user.role === ROLES.PARTNER) {
        await PartnerProfile.findOneAndUpdate(
            { user: user._id },
            { $set: { status: newStatus === STATUS.BLOCKED ? STATUS.BLOCKED : "pending" } }
        );
    }

    user.status = newStatus;
    return res.status(200).json(new ApiResponse(200, user, `User is now ${newStatus}`));
});

// ==========================================
// ✅ 5. GET ALL VERIFIED PARTNERS
// ==========================================
export const getVerifiedPartners = asyncHandler(async (req, res) => {
    const partners = await PartnerProfile.find({ isVerified: true })
        .populate({
            path: "user",
            select: "name email phoneNumber status avatar"
        })
        .sort({ updatedAt: -1 });

    const validVerifiedPartners = partners.filter(p => p.user !== null);

    return res.status(200).json(
        new ApiResponse(200, validVerifiedPartners, "Verified Partners fetched successfully")
    );
});

// ==========================================
// ✅ 6. REQUEST DATA CHANGE / RE-VERIFICATION MODE
// ==========================================
export const requestPartnerUpdate = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;
    const { reason, stepToReset } = req.body; 

    const partner = await PartnerProfile.findById(partnerId);
    if (!partner) throw new ApiError(404, "Partner nahi mila");

    const updateData = {
        isVerified: false,
        status: STATUS.REJECTED,
        rejectionReason: reason,
        currentStep: stepToReset || 1 
    };

    // Update partner status flags on specific steps
    if (stepToReset === 1) updateData.profilePicStatus = STATUS.REJECTED;
    if (stepToReset === 2) updateData.cnicStatus = STATUS.REJECTED;
    if (stepToReset === 3) updateData.licenseStatus = STATUS.REJECTED;
    if (stepToReset === 4) updateData.vehicleStatus = STATUS.REJECTED;

    await User.findByIdAndUpdate(partner.user, { isVerified: false, status: STATUS.REJECTED });

    const updatedPartner = await PartnerProfile.findByIdAndUpdate(
        partnerId,
        { $set: updateData },
        { new: true }
    ).populate("user", "name email phoneNumber status");

    return res.status(200).json(
        new ApiResponse(200, updatedPartner, "Partner moved to re-verification mode")
    );
});

// ==========================================
// ✅ 7. GET ALL USERS WITH BOOKING COUNTS
// ==========================================
export const getAllUsersWithStats = asyncHandler(async (req, res) => {
    const users = await User.aggregate([
        { $match: { role: ROLES.USER } },
        {
            $lookup: {
                from: "rides", 
                localField: "_id",
                foreignField: "user", 
                as: "bookingHistory"
            }
        },
        {
            $project: {
                name: 1,
                email: 1,
                phoneNumber: 1,
                status: 1,
                createdAt: 1,
                totalBookings: { $size: "$bookingHistory" },
                lastLocation: { $ifNull: ["$lastLocation", { lat: 31.5204, lng: 74.3587 }] }
            }
        },
        { $sort: { createdAt: -1 } }
    ]);

    return res.status(200).json(
        new ApiResponse(200, users, "All users with metrics fetched successfully")
    );
});

// ==========================================
// ✅ 8. GET SINGLE PARTNER COMPLETE DOSSIER
// ==========================================
export const getPartnerDetails = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;

    const partner = await PartnerProfile.findById(partnerId).populate(
        "user", 
        "name email phoneNumber status avatar"
    );
    
    if (!partner) throw new ApiError(404, "Partner record not found");

    return res.status(200).json(
        new ApiResponse(200, partner, "Partner full details fetched")
    );
});