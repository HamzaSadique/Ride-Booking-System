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

router.use(isAuthenticated);
router.use(standardLimiter);
router.use(apiLimiter);

router.post("/request", requestRide);
router.patch("/accept/:rideId", acceptRide);
router.patch("/cancel/:rideId", cancelRide);
router.patch("/cancel-by-driver/:rideId", cancelRideByDriver);
router.patch("/update-status/:rideId", updateRideStatus);

router.get("/my-active", getMyActiveRide);
router.get("/ride/:rideId", getRideById);
router.get("/history/:userId", getUserRideAnalysis);
router.get("/all", getAllRides);

export default router;