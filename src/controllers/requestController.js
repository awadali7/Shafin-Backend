const { query, getClient } = require("../config/database");
const {
    sendCourseAccessApprovedEmail,
    sendCourseAccessRejectedEmail,
} = require("../config/email");
const { REQUEST_STATUS } = require("../utils/constants");
const { normalizeImageUrl } = require("../utils/helpers");
const { createNotification } = require("./notificationController");

/**
 * Create course access request
 */
const createRequest = async (req, res, next) => {
    try {
        const { course_id, request_message } = req.body;
        const userId = req.user.id;

        // Check if course exists
        const courseCheck = await query(
            "SELECT id, name FROM courses WHERE id = $1 AND is_active = true",
            [course_id]
        );

        if (courseCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Check if user already has a pending request for this course
        const pendingRequest = await query(
            `SELECT id FROM course_requests
             WHERE user_id = $1 AND course_id = $2 AND status = $3`,
            [userId, course_id, REQUEST_STATUS.PENDING]
        );

        if (pendingRequest.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "You already have a pending request for this course",
            });
        }

        // Check if user already has access to this course
        const existingAccess = await query(
            `SELECT id FROM course_access
             WHERE user_id = $1 AND course_id = $2 AND is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
            [userId, course_id]
        );

        if (existingAccess.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "You already have access to this course",
            });
        }

        // Check if user is admin (admins bypass KYC requirements)
        const userCheck = await query(
            `SELECT role FROM users WHERE id = $1`,
            [userId]
        );

        const userRole = userCheck.rows[0]?.role;

        // Only check KYC for non-admin users
        if (userRole !== 'admin') {
            // Check if user has completed KYC verification
            const kycCheck = await query(
                `SELECT id, status FROM kyc_verifications WHERE user_id = $1`,
                [userId]
            );

            if (kycCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message:
                        "KYC verification is required before requesting course access. Please complete your KYC first.",
                    requires_kyc: true,
                });
            }

            const kyc = kycCheck.rows[0];
            if (kyc.status !== "verified") {
                return res.status(403).json({
                    success: false,
                    message: `Your KYC verification is ${kyc.status}. Please complete and verify your KYC before requesting course access.`,
                    requires_kyc: true,
                    kyc_status: kyc.status,
                });
            }
        }

        // Create request
        const result = await query(
            `INSERT INTO course_requests (user_id, course_id, request_message, status)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id, course_id, status, request_message, created_at`,
            [userId, course_id, request_message || null, REQUEST_STATUS.PENDING]
        );

        res.status(201).json({
            success: true,
            message: "Course access request created successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user's course requests
 */
const getUserRequests = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT 
                cr.id,
                cr.status,
                cr.request_message,
                cr.admin_notes,
                cr.reviewed_at,
                cr.created_at,
                c.id as course_id,
                c.name as course_name,
                c.slug as course_slug,
                c.price as course_price,
                c.cover_image as course_cover_image
             FROM course_requests cr
             JOIN courses c ON cr.course_id = c.id
             WHERE cr.user_id = $1
             ORDER BY cr.created_at DESC`,
            [userId]
        );

        // Normalize image URLs before returning
        const requests = result.rows.map((request) => ({
            ...request,
            course_cover_image: normalizeImageUrl(request.course_cover_image),
        }));

        res.json({
            success: true,
            data: requests,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get specific request by ID
 */
const getRequestById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await query(
            `SELECT 
                cr.id,
                cr.status,
                cr.request_message,
                cr.admin_notes,
                cr.reviewed_at,
                cr.created_at,
                c.id as course_id,
                c.name as course_name,
                c.slug as course_slug,
                c.price as course_price,
                c.cover_image as course_cover_image,
                ca.access_start,
                ca.access_end
             FROM course_requests cr
             JOIN courses c ON cr.course_id = c.id
             LEFT JOIN course_access ca ON ca.request_id = cr.id
             WHERE cr.id = $1 AND cr.user_id = $2`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Request not found",
            });
        }

        // Normalize image URL before returning
        const request = {
            ...result.rows[0],
            course_cover_image: normalizeImageUrl(
                result.rows[0].course_cover_image
            ),
        };

        res.json({
            success: true,
            data: request,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all requests (Admin only)
 */
const getAllRequests = async (req, res, next) => {
    try {
        const { status } = req.query;

        let queryText = `
            SELECT 
                cr.id,
                cr.status,
                cr.request_message,
                cr.admin_notes,
                cr.reviewed_at,
                cr.created_at,
                c.id as course_id,
                c.name as course_name,
                c.slug as course_slug,
                u.id as user_id,
                u.email as user_email,
                u.first_name as user_first_name,
                u.last_name as user_last_name,
                ca.access_start,
                ca.access_end
             FROM course_requests cr
             JOIN courses c ON cr.course_id = c.id
             JOIN users u ON cr.user_id = u.id
             LEFT JOIN course_access ca ON ca.request_id = cr.id
        `;

        const params = [];

        if (status) {
            queryText += ` WHERE cr.status = $1`;
            params.push(status);
        }

        queryText += ` ORDER BY cr.created_at DESC`;

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Approve course request (Admin only)
 */
const approveRequest = async (req, res, next) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");

        const { id } = req.params;
        const { access_start, access_end } = req.body;
        const adminId = req.user.id;

        // Get request details
        const requestResult = await client.query(
            `SELECT 
                cr.id,
                cr.user_id,
                cr.course_id,
                cr.status,
                u.email,
                u.first_name,
                u.last_name,
                c.name as course_name
             FROM course_requests cr
             JOIN users u ON cr.user_id = u.id
             JOIN courses c ON cr.course_id = c.id
             WHERE cr.id = $1`,
            [id]
        );

        if (requestResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Request not found",
            });
        }

        const request = requestResult.rows[0];

        if (request.status !== REQUEST_STATUS.PENDING) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "Request has already been processed",
            });
        }

        // Update request status
        await client.query(
            `UPDATE course_requests
             SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [REQUEST_STATUS.APPROVED, adminId, id]
        );

        // Create course access
        const accessResult = await client.query(
            `INSERT INTO course_access (user_id, course_id, request_id, access_start, access_end, granted_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, access_start, access_end`,
            [
                request.user_id,
                request.course_id,
                id,
                access_start,
                access_end,
                adminId,
            ]
        );

        // Auto-unlock first video for the user
        const firstVideoResult = await client.query(
            `SELECT id FROM videos
             WHERE course_id = $1 AND order_index = 0 AND is_active = true
             LIMIT 1`,
            [request.course_id]
        );

        if (firstVideoResult.rows.length > 0) {
            const firstVideoId = firstVideoResult.rows[0].id;

            // Check if progress already exists
            const progressCheck = await client.query(
                `SELECT id FROM video_progress
                 WHERE user_id = $1 AND video_id = $2`,
                [request.user_id, firstVideoId]
            );

            if (progressCheck.rows.length === 0) {
                await client.query(
                    `INSERT INTO video_progress (user_id, video_id, course_id, is_unlocked, unlocked_at)
                     VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)`,
                    [request.user_id, firstVideoId, request.course_id]
                );
            } else {
                await client.query(
                    `UPDATE video_progress
                     SET is_unlocked = true, unlocked_at = CURRENT_TIMESTAMP
                     WHERE user_id = $1 AND video_id = $2`,
                    [request.user_id, firstVideoId]
                );
            }
        }

        await client.query("COMMIT");

        // Send approval email (async, don't wait)
        sendCourseAccessApprovedEmail(
            request.email,
            `${request.first_name} ${request.last_name}`,
            request.course_name,
            access_start,
            access_end
        ).catch((err) => console.error("Failed to send approval email:", err));

        // Create push notification (async, don't wait)
        createNotification(
            request.user_id,
            "course_access_granted",
            "Course Access Granted! 🎉",
            `Your request for "${request.course_name}" has been approved. You now have access to all course content.`,
            {
                course_id: request.course_id,
                course_name: request.course_name,
                access_start: access_start,
                access_end: access_end,
            }
        )
            .then((notif) => {
                if (notif) {
                    console.log(
                        `✅ Notification created for user ${request.user_id}: Course access granted for ${request.course_name}`
                    );
                } else {
                    console.warn(
                        `⚠️ Failed to create notification for user ${request.user_id}`
                    );
                }
            })
            .catch((err) =>
                console.error("Failed to create notification:", err)
            );

        res.json({
            success: true,
            message: "Request approved successfully",
            data: {
                request_id: id,
                access: accessResult.rows[0],
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");
        next(error);
    } finally {
        client.release();
    }
};

/**
 * Reject course request (Admin only)
 */
const rejectRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { admin_notes } = req.body;
        const adminId = req.user.id;

        // Get request details
        const requestResult = await query(
            `SELECT 
                cr.id,
                cr.user_id,
                cr.course_id,
                cr.status,
                u.email,
                u.first_name,
                u.last_name,
                c.name as course_name
             FROM course_requests cr
             JOIN users u ON cr.user_id = u.id
             JOIN courses c ON cr.course_id = c.id
             WHERE cr.id = $1`,
            [id]
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Request not found",
            });
        }

        const request = requestResult.rows[0];

        if (request.status !== REQUEST_STATUS.PENDING) {
            return res.status(400).json({
                success: false,
                message: "Request has already been processed",
            });
        }

        // Update request status
        await query(
            `UPDATE course_requests
             SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, admin_notes = $3
             WHERE id = $4`,
            [REQUEST_STATUS.REJECTED, adminId, admin_notes || null, id]
        );

        // Send rejection email (async, don't wait)
        sendCourseAccessRejectedEmail(
            request.email,
            `${request.first_name} ${request.last_name}`,
            request.course_name,
            admin_notes || ""
        ).catch((err) => console.error("Failed to send rejection email:", err));

        // Create push notification (async, don't wait)
        createNotification(
            request.user_id,
            "course_request_rejected",
            "Course Request Update",
            `Your request for "${request.course_name}" has been reviewed. Please check your email for details.`,
            {
                course_id: request.course_id,
                course_name: request.course_name,
                admin_notes: admin_notes || null,
            }
        ).catch((err) => console.error("Failed to create notification:", err));

        res.json({
            success: true,
            message: "Request rejected successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createRequest,
    getUserRequests,
    getRequestById,
    getAllRequests,
    approveRequest,
    rejectRequest,
};
