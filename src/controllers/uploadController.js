const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Ensure upload directories exist
const uploadDirs = {
    images: path.join(__dirname, "../../uploads/images"),
    documents: path.join(__dirname, "../../uploads/documents"),
    blog: path.join(__dirname, "../../uploads/blog"),
};

Object.values(uploadDirs).forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadType = req.body.type || "images"; // images, documents, blog
        const uploadDir = uploadDirs[uploadType] || uploadDirs.images;
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: uuid-originalname
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

// File filter
const fileFilter = (req, file, cb) => {
    const uploadType = req.body.type || "images";

    if (uploadType === "images") {
        // Allow images
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
    } else if (uploadType === "documents") {
        // Allow documents
        const allowedMimes = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/csv",
            // Digital product archives
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.rar",
            "application/x-rar-compressed",
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Invalid file type. Only PDF, Word, Excel, PowerPoint, and text files are allowed."
                ),
                false
            );
        }
    } else if (uploadType === "blog") {
        // Allow both images and documents for blog
        const allowedMimes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/svg+xml",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/csv",
            // Digital product archives
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.rar",
            "application/x-rar-compressed",
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Invalid file type. Only images and documents are allowed."
                ),
                false
            );
        }
    } else {
        cb(new Error("Invalid upload type"), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

/**
 * Upload single file
 */
const uploadFile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded",
            });
        }

        const uploadType = req.body.type || "images";
        const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
        const fileUrl = `${baseUrl}/uploads/${uploadType}/${req.file.filename}`;

        res.json({
            success: true,
            message: "File uploaded successfully",
            data: {
                filename: req.file.filename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                url: fileUrl,
                path: `/uploads/${uploadType}/${req.file.filename}`,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Upload multiple files
 */
const uploadMultipleFiles = async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No files uploaded",
            });
        }

        const uploadType = req.body.type || "images";
        const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
        const files = req.files.map((file) => ({
            filename: file.filename,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            url: `${baseUrl}/uploads/${uploadType}/${file.filename}`,
            path: `/uploads/${uploadType}/${file.filename}`,
        }));

        res.json({
            success: true,
            message: "Files uploaded successfully",
            data: files,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete file
 */
const deleteFile = async (req, res, next) => {
    try {
        const { filename, type } = req.params;
        const uploadType = type || "images";
        const filePath = path.join(
            uploadDirs[uploadType] || uploadDirs.images,
            filename
        );

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: "File not found",
            });
        }

        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: "File deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    upload,
    uploadFile,
    uploadMultipleFiles,
    deleteFile,
};
