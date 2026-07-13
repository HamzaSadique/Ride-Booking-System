import User from "../Models/ModelUser.js";
import PartnerProfile from "../Models/ModelPartner.js"; // ✨ Ye line missing thi
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Services
import { sendEmail } from "../services/emailService.js";
import { generateOTP, getOTPExpiry } from "../services/otpService.js"; // OTP service import karna na bhoolen
import * as otpService from "../services/otpService.js"; // Path apna check kar lein

// Utilities
import { asyncHandler } from "../Utils/asyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import { ROLES, STATUS } from "../Utils/constants.js";

// --- 1. REGISTER 
export const register = asyncHandler(async (req, res) => {
    const { name, email, password, role, phoneNumber, masterSecret } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) throw new ApiError(400, "Email already exists");

    const otp = otpService.generateOTP();
    const otpExpire = otpService.getOTPExpiry();

    // ✨ YAHAN CHANGE HAI:
    let finalRole = role || ROLES.USER;
    let userStatus = (finalRole === ROLES.PARTNER) ? STATUS.PENDING : STATUS.APPROVED;


    // Check for Master Admin Secret
    if (masterSecret && masterSecret === process.env.MASTER_ADMIN_SECRET) {
        finalRole = ROLES.ADMIN;
        userStatus = STATUS.APPROVED; // Admin direct approve hoga
    }

    const user = await User.create({
        name,
        email,
        password, // Model mein pre-save hook hai, yahan hash karne ki zaroorat nahi
        role: finalRole,
        phoneNumber,
        status: userStatus,
        otp,
        otpExpire,
        isVerified: (finalRole === ROLES.ADMIN) // Admin ko OTP ki tension nahi
    });

    // Admin ke liye email bhejni hai ya nahi, aapki marzi
    if (finalRole !== ROLES.ADMIN) {
        await sendEmail({
            email: user.email,
            subject: "Your Verification Code",
            message: `Your OTP is ${otp}. It will expire in 10 minutes.`
        });
    }

    return res.status(201).json(
        new ApiResponse(201, user, "Registration successful. Please check your email.")
    );
});

// --- 2. VERIFY OTP (🛡️ DIRECT DB UPDATE VERSION) ---
export const verifyOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
        throw new ApiError(400, "Email and OTP are required");
    }

    // 1. User ko pure format mein find karein
    const user = await User.findOne({ email });

    if (!user) {
        console.log(" USER NOT FOUND IN DATABASE");
        throw new ApiError(400, "User not found");
    }

    // 2. Checks perform karein
    if (!user.otp) {
        console.log(" DB OTP IS EMPTY OR ALREADY VERIFIED");
        throw new ApiError(400, "OTP has not been generated or already used");
    }

    const isOtpInvalid = user.otp.toString().trim() !== otp.toString().trim();
    const isOtpExpired = new Date(user.otpExpire).getTime() < Date.now();

    if (isOtpInvalid) {
        console.log(" OTP MISMATCH DETECTED");
        throw new ApiError(400, "Invalid OTP code");
    }

    if (isOtpExpired) {
        console.log(" OTP EXPIRED DETECTED");
        throw new ApiError(400, "OTP has expired");
    }

    // ✨ ULTRA FIX: user.save() ki bajaye direct Model query chalayein taake model hooks (pre-save) database fields ko undefined na karein!
    await User.findOneAndUpdate(
        { email },
        { 
            $set: { isVerified: true },
            $unset: { otp: 1, otpExpire: 1 } // Database se clear kar do fields safely
        },
        { new: true }
    );

    console.log(" ACCOUNT SUCCESSFULLY VERIFIED!");

    return res.status(200).json(
        new ApiResponse(200, null, "Account verified successfully")
    );
});

// --- 3. RESEND OTP (🛡️ DIRECT DB UPDATE VERSION) ---
export const resendOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;
    console.log("=== RESEND OTP PROCESS STARTED FOR ===", email);
    
    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    const user = await User.findOne({ email });
    if (!user) {
        console.log(" USER NOT FOUND IN DB");
        throw new ApiError(404, "User not found");
    }

    const otp = generateOTP(); 
    const otpExpire = getOTPExpiry();

    console.log(`Generated New OTP: ${otp}, Expires at: ${otpExpire}`);

    // ✨ ULTRA FIX: user.save() hata kar direct atomic update taake data direct DB mein insert ho bina skip hue
    await User.findOneAndUpdate(
        { email },
        { 
            $set: { 
                otp: otp, 
                otpExpire: otpExpire 
            } 
        },
        { new: true, runValidators: false }
    );
    
    console.log(" New OTP successfully forced into Database!");

    try {
        console.log("Attempting to send email via Nodemailer...");
        await sendEmail({
            email: user.email,
            subject: "New OTP Code",
            message: `Your new OTP is ${otp}. Valid for 10 mins.`
        });
        console.log(" Email sent successfully!");
    } catch (emailError) {
      
        throw new ApiError(500, "OTP updated but Email sending failed.");
    }

    return res.status(200).json(
        new ApiResponse(200, null, "New OTP sent to your email")
    );
});


