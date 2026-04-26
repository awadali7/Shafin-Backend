const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const courseController = require("../controllers/courseController");
const { authenticate, isAdmin } = require("../middleware/auth");
const { createCourseValidation } = require("../utils/validators");
const validate = require("../middleware/validate");

// Ensure upload directory exists
const imagesDir = path.join(__dirname, "../../uploads/images");
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

// Configure multer specifically for course cover images
const courseImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imagesDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: uuid-originalname
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

// File filter for images
const imageFileFilter = (req, file, cb) => {
    const allowedMimes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                "Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG images are allowed."
            ),
            false
        );
    }
};

// Create multer instance for course images
const uploadCourseImage = multer({
    storage: courseImageStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

// Public routes
router.get("/", courseController.getAllCourses);
router.get("/featured/list", courseController.getFeaturedCourses); // Must be before /:slug
router.get("/:slug", courseController.getCourseBySlug);

// Create JSON parser instance (only for JSON requests)
const jsonParser = express.json({ limit: "50mb" });

// Middleware to conditionally apply body parsing
// CRITICAL: Must check content-type BEFORE any parsing happens
const conditionalBodyParser = (req, res, next) => {
    const contentType = (req.headers["content-type"] || "").toLowerCase();

    console.log("[COURSE ROUTE] Content-Type:", contentType);
    console.log("[COURSE ROUTE] Request path:", req.path);

    // For multipart requests, skip body parsing completely - multer will handle it
    if (contentType.includes("multipart/form-data")) {
        console.log("[COURSE ROUTE] Detected multipart - using multer");
        // Apply multer directly - NO body parsing
        return uploadCourseImage.single("cover_image")(req, res, next);
    }

    // For JSON requests, apply JSON parser
    if (contentType.includes("application/json")) {
        console.log("[COURSE ROUTE] Detected JSON - using JSON parser");
        return jsonParser(req, res, next);
    }

    // For other content types, try JSON parser as fallback
    console.log(
        "[COURSE ROUTE] Unknown content-type - defaulting to JSON parser"
    );
    return jsonParser(req, res, next);
};

// Admin only routes
router.post(
    "/",
    authenticate,
    isAdmin,
    conditionalBodyParser, // Conditionally handle JSON or multipart
    createCourseValidation,
    validate,
    courseController.createCourse
);
router.put(
    "/:id",
    authenticate,
    isAdmin,
    jsonParser, // Parse JSON body for course updates
    courseController.updateCourse
);
router.delete("/:id", authenticate, isAdmin, courseController.deleteCourse);

// Course purchase route (authenticated users)
router.post("/:id/purchase", authenticate, courseController.purchaseCourse);

// Grant course access (Admin only)
router.post(
    "/:id/grant-access",
    authenticate,
    isAdmin,
    express.json(),
    courseController.grantCourseAccess
);

router.post(
    "/:id/revoke-access",
    authenticate,
    isAdmin,
    express.json(),
    courseController.revokeCourseAccess
);

module.exports = router;
