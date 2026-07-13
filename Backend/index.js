import dotenv from "dotenv";
import http from "http";
import app from "./app.js";
import fs from "fs";
import connectDB from "./config/db.js";
import { DB_NAME } from "./Utils/constants.js";
import "./Utils/cleanupJob.js";
import { initializeSocket } from "./Socket/index.js";
import { handleRideEvents } from "./Socket/rideSocket.js";
dotenv.config();

const PORT = process.env.PORT || 5000;

// 1. SIRF EK SERVER BANAYEIN 
const server = http.createServer(app);

// 2. USI SERVER KO SOCKET MEIN PASS KAREIN 
const io = initializeSocket(server);

// 3. IO KO APP MEIN SET KAREIN
app.set("io", io);

const startServer = async () => {
    try {
        const tempPath = "./public/temp";
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath, { recursive: true });
            console.log(" Temp folder created successfully!");
        }

        await connectDB(); 
        
        // 4. USI SERVER KO LISTEN KAREIN 
        server.listen(PORT, () => {
            console.log(` Server running in ${process.env.NODE_ENV} on port ${PORT}`);
            console.log(` DBName: ${DB_NAME}`);
            console.log(` Socket.io is attached to this server!`);
        });
    } catch (error) {
        console.error(` Server Error: ${error.message}`);
        process.exit(1);
    }
};

startServer();