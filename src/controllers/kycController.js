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
    { name: "id_proof_2", maxCount: 1 },
]);

// Middleware for business upgrade (optional business proof)
const uploadBusinessProof = upload.single("business_proof");

/**
 * Submit Student KYC information
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
        if (!req.files || !req.files.id_proof || req.files.id_proof.length === 0 || !req.files.id_proof_2) {
            return res.status(400).json({
                success: false,
                message: "At least one ID proof file and one ID proof 2 are required",
            });
        }

        const idProofFiles = req.files.id_proof; // Array of files
        const idProof2File = req.files.id_proof_2[0];

        // Generate file URLs for all ID proof files
        const idProofUrls = idProofFiles.map(file => `/uploads/kyc/${file.filename}`);
        const idProof2Url = `/uploads/kyc/${idProof2File.filename}`;

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
            if (kyc.id_proof_2_url) {
                const oldIdProof2Path = path.join(
                    __dirname,
                    "../../",
                    kyc.id_proof_2_url
                );
                if (fs.existsSync(oldIdProof2Path)) {
                    fs.unlinkSync(oldIdProof2Path);
                }
            }

            // Automatically set user_type to 'student' if not already set
            await query(
                `UPDATE users 
                 SET user_type = 'student' 
                 WHERE id = $1 AND user_type IS NULL`,
                [userId]
            );

            // Update existing KYC
            // Use first URL for id_proof_url (backward compatibility) and all URLs for id_proof_urls
            const firstIdProofUrl = idProofUrls.length > 0 ? idProofUrls[0] : null;
            const result = await query(
                `UPDATE kyc_verifications 
                 SET first_name = $1, last_name = $2, address = $3, 
                     contact_number = $4, whatsapp_number = $5,
                     id_proof_url = $6, id_proof_urls = $7::jsonb, id_proof_2_url = $8,
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
                    idProof2Url,
                    userId,
                ]
            );

            // Set user type to student if not set
            await query(
                "UPDATE users SET user_type = 'student' WHERE id = $1 AND user_type IS NULL",
                [userId]
            );

            // Create notification
            const { createNotification } = require("./notificationController");
            await createNotification(
                userId,
                "kyc_pending",
                "Student KYC Submitted",
                "Your KYC information has been updated and is pending review. You will be notified once it's verified (business days 9am-6pm).",
                { kyc_id: result.rows[0].id }
            );

            // Send pending email
            const { sendKYCPendingEmail } = require("../config/email");
            const userResult = await query("SELECT email, first_name FROM users WHERE id = $1", [userId]);
            if (userResult.rows[0]?.email) {
                await sendKYCPendingEmail(userResult.rows[0].email, userResult.rows[0].first_name, "Student KYC");
            }

            return res.status(200).json({
                success: true,
                message: "Student KYC information updated successfully",
                data: result.rows[0],
            });
        }

        // Automatically set user_type to 'student' if not already set
        await query(
            `UPDATE users 
             SET user_type = 'student' 
             WHERE id = $1 AND user_type IS NULL`,
            [userId]
        );

        // Create new KYC record
        // Use first URL for id_proof_url (backward compatibility - NOT NULL constraint) and all URLs for id_proof_urls
        const firstIdProofUrl = idProofUrls.length > 0 ? idProofUrls[0] : null;
        const result = await query(
            `INSERT INTO kyc_verifications 
             (user_id, first_name, last_name, address, contact_number, 
              whatsapp_number, id_proof_url, id_proof_urls, id_proof_2_url, status)
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
                idProof2Url,
            ]
        );

        // Set user type to student if not set
        await query(
            "UPDATE users SET user_type = 'student' WHERE id = $1 AND user_type IS NULL",
            [userId]
        );

        // Create notification
        const { createNotification } = require("./notificationController");
        await createNotification(
            userId,
            "kyc_pending",
            "Student KYC Submitted",
            "Your KYC information has been submitted successfully. You will be notified once it's verified (business days 9am-6pm).",
            { kyc_id: result.rows[0].id }
        );

        // Send pending email
        const { sendKYCPendingEmail } = require("../config/email");
        const userResult = await query("SELECT email, first_name FROM users WHERE id = $1", [userId]);
        if (userResult.rows[0]?.email) {
            await sendKYCPendingEmail(userResult.rows[0].email, userResult.rows[0].first_name, "Student KYC");
        }

        res.status(201).json({
            success: true,
            message: "Student KYC information submitted successfully",
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
 * Upgrade Student to Business Owner
 * Adds business information to existing Student KYC
 */
