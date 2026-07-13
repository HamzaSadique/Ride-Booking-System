import multer from "multer";
import path from "path";
import fs from "fs";

// 🚨 FIX 1: Auto-Directory Creator Layer (Agar folder nahi hai, toh khud banaye)
const tempDir = "./public/temp";
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, tempDir); 
    },
    filename: function (req, file, cb) {
        // 🚨 FIX 2: Bulletproof Safe Extension Resolver using path engine
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname); // Extract (.jpg, .png) precisely
        
        cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
    }
});

// 🚨 FIX 3: Safety Guard Filters (Size limits aur Image file format verification)
export const upload = multer({ 
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Max limit 10MB per file to keep disk secure
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|webp|pdf/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error("Error: Only standard images & documents are allowed!"));
        }
    }
});