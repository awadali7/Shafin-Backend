const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { query } = require("../config/database");
const { sendDigitalFileAccessEmail } = require("../config/email");

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

/**
 * Admin: grant a digital file to a user for a time-bound period
 */
const grantDigitalFileAccess = async (req, res, next) => {
    try {
        const { filename, user_id, access_start, access_end } = req.body || {};

        if (!filename || !user_id || !access_start || !access_end) {
            return res.status(400).json({
                success: false,
                message:
                    "filename, user_id, access_start, and access_end are required",
            });
        }

        const safeFilename = path.basename(filename);
        if (!fs.existsSync(path.join(digitalDir, safeFilename))) {
            return res.status(404).json({
                success: false,
                message: "File not found in library",
            });
        }

        const userResult = await query(
            "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
            [user_id]
        );
        if (userResult.rows.length === 0) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }
        const user = userResult.rows[0];

        const accessResult = await query(
            `INSERT INTO digital_file_access (user_id, filename, access_start, access_end, granted_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, filename) DO UPDATE
             SET access_start = EXCLUDED.access_start,
                 access_end = EXCLUDED.access_end,
                 is_active = true,
                 granted_by = EXCLUDED.granted_by,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING id, access_start, access_end`,
            [user_id, safeFilename, access_start, access_end, req.user.id]
        );

        sendDigitalFileAccessEmail(
            user.email,
            `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
                user.email,
            safeFilename,
            access_start,
            access_end
        ).catch((err) =>
            console.error("Failed to send digital file access email:", err)
        );

        res.json({
            success: true,
            message: "Digital file access granted successfully",
            data: accessResult.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: revoke a user's access to a digital file
 */
const revokeDigitalFileAccess = async (req, res, next) => {
    try {
        const { filename, user_id } = req.body || {};
        if (!filename || !user_id) {
            return res.status(400).json({
                success: false,
                message: "filename and user_id are required",
            });
        }

        const safeFilename = path.basename(filename);

        const result = await query(
            `UPDATE digital_file_access
             SET is_active = false,
                 access_end = LEAST(access_end, CURRENT_TIMESTAMP)
             WHERE user_id = $1 AND filename = $2
               AND is_active = true AND access_end > CURRENT_TIMESTAMP
             RETURNING id`,
            [user_id, safeFilename]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No active access found for this user",
            });
        }

        res.json({
            success: true,
            message: "Digital file access removed successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * User: list digital files currently granted to me
 */
const getMyDigitalFileAccess = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT id as access_id, filename, source, access_start, access_end, created_at as granted_at
             FROM digital_file_access
             WHERE user_id = $1 AND is_active = true
               AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        next(error);
    }
};

/**
 * User: download a digital file I've been granted access to
 */
const downloadMyDigitalFile = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const safeFilename = path.basename(filename);

        const access = await query(
            `SELECT id FROM digital_file_access
             WHERE user_id = $1 AND filename = $2 AND is_active = true
               AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end
             LIMIT 1`,
            [req.user.id, safeFilename]
        );

        if (access.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message:
                    "You don't have access to this file. Contact admin.",
            });
        }

        const filePath = path.join(digitalDir, safeFilename);
        if (!fs.existsSync(filePath)) {
            return res
                .status(404)
                .json({ success: false, message: "File not found" });
        }

        res.download(filePath, safeFilename);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listDigitalFiles,
    uploadDigitalFile,
    deleteDigitalFile,
    downloadDigitalFile,
    grantDigitalFileAccess,
    revokeDigitalFileAccess,
    getMyDigitalFileAccess,
    downloadMyDigitalFile,
    upload,
};