const upgradeToBusiness = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { business_id, business_location_link } = req.body;

        // Validation
        if (!business_id || !business_location_link) {
            return res.status(400).json({
                success: false,
                message: "Business ID and business location link are required",
            });
        }

        // Check if user has Student KYC
        const kycCheck = await query(
            "SELECT id, status, upgraded_to_business FROM kyc_verifications WHERE user_id = $1",
            [userId]
        );

        if (kycCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Please complete Student KYC first before upgrading to business",
                requires_student_kyc: true,
            });
        }

        const kyc = kycCheck.rows[0];

        // Check if Student KYC is verified
        if (kyc.status !== "verified") {
            return res.status(403).json({
                success: false,
                message: "Your Student KYC must be verified before upgrading to business",
                kyc_status: kyc.status,
            });
        }

        // Check if already upgraded
        if (kyc.upgraded_to_business) {
            return res.status(409).json({
                success: false,
                message: "You have already upgraded to business owner",
            });
        }

        // Handle business proof upload
        let businessProofUrl = null;
        if (req.file) {
            businessProofUrl = `/uploads/kyc/${req.file.filename}`;
        }

        // Upgrade to business - set status back to pending for admin approval
        const result = await query(
            `UPDATE kyc_verifications 
             SET business_id = $1, 
                 business_location_link = $2,
                 business_proof_url = $3,
                 upgraded_to_business = false,
                 business_upgraded_at = NULL,
                 status = 'pending',
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $4
             RETURNING *`,
            [business_id, business_location_link, businessProofUrl, userId]
        );

        // Update user type to business_owner
        await query(
            "UPDATE users SET user_type = 'business_owner' WHERE id = $1",
            [userId]
        );

        // Create notification
        const { createNotification } = require("./notificationController");
        await createNotification(
            userId,
            "kyc_pending",
            "Business Upgrade Submitted",
            "Your business information has been submitted for verification. You will be notified once approved (business days 9am-6pm).",
            { kyc_id: kyc.id }
        );

        // Send pending email
        const { sendKYCPendingEmail } = require("../config/email");
        const userResult = await query("SELECT email, first_name FROM users WHERE id = $1", [userId]);
        if (userResult.rows[0]?.email) {
            await sendKYCPendingEmail(userResult.rows[0].email, userResult.rows[0].first_name, "Business Upgrade");
        }

        res.json({
            success: true,
            message: "Business upgrade submitted successfully. Pending admin approval.",
            data: result.rows[0],
        });
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file) {
            const filePath = path.join(
                __dirname,
                "../../uploads/kyc",
                req.file.filename
            );
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
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
                id_proof_2_url,
                status,
                rejection_reason,
                verified_at,
                business_id,
                business_location_link,
                business_proof_url,
                upgraded_to_business,
                business_upgraded_at,
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
                k.id_proof_2_url,
                k.status,
                k.rejection_reason,
                k.verified_by,
                k.verified_at,
                k.business_id,
                k.business_location_link,
                k.business_proof_url,
                k.upgraded_to_business,
                k.business_upgraded_at,
                k.created_at,
                k.updated_at,
                u.id as user_id,
                u.email as user_email,
                u.first_name as user_first_name,
                u.last_name as user_last_name,
                u.user_type,
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
                k.id_proof_2_url,
                k.status,
                k.rejection_reason,
                k.verified_by,
                k.verified_at,
                k.business_id,
                k.business_location_link,
                k.business_proof_url,
                k.upgraded_to_business,
                k.business_upgraded_at,
                k.created_at,
                k.updated_at,
                u.id as user_id,
                u.email as user_email,
                u.first_name as user_first_name,
                u.last_name as user_last_name,
                u.user_type,
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
 * Now handles both Student KYC and Business Upgrade verification
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
            `SELECT id, user_id, status, business_id, upgraded_to_business 
             FROM kyc_verifications WHERE id = $1`,
            [id]
        );

        if (existingKYC.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "KYC verification not found",
            });
        }

        const kyc = existingKYC.rows[0];
        const isBusinessUpgrade = kyc.business_id !== null;

        // Update KYC status
        const updateData = {
            status,
            verified_by: adminId,
            verified_at: new Date(),
            updated_at: new Date(),
        };

        let updateQuery = `UPDATE kyc_verifications 
             SET status = $1, verified_by = $2, verified_at = $3,
                 rejection_reason = $4, updated_at = CURRENT_TIMESTAMP`;
        
        const params = [status, adminId, updateData.verified_at, 
                       status === "rejected" ? rejection_reason : null];
        
        // If this is a business upgrade and it's being verified, set the flag
        if (isBusinessUpgrade && status === "verified") {
            updateQuery += `, upgraded_to_business = true, business_upgraded_at = CURRENT_TIMESTAMP`;
        }
        
        updateQuery += ` WHERE id = $5 RETURNING *`;
        params.push(id);

        const result = await query(updateQuery, params);

        // Create notification for user
        const { createNotification } = require("./notificationController");
        const { sendKYCApprovedEmail, sendKYCRejectedEmail } = require("../config/email");
        const userId = kyc.user_id;

        // Get user email for email notification
        const userResult = await query("SELECT email, first_name FROM users WHERE id = $1", [userId]);
        const userEmail = userResult.rows[0]?.email;
        const userName = userResult.rows[0]?.first_name;

        if (status === "verified") {
            if (isBusinessUpgrade) {
                await createNotification(
                    userId,
                    "kyc_business_upgrade_verified",
                    "Business Upgrade Approved",
                    "Your business upgrade has been approved. You can now purchase KYC-required products in bulk quantities.",
                    { kyc_id: id }
                );
                // Send email
                if (userEmail) {
                    await sendKYCApprovedEmail(userEmail, userName, "Business Upgrade");
                }
            } else {
                await createNotification(
                    userId,
                    "kyc_verified",
                    "Student KYC Approved",
                    "Your KYC verification has been approved. You can now purchase courses.",
                    { kyc_id: id }
                );
                // Send email
                if (userEmail) {
                    await sendKYCApprovedEmail(userEmail, userName, "Student KYC");
                }
            }
        } else {
            if (isBusinessUpgrade) {
                await createNotification(
                    userId,
                    "kyc_business_upgrade_rejected",
                    "Business Upgrade Rejected",
                    `Your business upgrade has been rejected. Reason: ${rejection_reason}`,
                    { kyc_id: id, rejection_reason }
                );
                // Send email
                if (userEmail) {
                    await sendKYCRejectedEmail(userEmail, userName, rejection_reason, "Business Upgrade");
                }
            } else {
                await createNotification(
                    userId,
                    "kyc_rejected",
                    "Student KYC Rejected",
                    `Your KYC verification has been rejected. Reason: ${rejection_reason}`,
                    { kyc_id: id, rejection_reason }
                );
                // Send email
                if (userEmail) {
                    await sendKYCRejectedEmail(userEmail, userName, rejection_reason, "Student KYC");
                }
            }
        }

        res.json({
            success: true,
            message: `${isBusinessUpgrade ? 'Business upgrade' : 'Student KYC'} ${status} successfully`,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get KYC status for current user
 */
const getKYCStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT status, verified_at 
             FROM kyc_verifications 
             WHERE user_id = $1
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    status: null,
                    verified_at: null,
                    message: "No KYC submission found"
                }
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    submitKYC,
    upgradeToBusiness,
    getMyKYC,
    getAllKYC,
    getKYCById,
    verifyKYC,
    getKYCStatus,
    uploadFields, // Export upload middleware
    uploadBusinessProof, // Export business proof upload middleware
};