// --- 4. LOGIN (Munt Version) ---
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.isPasswordCorrect(password))) {
        throw new ApiError(401, "Invalid email or password");
    }

    if (user.status === STATUS.BLOCKED) {
        throw new ApiError(403, "Account is blocked. Please contact admin.");
    }

    if (!user.isVerified && user.role !== ROLES.PARTNER) {
         throw new ApiError(401, "Please verify your email first.");
    }

    if (user.isDeleted) {
        const today = new Date();
        const diffDays = Math.ceil(Math.abs(today - user.deletionDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 30) throw new ApiError(410, "Account permanent delete ho chuka hai.");

        user.isDeleted = false;
        user.deletionDate = null;
        user.status = STATUS.APPROVED;
        await user.save();
    }

    // 🚨 FIX LAYER: PartnerProfile check karke user status ko overwrite hone se bachana
    let partnerProfile = null;
    let reason = "";
    let currentStatus = user.status;

    if (user.role === ROLES.PARTNER) {
        partnerProfile = await PartnerProfile.findOne({ user: user._id });
        
        if (partnerProfile) {
            // Agar profile admin se approved ya verified hai, toh status hamesha APPROVED bhejien
            if (partnerProfile.isVerified || partnerProfile.status === STATUS.APPROVED) {
                currentStatus = STATUS.APPROVED;
                if (user.status !== STATUS.APPROVED) {
                    await User.findByIdAndUpdate(user._id, { status: STATUS.APPROVED });
                }
            } else if (partnerProfile.status === STATUS.REJECTED) {
                currentStatus = STATUS.REJECTED;
                reason = partnerProfile.rejectionReason || "Documents are not clear. Please re-upload.";
            } else {
                currentStatus = partnerProfile.status; // Defaults to pending
            }
        }
    }

    const token = await user.generateAccessToken();

    const options = {
        httpOnly: true,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        secure: process.env.NODE_ENV === "production"
    };

    const userResponse = user.toObject();
    delete userResponse.password;
    userResponse.status = currentStatus; // Enforce dynamic live status

    return res.status(200)
        .cookie("token", token, options)
        .json(new ApiResponse(200, {
            user: userResponse,
            token,
            rejectionReason: reason,
            isPendingPartner: (user.role === ROLES.PARTNER && (currentStatus === STATUS.PENDING || currentStatus === STATUS.REJECTED))
        }, "Login successful"));
});
// --- 5. FORGOT PASSWORD (🛡️ ULTRA ATOMIC VERSION) ---
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) throw new ApiError(404, "User not found with this email");

    const resetToken = crypto.randomBytes(20).toString("hex");
    
    // Hash the token for database storage
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    const tokenExpiry = Date.now() + 15 * 60 * 1000; // 15 Minutes valid

    // ✅ FIX: Direct atomic update taake hook lifecycle issue na kare aur direct save ho
    await User.findOneAndUpdate(
        { email },
        { 
            $set: { 
                resetPasswordToken: hashedToken, 
                resetPasswordExpire: tokenExpiry 
            } 
        },
        { new: true, runValidators: false }
    );

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    await sendEmail({
        email: user.email,
        subject: "Password Recovery",
        message: `Reset your password here: ${resetUrl}`
    });

    return res.status(200).json(
        new ApiResponse(200, null, "Password reset link sent to email")
    );
});

// --- 6. RESET PASSWORD (🛡️ ULTRA FIXED VERSION) ---
export const resetPassword = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    console.log("1. Received Token from URL:", token);

    // Token ko hash karein match karne ke liye (Sha256)
    const hashedUrlToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    console.log("2. Hashed Token for DB lookup:", hashedUrlToken);

    // User dhoondein aur check karein ke expiry date current time se bari hai ($gt)
    const user = await User.findOne({
        resetPasswordToken: hashedUrlToken,
        resetPasswordExpire: { $gt: new Date() }
    });

    if (!user) {
        console.log("3. 🚨 User NOT found or token expired in DB lookup!");
        throw new ApiError(400, "Token is invalid or has expired");
    }

    console.log("3. User found successfully:", user.email);

    // Manual hash generic approach taake custom flow solid rahe
    const salt = await bcrypt.genSalt(10);
    const encryptedPassword = await bcrypt.hash(password, salt);

    // ✅ FIX: Direct update database block without calling pre-save schema hooks again
    await User.findOneAndUpdate(
        { _id: user._id },
        {
            $set: { password: encryptedPassword },
            $unset: { resetPasswordToken: 1, resetPasswordExpire: 1 } // Safely remove tokens from DB
        }
    );

    console.log("4. Password updated successfully and tokens cleared.");

    return res.status(200).json(
        new ApiResponse(200, null, "Password successfully updated")
    );
});

// --- 7. LOGOUT ---
export const logout = asyncHandler(async (req, res) => {
    res.cookie("token", null, {
        expires: new Date(Date.now()),
        httpOnly: true
    });

    return res.status(200).json(
        new ApiResponse(200, null, "Logged out successfully")
    );
});