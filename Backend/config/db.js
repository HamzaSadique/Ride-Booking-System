import mongoose from "mongoose";
import User from "../Models/ModelUser.js";  // Import User model for index sync

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(" MongoDB Connected successfully");

        // ========== INDEX SYNC (CRITICAL FOR GEOSPATIAL QUERIES) ==========
        console.log(" Syncing database indexes...");
        try {
            await User.syncIndexes();
            console.log(" User indexes synced successfully");

            // Verify 2dsphere index exists
            const indexes = await User.collection.getIndexes();
            const has2dsphere = Object.keys(indexes).some(name => 
                indexes[name].key && indexes[name].key.currentLocation === '2dsphere'
            );

            if (has2dsphere) {
                console.log("2dsphere index on currentLocation: CONFIRMED");
            } else {
                console.error(" 2dsphere index on currentLocation: MISSING!");
                console.log("🔄 Creating 2dsphere index manually...");
                await User.collection.createIndex({ currentLocation: "2dsphere" });
                console.log(" 2dsphere index created successfully");
            }

        } catch (indexError) {
            console.error(" Index sync failed:", indexError.message);
            console.log("  Geospatial queries may not work correctly!");
        }
        // =================================================================

    } catch (error) {
        console.error(" DB Connection Failed:", error.message);
        process.exit(1);
    }
};

export default connectDB;