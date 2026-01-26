const path = require("path");
const fs = require("fs");
const multer = require("multer");

// Private directory for digital files
const digitalDir = path.join(__dirname, "../../private_uploads/digital");

// Ensure directory exists
if (!fs.existsSync(digitalDir)) {
    fs.mkdirSync(digitalDir, { recursive: true });
}

// Helper function to generate unique filename with auto-numbering
const generateUniqueFilename = (baseName, extension) => {
    let filename = `${baseName}${extension}`;
    let counter = 1;

    while (fs.existsSync(path.join(digitalDir, filename))) {
        filename = `${baseName} (${counter})${extension}`;
        counter++;
    }

    return filename;
};

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, digitalDir);
    },
    filename: (req, file, cb) => {
        // Use a temporary unique name during upload
        // We'll rename it after we have access to req.body.custom_name
        const tempName = `temp_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}${path.extname(file.originalname)}`;
        cb(null, tempName);
    },
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        "application/zip",
        "application/x-zip-compressed",
        "application/x-compressed",
        "multipart/x-zip",
        "application/vnd.rar",
        "application/x-rar-compressed",
        "application/x-rar",
        "application/octet-stream", // Generic binary (Windows often uses this for RAR)
    ];

    // Get file extension (case-insensitive)
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [".zip", ".rar"];

    // Check MIME type OR file extension
    const isValidMime = allowedMimes.includes(file.mimetype);
    const isValidExtension = allowedExtensions.includes(ext);

    if (isValidMime && isValidExtension) {
        cb(null, true);
    } else if (isValidExtension) {
        // If extension is valid but MIME is not in our list, still allow it
        // This handles cases where Windows sends different MIME types
        cb(null, true);
    } else {
        cb(
            new Error("Invalid file type. Only ZIP and RAR are allowed."),
            false
        );
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2048 * 1024 * 1024, // 2GB
    },
});

/**
 * List all digital files
 */
const listDigitalFiles = async (req, res, next) => {
    try {
        if (!fs.existsSync(digitalDir)) {
            return res.json({ success: true, data: [] });
        }

        const files = fs.readdirSync(digitalDir);
        const fileList = files.map((filename) => {
            const filePath = path.join(digitalDir, filename);
            const stats = fs.statSync(filePath);
            return {
                name: filename,
                size: stats.size,
                created_at: stats.birthtime,
            };
        });

        // Sort by newest first
        fileList.sort((a, b) => b.created_at - a.created_at);

        res.json({ success: true, data: fileList });
    } catch (error) {
        next(error);
    }
};

/**
 * Upload a new digital file
 */
const uploadDigitalFile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res
                .status(400)
                .json({ success: false, message: "No file uploaded" });
        }

        // Now we have access to req.body.custom_name
        const customName = req.body?.custom_name?.trim();
        const extension = path.extname(req.file.originalname);

        // Use custom_name if provided, otherwise use original filename
        const nameWithoutExt =
            customName || path.basename(req.file.originalname, extension);

        // Sanitize the name
        const sanitizedName = nameWithoutExt.replace(
            /[^a-zA-Z0-9.\-_\s]/g,
            "_"
        );

        // Generate unique filename with auto-numbering if duplicate
        const finalFilename = generateUniqueFilename(sanitizedName, extension);

        // Rename from temp name to final name
        const tempPath = req.file.path;
        const finalPath = path.join(digitalDir, finalFilename);

        fs.renameSync(tempPath, finalPath);

        res.status(201).json({
            success: true,
            message: "File uploaded successfully",
            data: {
                name: finalFilename,
                size: req.file.size,
            },
        });
    } catch (error) {
        // Cleanup if error
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) {}
        }
        next(error);
    }
};

/**
 * Delete a digital file
 */
const deleteDigitalFile = async (req, res, next) => {
    try {
        const { filename } = req.params;
        if (!filename) {
            return res
                .status(400)
                .json({ success: false, message: "Filename required" });
        }

        // Prevent path traversal
        const safeFilename = path.basename(filename);
        const filePath = path.join(digitalDir, safeFilename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: "File deleted successfully" });
        } else {
            res.status(404).json({ success: false, message: "File not found" });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Download a digital file
 */
const downloadDigitalFile = async (req, res, next) => {
    try {
        const { filename } = req.params;
        if (!filename) {
            return res
                .status(400)
                .json({ success: false, message: "Filename required" });
        }

        // Prevent path traversal
        const safeFilename = path.basename(filename);
        const filePath = path.join(digitalDir, safeFilename);

        if (fs.existsSync(filePath)) {
            res.download(filePath, safeFilename);
        } else {
            res.status(404).json({ success: false, message: "File not found" });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listDigitalFiles,
    uploadDigitalFile,
    deleteDigitalFile,
    downloadDigitalFile,
    upload,
};
