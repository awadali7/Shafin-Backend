const { query } = require("../config/database");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "../../uploads/product-kyc");
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
// Minimum 2 ID proofs, minimum 1 business proof (REQUIRED)
const uploadFields = upload.fields([
    { name: "id_proofs", maxCount: 10 }, // Allow up to 10 ID proofs
    { name: "business_proofs", maxCount: 10 }, // Business proofs (REQUIRED)
]);

/**
 * Submit Product KYC information
 */
const submitProductKYC = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { full_name, address, contact_number, whatsapp_number } =
            req.body;

        // Validation
        if (!full_name || !address || !contact_number || !whatsapp_number) {
            return res.status(400).json({
                success: false,
                message:
                    "Full name, address, contact number, and WhatsApp number are required",
            });
        }

        // Check if files are uploaded
        if (
            !req.files ||
            !req.files.id_proofs ||
            req.files.id_proofs.length < 2
        ) {
            return res.status(400).json({
                success: false,
                message: "At least 2 ID proof documents are required",
            });
        }

        // Business proof is now REQUIRED
        if (
            !req.files.business_proofs ||
            req.files.business_proofs.length < 1
        ) {
            return res.status(400).json({
                success: false,
                message: "At least 1 Business proof document is required",
            });
        }

        const idProofFiles = req.files.id_proofs; // Array of files
        const businessProofFiles = req.files.business_proofs; // REQUIRED

        // Generate file URLs
        const idProofUrls = idProofFiles.map(
            (file) => `/uploads/product-kyc/${file.filename}`
        );
        const businessProofUrls = businessProofFiles.map(
            (file) => `/uploads/product-kyc/${file.filename}`
        );

        // Check if user already has a Product KYC record
        const existingKYC = await query(
            "SELECT id, status, id_proofs, business_proofs FROM product_kyc_verifications WHERE user_id = $1",
            [userId]
        );

        if (existingKYC.rows.length > 0) {
            const kyc = existingKYC.rows[0];

            // If already verified, don't allow resubmission
            if (kyc.status === "verified") {
                return res.status(409).json({
                    success: false,
                    message: "Product KYC is already verified",
                });
            }

            // If pending or rejected, update the record
            // Delete old files if they exist
            const oldIdProofs = kyc.id_proofs || [];
            const oldBusinessProofs = kyc.business_proofs || [];

            [...oldIdProofs, ...oldBusinessProofs].forEach((url) => {
                const filePath = path.join(__dirname, "../../", url);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });

            // Automatically set user_type to 'business_owner' if not already set
            await query(
                `UPDATE users 
                 SET user_type = 'business_owner' 
                 WHERE id = $1 AND user_type IS NULL`,
                [userId]
            );

            // Update existing KYC
            const result = await query(
                `UPDATE product_kyc_verifications 
                 SET full_name = $1, address = $2, contact_number = $3, 
                     whatsapp_number = $4, id_proofs = $5, business_proofs = $6,
                     status = 'pending', rejection_reason = NULL,
                     verified_by = NULL, verified_at = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $7
                 RETURNING *`,
                [
                    full_name,
                    address,
                    contact_number,
                    whatsapp_number,
                    JSON.stringify(idProofUrls),
                    JSON.stringify(businessProofUrls),
                    userId,
                ]
            );

            return res.status(200).json({
                success: true,
                message: "Product KYC information updated successfully",
                data: result.rows[0],
            });
        }

        // Automatically set user_type to 'business_owner' if not already set
        await query(
            `UPDATE users 
             SET user_type = 'business_owner' 
             WHERE id = $1 AND user_type IS NULL`,
            [userId]
        );

        // Create new KYC record
        const result = await query(
            `INSERT INTO product_kyc_verifications 
             (user_id, full_name, address, contact_number, whatsapp_number, 
              id_proofs, business_proofs, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
             RETURNING *`,
            [
                userId,
                full_name,
                address,
                contact_number,
                whatsapp_number,
                JSON.stringify(idProofUrls),
                JSON.stringify(businessProofUrls),
            ]
        );

        res.status(201).json({
            success: true,
            message: "Product KYC information submitted successfully",
            data: result.rows[0],
        });
    } catch (error) {
        // Clean up uploaded files on error
        if (req.files) {
            Object.values(req.files).forEach((fileArray) => {
                fileArray.forEach((file) => {
                    const filePath = path.join(
                        __dirname,
                        "../../uploads/product-kyc",
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
 * Get user's Product KYC status
 */
const getMyProductKYC = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT 
                id, full_name, address, contact_number, whatsapp_number,
                id_proofs, business_proofs, status, rejection_reason,
                verified_at, created_at, updated_at
             FROM product_kyc_verifications 
             WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: "No Product KYC information found",
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
 * Get all Product KYC verifications (Admin only)
 */
const getAllProductKYC = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let queryText = `
            SELECT 
                k.id, k.full_name, k.address, k.contact_number, k.whatsapp_number,
                k.id_proofs, k.business_proofs, k.status, k.rejection_reason,
                k.verified_by, k.verified_at, k.created_at, k.updated_at,
                u.id as user_id, u.email as user_email,
                u.first_name as user_first_name, u.last_name as user_last_name,
                verifier.email as verifier_email
             FROM product_kyc_verifications k
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
            queryText.replace(/SELECT[\s\S]*FROM/, "SELECT COUNT(*) as total FROM"),
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
 * Get specific Product KYC by ID (Admin only)
 */
const getProductKYCById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT 
                k.id, k.full_name, k.address, k.contact_number, k.whatsapp_number,
                k.id_proofs, k.business_proofs, k.status, k.rejection_reason,
                k.verified_by, k.verified_at, k.created_at, k.updated_at,
                u.id as user_id, u.email as user_email,
                u.first_name as user_first_name, u.last_name as user_last_name,
                verifier.email as verifier_email
             FROM product_kyc_verifications k
             JOIN users u ON k.user_id = u.id
             LEFT JOIN users verifier ON k.verified_by = verifier.id
             WHERE k.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product KYC verification not found",
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
 * Verify Product KYC (Admin only)
 */
const verifyProductKYC = async (req, res, next) => {
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
                message: "Rejection reason is required when rejecting Product KYC",
            });
        }

        // Check if KYC exists
        const existingKYC = await query(
            "SELECT id, user_id, status FROM product_kyc_verifications WHERE id = $1",
            [id]
        );

        if (existingKYC.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product KYC verification not found",
            });
        }

        // Update KYC status
        const result = await query(
            `UPDATE product_kyc_verifications 
             SET status = $1, verified_by = $2, verified_at = $3,
                 rejection_reason = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [
                status,
                adminId,
                new Date(),
                status === "rejected" ? rejection_reason : null,
                id,
            ]
        );

        // Create notification for user
        const { createNotification } = require("./notificationController");
        const userId = existingKYC.rows[0].user_id;

        if (status === "verified") {
            await createNotification(
                userId,
                "product_kyc_verified",
                "Product KYC Verification Approved",
                "Your Product KYC verification has been approved. You can now purchase products that require KYC.",
                { kyc_id: id }
            );
        } else {
            await createNotification(
                userId,
                "product_kyc_rejected",
                "Product KYC Verification Rejected",
                `Your Product KYC verification has been rejected. Reason: ${rejection_reason}`,
                { kyc_id: id, rejection_reason }
            );
        }

        res.json({
            success: true,
            message: `Product KYC ${status} successfully`,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitProductKYC,
    getMyProductKYC,
    getAllProductKYC,
    getProductKYCById,
    verifyProductKYC,
    uploadFields, // Export upload middleware
};

