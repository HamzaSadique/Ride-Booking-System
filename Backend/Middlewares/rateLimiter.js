// Middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit';

// Level 1: Bohat sakht (Auth, OTP, Ride Booking)
export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 500, // Sirf 10 requests
    message: { message: "Too many attempts, please wait 15 minutes." }
});

// Level 2: Darmiyana (Vehicle registration, Profile updates)
export const standardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { message: "Slow down! You're making too many requests." }
});

// Level 3: Aam (Searching rides, Viewing vehicles)
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { message: "General API limit reached." }
});
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: "Too many attempts!"
});