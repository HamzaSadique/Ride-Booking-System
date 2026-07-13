import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// 1. Ek alag function banayein jo configuration check kare
const configureCloudinary = () => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
};

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        // 2. Upload se pehle config call karein
        // Is waqt tak dotenv load ho chuka hoga
        configureCloudinary();

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });

        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        
        return response;
    } catch (error) {
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        console.error("Cloudinary Error:", error);
        return null;
    }
};
// --- ✨ NEW: DELETE FUNCTION ---
const deleteFromCloudinary = async (url) => {
    try {
        if (!url) return null;
        configureCloudinary();

        // URL se Public ID nikalne ka tareeka:
        // Example: https://res.cloudinary.com/demo/image/upload/v12345/folder/sample.jpg
        // Public ID "folder/sample" hogi.
        const publicId = url.split('/').slice(-1)[0].split('.')[0]; 
        
        // Agar aapne folder banaya hua hai toh logic thodi badalni hogi, 
        // filhal ye standard root files ke liye best hai:
        const response = await cloudinary.uploader.destroy(publicId);
        
        return response;
    } catch (error) {
        console.error("Cloudinary Delete Error:", error);
        return null;
    }
};

export { uploadOnCloudinary, deleteFromCloudinary };