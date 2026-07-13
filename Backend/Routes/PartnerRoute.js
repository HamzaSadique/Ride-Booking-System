import express from "express";
import { submitKYC, getKYCStatus, getDashboard, toggleAvailability, getEarnings, getNearbyDrivers, updateLiveLocation } from "../Controllers/PartnerControlller.js";
import { isAuthenticated ,isVerifiedPartner} from "../Middlewares/authMiddleware.js";
import { upload } from "../Middlewares/multer.middleware.js";
import { standardLimiter } from '../Middlewares/rateLimiter.js';
const router = express.Router();

// Sabhi partner routes ke liye login hona lazmi hai
router.use(isAuthenticated);
router.use(standardLimiter); // Thoda relaxed limiter for partner actions
router.post("/submit-kyc", 
    upload.fields([
        { name: "profilePic", maxCount: 1 },
        { name: "cnicFront", maxCount: 1 },
        { name: "cnicBack", maxCount: 1 },
        { name: "licenseFront", maxCount: 1 },
        { name: "vehicleImage", maxCount: 1 },
        { name: "registrationBook", maxCount: 1 }
    ]), 
    submitKYC
);
router.get("/kyc-status", getKYCStatus);

router.get("/dashboard", isVerifiedPartner, getDashboard);
router.get("/earnings", isVerifiedPartner, getEarnings);
router.patch("/toggle-online", isVerifiedPartner, toggleAvailability);
router.get('/nearby', getNearbyDrivers);

// Partner side coordinates heartbeat push karne ke liye
router.post('/update-location', isVerifiedPartner, updateLiveLocation);

export default router;