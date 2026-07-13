import { Router } from "express";
import { getChatHistory } from "../Controllers/Chat Controller.js";
import {isAuthenticated} from "../Middlewares/authMiddleware.js"; // Aapka normal auth middleware

const router = Router();

// Saare routes protected hone chahiye taake sirf logged-in users hi chat dekh saken
router.use(isAuthenticated);

// Kisi specific ride ki chat history get karne ke liye
router.route("/history/:rideId").get(getChatHistory);

export default router;