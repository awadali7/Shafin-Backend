const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Private directory for digital files
const digitalDir = path.join(__dirname, "../../private_uploads/digital");

// Ensure directory exists
if (!fs.existsSync(digitalDir)) {
    fs.mkdirSync(digitalDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, digitalDir);
    },
    filename: (req, file, cb) => {
        // Keep original filename if possible, but handle duplicates or just use uuid prefix
        // For library, users prefer original names. Let's prepend UUID to ensure uniqueness.
        // OR preserve original name for easier "copy link" usage if conflicts aren't an issue.
        // Better: UUID-OriginalName
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        "application/zip",
        "application/x-zip-compressed",
        "application/vnd.rar",
        "application/x-rar-compressed",
        "application/x-rar",
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only ZIP and RAR are allowed."), false);
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
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        let finalFilename = req.file.filename;

        // Construct final filename
        // If custom_name is provided, use it after the UUID prefix
        // We need to parse the UUID from the current filename first
        if (req.body.custom_name && req.body.custom_name.trim()) {
            const extension = path.extname(req.file.originalname); // .zip
            const sanitizedCustomName = req.body.custom_name.trim().replace(/[^a-zA-Z0-9.\-_]/g, "_");
            
            // Current format: uuid-originalname
            // We want: uuid-customname
            const uuidPrefix = req.file.filename.substring(0, 36); // UUID is 36 chars
            const newFilename = `${uuidPrefix}-${sanitizedCustomName}${extension}`;
            
            const oldPath = req.file.path;
            const newPath = path.join(digitalDir, newFilename);
            
            fs.renameSync(oldPath, newPath);
            finalFilename = newFilename;
        }

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
             try { fs.unlinkSync(req.file.path); } catch(e) {}
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
            return res.status(400).json({ success: false, message: "Filename required" });
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
            return res.status(400).json({ success: false, message: "Filename required" });
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
