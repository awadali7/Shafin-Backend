const { query } = require("../config/database");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "../../uploads/kyc");
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});

const fileFilter = (req, file, cb) => {
    // Allow images and PDFs
    const allowedMimes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf",
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                "Invalid file type. Only JPEG, PNG, WebP images and PDF files are allowed."
            ),
            false
        );
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter,
});

// Middleware for handling file uploads
const uploadFields = upload.fields([
    { name: "id_proof", maxCount: 10 }, // Allow up to 10 ID proof images
    { name: "profile_photo", maxCount: 1 },
]);

/**
 * Submit KYC information
 */
const submitKYC = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const {
            first_name,
            last_name,
            address,
            contact_number,
            whatsapp_number,
        } = req.body;

        // Validation
        if (
            !first_name ||
            !last_name ||
            !address ||
            !contact_number ||
            !whatsapp_number
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "First name, last name, address, contact number, and WhatsApp number are required",
            });
        }

        // Check if files are uploaded
        if (!req.files || !req.files.id_proof || req.files.id_proof.length === 0 || !req.files.profile_photo) {
            return res.status(400).json({
                success: false,
                message: "At least one ID proof image and profile photo are required",
            });
        }

        const idProofFiles = req.files.id_proof; // Array of files
        const profilePhotoFile = req.files.profile_photo[0];

        // Generate file URLs for all ID proof files
        const idProofUrls = idProofFiles.map(file => `/uploads/kyc/${file.filename}`);
        const profilePhotoUrl = `/uploads/kyc/${profilePhotoFile.filename}`;

        // Check if user already has a KYC record
        const existingKYC = await query(
            "SELECT id, status, id_proof_urls, id_proof_url FROM kyc_verifications WHERE user_id = $1",
            [userId]
        );

        if (existingKYC.rows.length > 0) {
            const kyc = existingKYC.rows[0];

            // If already verified, don't allow resubmission
            if (kyc.status === "verified") {
                return res.status(409).json({
                    success: false,
                    message: "KYC is already verified",
                });
            }

            // If pending or rejected, update the record
            // Delete old files if they exist (handle both old single URL and new array format)
            const oldIdProofUrls = kyc.id_proof_urls || (kyc.id_proof_url ? [kyc.id_proof_url] : []);
            if (Array.isArray(oldIdProofUrls) && oldIdProofUrls.length > 0) {
                oldIdProofUrls.forEach(url => {
                    const oldIdProofPath = path.join(__dirname, "../../", url);
                    if (fs.existsSync(oldIdProofPath)) {
                        fs.unlinkSync(oldIdProofPath);
                    }
                });
            } else if (kyc.id_proof_url) {
                // Handle legacy single URL format
                const oldIdProofPath = path.join(__dirname, "../../", kyc.id_proof_url);
                if (fs.existsSync(oldIdProofPath)) {
                    fs.unlinkSync(oldIdProofPath);
                }
            }
            if (kyc.profile_photo_url) {
                const oldPhotoPath = path.join(
                    __dirname,
                    "../../",
                    kyc.profile_photo_url
                );
                if (fs.existsSync(oldPhotoPath)) {
                    fs.unlinkSync(oldPhotoPath);
                }
            }

            // Update existing KYC
            // Use first URL for id_proof_url (backward compatibility) and all URLs for id_proof_urls
            const firstIdProofUrl = idProofUrls.length > 0 ? idProofUrls[0] : null;
            const result = await query(
                `UPDATE kyc_verifications 
                 SET first_name = $1, last_name = $2, address = $3, 
                     contact_number = $4, whatsapp_number = $5,
                     id_proof_url = $6, id_proof_urls = $7::jsonb, profile_photo_url = $8,
                     status = 'pending', rejection_reason = NULL,
                     verified_by = NULL, verified_at = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $9
                 RETURNING *`,
                [
                    first_name,
                    last_name,
                    address,
                    contact_number,
                    whatsapp_number,
                    firstIdProofUrl, // First URL for backward compatibility
                    JSON.stringify(idProofUrls), // Convert array to JSON string for JSONB column
                    profilePhotoUrl,
                    userId,
                ]
            );

            return res.status(200).json({
                success: true,
                message: "KYC information updated successfully",
                data: result.rows[0],
            });
        }

        // Create new KYC record
        // Use first URL for id_proof_url (backward compatibility - NOT NULL constraint) and all URLs for id_proof_urls
        const firstIdProofUrl = idProofUrls.length > 0 ? idProofUrls[0] : null;
        const result = await query(
            `INSERT INTO kyc_verifications 
             (user_id, first_name, last_name, address, contact_number, 
              whatsapp_number, id_proof_url, id_proof_urls, profile_photo_url, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'pending')
             RETURNING *`,
            [
                userId,
                first_name,
                last_name,
                address,
                contact_number,
                whatsapp_number,
                firstIdProofUrl, // First URL for backward compatibility (NOT NULL constraint)
                JSON.stringify(idProofUrls), // Convert array to JSON string for JSONB column
                profilePhotoUrl,
            ]
        );

        res.status(201).json({
            success: true,
            message: "KYC information submitted successfully",
            data: result.rows[0],
        });
    } catch (error) {
        // Clean up uploaded files on error
        if (req.files) {
            Object.values(req.files).forEach((fileArray) => {
                fileArray.forEach((file) => {
                    const filePath = path.join(
                        __dirname,
                        "../../uploads/kyc",
                        file.filename
                    );
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });
            });
        }
        next(error);
    }
};

