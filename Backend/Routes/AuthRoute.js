import express from "express";
import passport from "passport";
import Joi from 'joi'; // Validation ke liye
import { register, verifyOTP, resendOTP, login, forgotPassword, resetPassword, logout } from "../Controllers/AuthController.js";
import { googleAuthSuccess } from "../Controllers/GoogleAuthController.js";

// Middlewares import karein
import { authLimiter } from '../Middlewares/rateLimiter.js';
import { validate } from '../Middlewares/Validate.js';

const router = express.Router();

// --- Validation Schemas ---
const schemas = {
    register: Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        phoneNumber: Joi.string().required(), // 👈 Isay 'phoneNumber' kar dein
        role: Joi.string().valid('user', 'partner').optional() // Role ko bhi add kar dein
    }),
    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
    }),
    otp: Joi.object({
        email: Joi.string().email().required(),
        otp: Joi.string().min(4).max(6).required()
    })
};

// --- 1. Normal Auth Routes (With Protection) ---

// Register par limiter aur validation lagao
router.post("/register", authLimiter, validate(schemas.register), register);

// OTP verify par limiter zaroori hai taake koi tukkay na mare
router.post("/verify-otp", authLimiter, validate(schemas.otp), verifyOTP);

router.post("/resend-otp", authLimiter, resendOTP);

// Login par limiter aur validation lagao
router.post("/login", authLimiter, validate(schemas.login), login);

router.post("/forgot-password", authLimiter, forgotPassword);
router.put("/reset-password/:token", resetPassword);
router.get("/logout", logout);

// --- 2. Google Auth Routes ---
// Routes/authRoutes.js
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/google/callback", 
    passport.authenticate("google", { failureRedirect: "/login" }),
    googleAuthSuccess // 👈 Ye wo controller hai jo humne abhi likha tha
);

export default router;