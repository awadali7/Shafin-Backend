const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const productController = require("../controllers/productController");
const { authenticate, isAdmin } = require("../middleware/auth");

// Directories:
// - public images are served under /uploads/images
// - digital files are stored privately (NOT served by express.static)
const imagesDir = path.join(__dirname, "../../uploads/images");
const digitalDir = path.join(__dirname, "../../private_uploads/digital");

[imagesDir, digitalDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === "cover_image") return cb(null, imagesDir);
        if (file.fieldname === "digital_file") return cb(null, digitalDir);
        return cb(null, imagesDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const fileFilter = (req, file, cb) => {
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

    if (file.fieldname === "digital_file") {
        const allowedMimes = [
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.rar",
            "application/x-rar-compressed",
        ];
        if (allowedMimes.includes(file.mimetype)) return cb(null, true);
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
    limits: { fileSize: 250 * 1024 * 1024 }, // 250MB (digital archives can be bigger)
});

// Public routes
router.get("/", productController.getAllProducts);

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
