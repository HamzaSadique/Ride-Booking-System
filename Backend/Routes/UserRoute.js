import express from "express";
import { getProfile, updateProfile, deleteMe, getWallet, getRideHistory, updateLocation } from "../Controllers/UserController.js";
import { isAuthenticated } from "../Middlewares/authMiddleware.js";
import { upload } from "../Middlewares/multer.middleware.js";
const router = express.Router();



router.use(isAuthenticated); 

router.get("/Profile", getProfile);                
router.put("/update-profile", upload.single("avatar"), updateProfile);
router.delete("/delete-me", deleteMe);
router.get("/wallet", getWallet);      
router.get("/ride-history", getRideHistory);      
router.put("/update-location", updateLocation);      
router.get("/test", (req, res) => res.send("Location route is alive!"));
export default router;