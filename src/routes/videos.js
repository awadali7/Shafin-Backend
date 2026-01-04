const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const videoController = require("../controllers/videoController");
const { authenticate, isAdmin } = require("../middleware/auth");
const { createVideoValidation } = require("../utils/validators");
const validate = require("../middleware/validate");

// Create PDFs directory if it doesn't exist
const pdfsDir = path.join(__dirname, "../../uploads/pdfs");
if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
}

// Configure multer for PDF uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, pdfsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const fileFilter = (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === "application/pdf") {
        cb(null, true);
    } else {
        cb(
            new Error(
                "Invalid file type. Only PDF files are allowed for video attachments."
            ),
            false
        );
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per PDF
    },
});

// JSON body parser for routes that don't need file uploads
const jsonParser = express.json({ limit: "50mb" });

// Public routes (but may require course access)
router.get("/:courseId/videos", videoController.getCourseVideos);
router.get("/:courseId/videos/:videoId", videoController.getVideoById);

// Admin only routes
router.post(
    "/:courseId/videos",
    authenticate,
    isAdmin,
    upload.array("pdfs", 10), // Allow up to 10 PDF files
    createVideoValidation,
    validate,
    videoController.createVideo
);
router.put(
    "/:courseId/videos/:videoId",
    authenticate,
    isAdmin,
    upload.array("pdfs", 10), // Allow up to 10 PDF files
    videoController.updateVideo
);
router.delete(
    "/:courseId/videos/:videoId",
    authenticate,
    isAdmin,
    videoController.deleteVideo
);

module.exports = router;
