import { Router } from "express";
import {
    requestRide,
    acceptRide,
    cancelRide,
    cancelRideByDriver,
    updateRideStatus,
    getMyActiveRide,
    getRideById,
    getUserRideAnalysis,
    getAllRides
} from "../Controllers/RiderController.js";
import { isAuthenticated } from "../Middlewares/authMiddleware.js";
import { standardLimiter, apiLimiter } from '../Middlewares/rateLimiter.js';

const router = Router();

// Apply middleware to all routes
router.use(isAuthenticated);
router.use(standardLimiter);
router.use(apiLimiter);

// ═══════════════════════════════════════════════════════════════
// RIDE BOOKING & ACTIONS
// ═══════════════════════════════════════════════════════════════

// Passenger requests a new ride
router.post("/request", requestRide);

// Driver accepts a pending ride
router.patch("/accept/:rideId", acceptRide);

// Passenger cancels their ride
router.patch("/cancel/:rideId", cancelRide);

// Driver cancels assigned ride
router.patch("/cancel-by-driver/:rideId", cancelRideByDriver);

// Driver updates ride status: ARRIVED / ONGOING / COMPLETED
router.patch("/update-status/:rideId", updateRideStatus);

// ═══════════════════════════════════════════════════════════════
// RIDE RECOVERY & FETCH
// ═══════════════════════════════════════════════════════════════

// Get current active ride for logged-in user
router.get("/my-active", getMyActiveRide);

// Get specific ride by ID
router.get("/ride/:rideId", getRideById);

// Get ride statistics / history for a user
router.get("/history/:userId", getUserRideAnalysis);

// Get all rides (role-based filtering inside controller)
router.get("/all", getAllRides);

export default router;