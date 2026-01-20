const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const productController = require("../controllers/productController");
const { authenticate, optionalAuthenticate, isAdmin } = require("../middleware/auth");

// Directories:
// - public images are served under /uploads/images
// - public videos are served under /uploads/videos
// - digital files are stored privately (NOT served by express.static)
const imagesDir = path.join(__dirname, "../../uploads/images");
const videosDir = path.join(__dirname, "../../uploads/videos");
const digitalDir = path.join(__dirname, "../../private_uploads/digital");

[imagesDir, videosDir, digitalDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === "cover_image" || file.fieldname === "images" || file.fieldname === "video_thumbnails") {
            return cb(null, imagesDir);
        }
        if (file.fieldname === "videos") {
            return cb(null, videosDir);
        }
        if (file.fieldname === "digital_file") {
            return cb(null, digitalDir);
        }
        return cb(null, imagesDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const fileFilter = (req, file, cb) => {
    // Handle cover_image
    if (file.fieldname === "cover_image") {
        const allowedMimes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/svg+xml",
        ];
        if (allowedMimes.includes(file.mimetype)) return cb(null, true);
        return cb(
            new Error(
                "Invalid cover image. Only JPEG, PNG, GIF, WebP, and SVG images are allowed."
            ),
            false
        );
    }

    // Handle multiple images (images[])
    if (file.fieldname === "images") {
        const allowedMimes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/svg+xml",
        ];
        if (allowedMimes.includes(file.mimetype)) return cb(null, true);
        return cb(
            new Error(
                "Invalid image. Only JPEG, PNG, GIF, WebP, and SVG images are allowed."
            ),
            false
        );
    }

    // Handle video files (videos[])
    if (file.fieldname === "videos") {
        const allowedMimes = [
            "video/mp4",
            "video/webm",
            "video/ogg",
            "video/quicktime",
            "video/x-msvideo",
        ];
        if (allowedMimes.includes(file.mimetype)) return cb(null, true);
        return cb(
            new Error(
                "Invalid video. Only MP4, WebM, OGG, MOV, and AVI videos are allowed."
            ),
            false
        );
    }

    // Handle video thumbnails (video_thumbnails[])
    if (file.fieldname === "video_thumbnails") {
        const allowedMimes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
        ];
        if (allowedMimes.includes(file.mimetype)) return cb(null, true);
        return cb(
            new Error(
                "Invalid thumbnail. Only JPEG, PNG, GIF, and WebP images are allowed."
            ),
            false
        );
    }

    // Handle digital_file
        if (file.fieldname === "digital_file") {
        const allowedMimes = [
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.rar",
            "application/x-rar-compressed",
            "application/x-rar",
        ];
        if (allowedMimes.includes(file.mimetype)) return cb(null, true);
        console.log("Rejected digital file mime:", file.mimetype);
        return cb(
            new Error(
                "Invalid digital file. Only ZIP and RAR files are allowed."
            ),
            false
        );
    }

    return cb(new Error("Invalid file field"), false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { 
        fileSize: 250 * 1024 * 1024, // 250MB (digital archives can be bigger)
        fieldSize: 50 * 1024 * 1024, // 50MB for non-file fields (for JSON strings)
    },
});

// Public routes (with optional authentication to filter purchased digital products)
router.get("/", optionalAuthenticate, productController.getAllProducts);
router.get("/featured/list", productController.getFeaturedProducts); // Must be before /:slug

// Admin routes (must be defined BEFORE /:slug)
router.get(
    "/admin/all",
    authenticate,
    isAdmin,
    productController.adminGetAllProducts
);
router.post(
    "/admin",
    authenticate,
    isAdmin,
    upload.fields([
        { name: "cover_image", maxCount: 1 },
        { name: "digital_file", maxCount: 1 },
        { name: "images", maxCount: 20 }, // Allow up to 20 images
        { name: "videos", maxCount: 10 }, // Allow up to 10 videos
        { name: "video_thumbnails", maxCount: 10 }, // Allow up to 10 video thumbnails
    ]),
    productController.adminCreateProduct
);
router.put(
    "/admin/:id",
    authenticate,
    isAdmin,
    upload.fields([
        { name: "cover_image", maxCount: 1 },
        { name: "digital_file", maxCount: 1 },
        { name: "images", maxCount: 20 }, // Allow up to 20 images
        { name: "videos", maxCount: 10 }, // Allow up to 10 videos
        { name: "video_thumbnails", maxCount: 10 }, // Allow up to 10 video thumbnails
    ]),
    productController.adminUpdateProduct
);
router.delete(
    "/admin/:id",
    authenticate,
    isAdmin,
    productController.adminDeleteProduct
);

// Downloads (auth required)
router.get(
    "/:slug/download",
    authenticate,
    productController.downloadDigitalProductBySlug
);

// Slug route must be last (otherwise it captures /admin/*)
router.get("/:slug", productController.getProductBySlug);

module.exports = router;
