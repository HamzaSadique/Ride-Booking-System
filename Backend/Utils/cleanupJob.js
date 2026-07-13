import cron from "node-cron";
import User from "../Models/ModelUser.js";

// Ye job har raat 12 baje chalegi (0 0 * * *)
cron.schedule("0 0 * * *", async () => {
    try {
        console.log("Running Cleanup: 30 din purane deleted accounts saaf ho rahe hain...");
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Sirf unhein delete karo jo isDeleted: true hain aur 30 din purane hain
        const result = await User.deleteMany({
            isDeleted: true,
            deletionDate: { $lte: thirtyDaysAgo }
        });

        console.log(`${result.deletedCount} accounts permanently delete kar diye gaye.`);
    } catch (error) {
        console.error("Cleanup Job Error:", error);
    }
});