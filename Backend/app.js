import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import passport from "passport";
import authRoutes from './Routes/AuthRoute.js';
import userRoutes from './Routes/UserRoute.js';
import partnerRoutes from "./Routes/PartnerRoute.js";
import adminRoutes from "./Routes/AdminRoute.js";
import riderRoutes from "./Routes/RideRoute.js";
import chatRoutes from "./Routes/ChatRoute.js";
import debugRoutes from "./Routes/DebugRoute.js";
import { errorMiddleware } from './Middlewares/errorMiddleware.js';
import { apiLimiter } from './Middlewares/rateLimiter.js';
import errorHandler from './Middlewares/errorHandler.js'; 
import './Config/Passport.js';

const app = express();

// --- 1. Basic Middlewares ---

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false, // 👈 Ye line ADD karein
}));
app.use(cors({ 
    origin: process.env.CLIENT_URL || 'http://localhost:5173', 
    credentials: true 
}));
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());
app.use("/api", apiLimiter); // Middlewares ke baad limiter

if (process.env.NODE_ENV === "development") {
    app.use(morgan("dev"));
}

// --- 2. Session & Passport ---
app.use(session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        secure: process.env.NODE_ENV === "production"
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// --- 3. API Routes ---
app.use('/api/v1/auth', authRoutes);
app.use ('/api/v1/user',userRoutes)
app.use("/api/v1/partner", partnerRoutes);
app.use("/api/v1/ride", riderRoutes);
app.use("/api/v1/admin", adminRoutes); 
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/debug", debugRoutes); 

// --- 4. Error Handling (SAB SE NEECHE) ---
app.use(errorHandler); // 👈 Ye 404 handler se bhi neeche hona chahiye
app.use(errorMiddleware); // Global error handler

// 404 Handler (Agar koi route na mile)
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});


export default app;