/**
 * Get user's KYC status
 */
const getMyKYC = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT 
                id,
                first_name,
                last_name,
                address,
                contact_number,
                whatsapp_number,
                COALESCE(id_proof_urls, CASE WHEN id_proof_url IS NOT NULL THEN jsonb_build_array(id_proof_url) ELSE NULL END) as id_proof_url,
                profile_photo_url,
                status,
                rejection_reason,
                verified_at,
                created_at,
                updated_at
             FROM kyc_verifications 
             WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: "No KYC information found",
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all KYC verifications (Admin only)
 */
const getAllKYC = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let queryText = `
            SELECT 
                k.id,
                k.first_name,
                k.last_name,
                k.address,
                k.contact_number,
                k.whatsapp_number,
                COALESCE(k.id_proof_urls, CASE WHEN k.id_proof_url IS NOT NULL THEN jsonb_build_array(k.id_proof_url) ELSE NULL END) as id_proof_url,
                k.profile_photo_url,
                k.status,
                k.rejection_reason,
                k.verified_by,
                k.verified_at,
                k.created_at,
                k.updated_at,
                u.id as user_id,
                u.email as user_email,
                u.first_name as user_first_name,
                u.last_name as user_last_name,
                verifier.email as verifier_email
             FROM kyc_verifications k
             JOIN users u ON k.user_id = u.id
             LEFT JOIN users verifier ON k.verified_by = verifier.id
             WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (status) {
            queryText += ` AND k.status = $${paramCount++}`;
            params.push(status);
        }

        // Get total count
        const countResult = await query(
            queryText.replace(
                /SELECT[\s\S]*FROM/,
                "SELECT COUNT(*) as total FROM"
            ),
            params
        );
        const total = parseInt(countResult.rows[0].total);

        // Get paginated results
        queryText += ` ORDER BY k.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(parseInt(limit), offset);

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: {
                kyc_verifications: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get specific KYC by ID (Admin only)
 */
const getKYCById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT 
                k.id,
                k.first_name,
                k.last_name,
                k.address,
                k.contact_number,
                k.whatsapp_number,
                COALESCE(k.id_proof_urls, CASE WHEN k.id_proof_url IS NOT NULL THEN jsonb_build_array(k.id_proof_url) ELSE NULL END) as id_proof_url,
                k.profile_photo_url,
                k.status,
                k.rejection_reason,
                k.verified_by,
                k.verified_at,
                k.created_at,
                k.updated_at,
                u.id as user_id,
                u.email as user_email,
                u.first_name as user_first_name,
                u.last_name as user_last_name,
                verifier.email as verifier_email
             FROM kyc_verifications k
             JOIN users u ON k.user_id = u.id
             LEFT JOIN users verifier ON k.verified_by = verifier.id
             WHERE k.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "KYC verification not found",
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Verify KYC (Admin only)
 */
const verifyKYC = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;
        const adminId = req.user.id;

        if (!status || !["verified", "rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be either 'verified' or 'rejected'",
            });
        }

        if (status === "rejected" && !rejection_reason) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required when rejecting KYC",
            });
        }

        // Check if KYC exists
        const existingKYC = await query(
            "SELECT id, user_id, status FROM kyc_verifications WHERE id = $1",
            [id]
        );

        if (existingKYC.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "KYC verification not found",
            });
        }

        // Update KYC status
        const updateData = {
            status,
            verified_by: adminId,
            verified_at: new Date(),
            updated_at: new Date(),
        };

        if (status === "rejected") {
            updateData.rejection_reason = rejection_reason;
        } else {
            updateData.rejection_reason = null;
        }

        const result = await query(
            `UPDATE kyc_verifications 
             SET status = $1, verified_by = $2, verified_at = $3,
                 rejection_reason = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [
                status,
                adminId,
                updateData.verified_at,
                updateData.rejection_reason,
                id,
            ]
        );

        // Create notification for user
        const { createNotification } = require("./notificationController");
        const userId = existingKYC.rows[0].user_id;

        if (status === "verified") {
            await createNotification(
                userId,
                "kyc_verified",
                "KYC Verification Approved",
                "Your KYC verification has been approved. You can now request course access.",
                { kyc_id: id }
            );
        } else {
            await createNotification(
                userId,
                "kyc_rejected",
                "KYC Verification Rejected",
                `Your KYC verification has been rejected. Reason: ${rejection_reason}`,
                { kyc_id: id, rejection_reason }
            );
        }

        res.json({
            success: true,
            message: `KYC ${status} successfully`,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitKYC,
    getMyKYC,
    getAllKYC,
    getKYCById,
    verifyKYC,
    uploadFields, // Export upload middleware
};
