const { query } = require("../config/database");
const { REQUEST_STATUS } = require("../utils/constants");
const { normalizeImageUrl } = require("../utils/helpers");
const { createNotification } = require("./notificationController");

/**
 * Get admin dashboard statistics
 */
const getDashboard = async (req, res, next) => {
    try {
        // Get total users
        const usersResult = await query(
            "SELECT COUNT(*) as total FROM users WHERE role = 'user'"
        );
        const totalUsers = parseInt(usersResult.rows[0].total);

        // Get total courses
        const coursesResult = await query(
            "SELECT COUNT(*) as total FROM courses WHERE is_active = true"
        );
        const totalCourses = parseInt(coursesResult.rows[0].total);

        // Get total videos
        const videosResult = await query(
            "SELECT COUNT(*) as total FROM videos WHERE is_active = true"
        );
        const totalVideos = parseInt(videosResult.rows[0].total);

        // Get pending requests
        const pendingRequestsResult = await query(
            `SELECT COUNT(*) as total FROM course_requests WHERE status = $1`,
            [REQUEST_STATUS.PENDING]
        );
        const pendingRequests = parseInt(pendingRequestsResult.rows[0].total);

        // Get approved requests (total)
        const approvedRequestsResult = await query(
            `SELECT COUNT(*) as total FROM course_requests WHERE status = $1`,
            [REQUEST_STATUS.APPROVED]
        );
        const approvedRequests = parseInt(approvedRequestsResult.rows[0].total);

        // Get rejected requests (total)
        const rejectedRequestsResult = await query(
            `SELECT COUNT(*) as total FROM course_requests WHERE status = $1`,
            [REQUEST_STATUS.REJECTED]
        );
        const rejectedRequests = parseInt(rejectedRequestsResult.rows[0].total);

        // Get total requests (all statuses)
        const totalRequestsResult = await query(
            `SELECT COUNT(*) as total FROM course_requests`
        );
        const totalRequests = parseInt(totalRequestsResult.rows[0].total);

        // Get active course accesses
        const activeAccessResult = await query(
            `SELECT COUNT(*) as total FROM course_access
             WHERE is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`
        );
        const activeAccess = parseInt(activeAccessResult.rows[0].total);

        // ─── Orders & Revenue ────────────────────────────────────────────────
        const ordersStatsResult = await query(
            `SELECT
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE status = 'pending')   as pending_orders,
                COUNT(*) FILTER (WHERE status = 'paid')      as paid_orders,
                COUNT(*) FILTER (WHERE status = 'shipped' OR status = 'dispatched') as shipped_orders,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
                COUNT(*) FILTER (WHERE status = 'refunded')  as refunded_orders,
                COALESCE(SUM(total) FILTER (WHERE status IN ('paid', 'shipped', 'dispatched')), 0) as total_revenue,
                COALESCE(SUM(total) FILTER (WHERE status IN ('paid', 'shipped', 'dispatched')
                    AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)), 0) as monthly_revenue
             FROM orders`
        );
        const ordersStats = ordersStatsResult.rows[0];

        // ─── Products ────────────────────────────────────────────────────────
        const productsStatsResult = await query(
            `SELECT
                COUNT(*) as total_products,
                COUNT(*) FILTER (WHERE product_type = 'physical') as physical_products,
                COUNT(*) FILTER (WHERE product_type = 'digital')  as digital_products,
                COUNT(*) FILTER (WHERE product_type = 'physical' AND stock_quantity IS NOT NULL AND stock_quantity < 5) as low_stock_products
             FROM products
             WHERE is_active = true`
        );
        const productsStats = productsStatsResult.rows[0];

        // ─── Course KYC ──────────────────────────────────────────────────────
        const kycStatsResult = await query(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'pending')  as kyc_pending,
                COUNT(*) FILTER (WHERE status = 'verified') as kyc_verified,
                COUNT(*) FILTER (WHERE status = 'rejected') as kyc_rejected
             FROM kyc_verifications`
        );
        const kycStats = kycStatsResult.rows[0];

        // ─── Product KYC ─────────────────────────────────────────────────────
        let productKycPending = 0;
        try {
            const productKycResult = await query(
                `SELECT COUNT(*) as total FROM product_kyc_verifications WHERE status = 'pending'`
            );
            productKycPending = parseInt(productKycResult.rows[0].total);
        } catch (e) {
            // table may not exist in all environments
        }

        // ─── Blogs ───────────────────────────────────────────────────────────
        const blogStatsResult = await query(
            `SELECT
                COUNT(*) as total_blogs,
                COUNT(*) FILTER (WHERE is_published = true) as published_blogs
             FROM blog_posts`
        );
        const blogStats = blogStatsResult.rows[0];

        // ─── Recent Orders (last 5) ──────────────────────────────────────────
        const recentOrdersResult = await query(
            `SELECT
                o.id,
                o.status,
                o.total,
                o.created_at,
                u.first_name,
                u.last_name,
                u.email as user_email
             FROM orders o
             JOIN users u ON u.id = o.user_id
             ORDER BY o.created_at DESC
             LIMIT 5`
        );

        // ─── Recent Users (last 5) ───────────────────────────────────────────
        const recentUsersResult = await query(
            `SELECT id, email, first_name, last_name, created_at, role
             FROM users
             ORDER BY created_at DESC
             LIMIT 5`
        );

        // Get admin user performance (current admin's activity)
        const adminId = req.user.id;
        const adminPerformanceResult = await query(
            `SELECT 
                COUNT(DISTINCT vp.course_id) as courses_accessed,
                COUNT(DISTINCT vp.video_id) FILTER (WHERE vp.is_watched = true) as videos_watched,
                COUNT(DISTINCT v.id) as total_available_videos
             FROM course_access ca
             JOIN videos v ON v.course_id = ca.course_id AND v.is_active = true
             LEFT JOIN video_progress vp ON vp.user_id = ca.user_id AND vp.video_id = v.id
             WHERE ca.user_id = $1
             AND ca.is_active = true
             AND CURRENT_TIMESTAMP BETWEEN ca.access_start AND ca.access_end`,
            [adminId]
        );

        // Get currently watching video for admin
        const adminCurrentVideoResult = await query(
            `SELECT 
                v.id,
                v.title,
                v.video_url,
                v.order_index,
                vp.watched_at,
                vp.last_position,
                c.id as course_id,
                c.name as course_name,
                c.slug as course_slug
             FROM video_progress vp
             JOIN videos v ON v.id = vp.video_id
             JOIN courses c ON c.id = v.course_id
             WHERE vp.user_id = $1
             AND vp.is_watched = true
             ORDER BY vp.watched_at DESC
             LIMIT 1`,
            [adminId]
        );

        // Get latest videos across all courses
        const latestVideosResult = await query(
            `SELECT 
                v.id,
                v.title,
                v.video_url,
                v.order_index,
                v.created_at,
                c.id as course_id,
                c.name as course_name,
                c.slug as course_slug,
                c.cover_image
             FROM videos v
             JOIN courses c ON c.id = v.course_id
             WHERE v.is_active = true
             ORDER BY v.created_at DESC
             LIMIT 10`
        );

        // ─── Recent Requests (for notifications) ─────────────────────────────
        const recentRequestsResult = await query(
            `SELECT 
                cr.id,
                cr.status,
                cr.created_at,
                c.name as course_name,
                u.email as user_email,
                u.first_name,
                u.last_name
             FROM course_requests cr
             JOIN courses c ON cr.course_id = c.id
             JOIN users u ON cr.user_id = u.id
             ORDER BY cr.created_at DESC
             LIMIT 10`
        );

        // Get expiring access (within 7 days)
        const expiringAccessResult = await query(
            `SELECT 
                ca.id,
                ca.access_end,
                c.name as course_name,
                u.email as user_email,
                u.first_name,
                u.last_name
             FROM course_access ca
             JOIN courses c ON c.id = ca.course_id
             JOIN users u ON u.id = ca.user_id
             WHERE ca.is_active = true
             AND ca.access_end BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '7 days'
             ORDER BY ca.access_end ASC
             LIMIT 10`
        );

        const adminPerf = adminPerformanceResult.rows[0];
        const adminCompletionPercentage =
            adminPerf.total_available_videos > 0
                ? Math.round(
                    (parseInt(adminPerf.videos_watched) /
                        parseInt(adminPerf.total_available_videos)) *
                    100
                )
                : 0;

        // Build notifications
        const notifications = [
            ...recentRequestsResult.rows
                .filter((r) => r.status === "pending")
                .map((r) => ({
                    type: "pending_request",
                    message: `New course request from ${r.first_name} ${r.last_name} for "${r.course_name}"`,
                    created_at: r.created_at,
                    request_id: r.id,
                })),
            ...expiringAccessResult.rows.map((e) => ({
                type: "expiring_access",
                message: `Access to "${e.course_name}" for ${e.first_name} ${e.last_name} expires soon`,
                expires_at: e.access_end,
                access_id: e.id,
            })),
        ].sort(
            (a, b) =>
                new Date(b.created_at || b.expires_at) -
                new Date(a.created_at || a.expires_at)
        );

        res.json({
            success: true,
            data: {
                // ── Core counts (existing flat structure kept for backward compat) ──
                total_users: totalUsers,
                total_courses: totalCourses,
                total_requests: totalRequests,
                pending_requests: pendingRequests,
                approved_requests: approvedRequests,
                rejected_requests: rejectedRequests,
                total_videos: totalVideos,
                active_access: activeAccess,

                // ── Orders & Revenue ──────────────────────────────────────────
                total_orders: parseInt(ordersStats.total_orders) || 0,
                pending_orders: parseInt(ordersStats.pending_orders) || 0,
                paid_orders: parseInt(ordersStats.paid_orders) || 0,
                shipped_orders: parseInt(ordersStats.shipped_orders) || 0,
                cancelled_orders: parseInt(ordersStats.cancelled_orders) || 0,
                refunded_orders: parseInt(ordersStats.refunded_orders) || 0,
                total_revenue: parseFloat(ordersStats.total_revenue) || 0,
                monthly_revenue: parseFloat(ordersStats.monthly_revenue) || 0,

                // ── Products ──────────────────────────────────────────────────
                total_products: parseInt(productsStats.total_products) || 0,
                physical_products: parseInt(productsStats.physical_products) || 0,
                digital_products: parseInt(productsStats.digital_products) || 0,
                low_stock_products: parseInt(productsStats.low_stock_products) || 0,

                // ── KYC ───────────────────────────────────────────────────────
                kyc_pending: parseInt(kycStats.kyc_pending) || 0,
                kyc_verified: parseInt(kycStats.kyc_verified) || 0,
                kyc_rejected: parseInt(kycStats.kyc_rejected) || 0,
                product_kyc_pending: productKycPending,

                // ── Blogs ─────────────────────────────────────────────────────
                total_blogs: parseInt(blogStats.total_blogs) || 0,
                published_blogs: parseInt(blogStats.published_blogs) || 0,

                // ── Recent Activity ───────────────────────────────────────────
                recent_orders: recentOrdersResult.rows,
                recent_users: recentUsersResult.rows,

                // ── Kept for backward compat ──────────────────────────────────
                business_overview: {
                    statistics: {
                        total_users: totalUsers,
                        total_courses: totalCourses,
                        total_videos: totalVideos,
                        pending_requests: pendingRequests,
                        approved_requests: approvedRequests,
                        active_access: activeAccess,
                    },
                    recent_requests: recentRequestsResult.rows,
                },
                admin_performance: {
                    courses_accessed: parseInt(adminPerf.courses_accessed) || 0,
                    videos_watched: parseInt(adminPerf.videos_watched) || 0,
                    total_available_videos:
                        parseInt(adminPerf.total_available_videos) || 0,
                    completion_percentage: adminCompletionPercentage,
                },
                current_video: adminCurrentVideoResult.rows[0] || null,
                latest_videos: latestVideosResult.rows.map((video) => ({
                    ...video,
                    cover_image: normalizeImageUrl(video.cover_image),
                })),
                notifications: notifications.slice(0, 10),
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all users (Admin only)
 */
const getAllUsers = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, role, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let queryText = `
            SELECT 
                u.id,
                u.email,
                u.first_name,
                u.last_name,
                u.role,
                u.user_type,
                u.email_verified,
                u.is_active,
                u.last_login_at,
                u.last_login_ip,
                u.last_login_device,
                u.created_at,
                u.course_terms_accepted_at,
                u.product_terms_accepted_at,
                -- Course KYC (kyc_verifications)
                ck.status                  AS course_kyc_status,
                ck.upgraded_to_business    AS course_kyc_is_business,
                ck.business_upgraded_at    AS course_kyc_business_upgraded_at,
                -- Product KYC (product_kyc_verifications)
                pk.status                  AS product_kyc_status
             FROM users u
             LEFT JOIN kyc_verifications ck         ON ck.user_id = u.id
             LEFT JOIN product_kyc_verifications pk  ON pk.user_id = u.id
             WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (role) {
            queryText += ` AND u.role = $${paramCount++}`;
            params.push(role);
        }

        if (search) {
            queryText += ` AND (
                u.email ILIKE $${paramCount} OR
                u.first_name ILIKE $${paramCount} OR
                u.last_name ILIKE $${paramCount}
            )`;
            params.push(`%${search}%`);
            paramCount++;
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
        queryText += ` ORDER BY u.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(parseInt(limit), offset);

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: {
                users: result.rows,
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
 * Get all course requests (Admin only)
 */
const getAllRequests = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

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
             WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (status) {
            queryText += ` AND cr.status = $${paramCount++}`;
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
        queryText += ` ORDER BY cr.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(parseInt(limit), offset);

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: {
                requests: result.rows,
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
 * Create a new user (Admin only)
 */
const createUser = async (req, res, next) => {
    try {
        const {
            email,
            password,
            first_name,
            last_name,
            role = "user",
        } = req.body;

        // Validation
        if (!email || !password || !first_name || !last_name) {
            return res.status(400).json({
                success: false,
                message:
                    "Email, password, first name, and last name are required",
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters",
            });
        }

        // Check if user already exists
        const existingUser = await query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists",
            });
        }

        // Hash password
        const bcrypt = require("bcryptjs");
        const password_hash = await bcrypt.hash(password, 12);

        // Create user
        const result = await query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, email, first_name, last_name, role, created_at`,
            [email, password_hash, first_name, last_name, role, true]
        );

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: "User created successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update user (Admin only)
 */
const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { email, first_name, last_name, role, is_active, password } =
            req.body;

        // Check if user exists
        const existingUser = await query(
            "SELECT id, email FROM users WHERE id = $1",
            [id]
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (email && email !== existingUser.rows[0].email) {
            // Check if new email already exists
            const emailCheck = await query(
                "SELECT id FROM users WHERE email = $1 AND id != $2",
                [email, id]
            );
            if (emailCheck.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Email already in use",
                });
            }
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }

        if (first_name !== undefined) {
            updates.push(`first_name = $${paramCount++}`);
            values.push(first_name);
        }

        if (last_name !== undefined) {
            updates.push(`last_name = $${paramCount++}`);
            values.push(last_name);
        }

        if (role !== undefined) {
            updates.push(`role = $${paramCount++}`);
            values.push(role);
        }

        if (is_active !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(is_active);
        }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be at least 6 characters",
                });
            }
            const bcrypt = require("bcryptjs");
            const password_hash = await bcrypt.hash(password, 12);
            updates.push(`password_hash = $${paramCount++}`);
            values.push(password_hash);
        }

        if (updates.length === 0) {
            // Get existing user and return
            const result = await query(
                "SELECT id, email, first_name, last_name, role, is_active, created_at FROM users WHERE id = $1",
                [id]
            );
            return res.json({
                success: true,
                data: result.rows[0],
            });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await query(
            `UPDATE users 
             SET ${updates.join(", ")}
             WHERE id = $${paramCount}
             RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at`,
            values
        );

        res.json({
            success: true,
            data: result.rows[0],
            message: "User updated successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete user (Admin only)
 */
const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if user exists
        const existingUser = await query(
            "SELECT id, role FROM users WHERE id = $1",
            [id]
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Prevent deleting yourself
        if (existingUser.rows[0].id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: "You cannot delete your own account",
            });
        }

        // Delete user (cascade will handle related records)
        await query("DELETE FROM users WHERE id = $1", [id]);

        res.json({
            success: true,
            message: "User deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user login details with active sessions (Admin only)
 */
const getUserLoginDetails = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Get user with last login info
        const userResult = await query(
            `SELECT 
                id,
                email,
                first_name,
                last_name,
                role,
                last_login_at,
                last_login_ip,
                last_login_device,
                created_at
             FROM users 
             WHERE id = $1`,
            [id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const user = userResult.rows[0];

        // Get all sessions (active and inactive)
        const sessionsResult = await query(
            `SELECT 
                id,
                session_token,
                device_info,
                ip_address,
                user_agent,
                is_active,
                last_activity,
                created_at,
                expires_at
             FROM user_sessions 
             WHERE user_id = $1
             ORDER BY last_activity DESC
             LIMIT 50`,
            [id]
        );

        // Parse device info
        const sessions = sessionsResult.rows.map((session) => ({
            ...session,
            device_info:
                typeof session.device_info === "string"
                    ? JSON.parse(session.device_info)
                    : session.device_info,
        }));

        // Get active sessions count
        const activeSessionsCount = sessions.filter(
            (s) => s.is_active && new Date(s.expires_at) > new Date()
        ).length;

        res.json({
            success: true,
            data: {
                user: {
                    ...user,
                    last_login_device:
                        typeof user.last_login_device === "string"
                            ? JSON.parse(user.last_login_device)
                            : user.last_login_device,
                },
                sessions,
                active_sessions_count: activeSessionsCount,
                total_sessions_count: sessions.length,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create announcement (Admin only)
 */
const createAnnouncement = async (req, res, next) => {
    try {
        const {
            title,
            message,
            type = "info",
            target_audience = "all",
        } = req.body;
        const adminId = req.user.id;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: "Title and message are required",
            });
        }

        // Create announcement
        const result = await query(
            `INSERT INTO announcements (title, message, type, target_audience, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [title, message, type, target_audience, adminId]
        );

        const announcement = result.rows[0];

        // Send notifications to all users or specific audience
        let usersQuery = "SELECT id FROM users WHERE is_active = true";
        if (target_audience === "users") {
            usersQuery += " AND role = 'user'";
        } else if (target_audience === "admins") {
            usersQuery += " AND role = 'admin'";
        }

        const usersResult = await query(usersQuery);

        // Create notifications for all target users
        const notificationPromises = usersResult.rows.map((user) =>
            createNotification(user.id, "announcement", title, message, {
                announcement_id: announcement.id,
                type: type,
            }).catch((err) => {
                console.error(
                    `Failed to create notification for user ${user.id}:`,
                    err
                );
            })
        );

        await Promise.allSettled(notificationPromises);

        res.status(201).json({
            success: true,
            data: announcement,
            message: "Announcement created and sent to users",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all announcements (Admin only)
 */
const getAnnouncements = async (req, res, next) => {
    try {
        const { is_active } = req.query;

        let queryText = `
            SELECT 
                a.id,
                a.title,
                a.message,
                a.type,
                a.target_audience,
                a.is_active,
                a.created_at,
                a.updated_at,
                u.email as created_by_email,
                u.first_name as created_by_first_name,
                u.last_name as created_by_last_name
             FROM announcements a
             LEFT JOIN users u ON a.created_by = u.id
        `;

        const params = [];
        if (is_active !== undefined) {
            queryText += ` WHERE a.is_active = $1`;
            params.push(is_active === "true");
        }

        queryText += ` ORDER BY a.created_at DESC`;

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
 * Get all course purchases (Admin only)
 */
const getAllCoursePurchases = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let queryText = `
            SELECT 
                co.id as course_order_id,
                co.course_id,
                co.course_name,
                co.course_price,
                co.created_at,
                o.id as order_id,
                o.status as payment_status,
                u.id as user_id,
                u.email as user_email,
                u.first_name as user_first_name,
                u.last_name as user_last_name,
                ca.access_start,
                ca.access_end
            FROM course_orders co
            JOIN orders o ON co.order_id = o.id
            JOIN users u ON o.user_id = u.id
            JOIN courses c ON co.course_id = c.id
            LEFT JOIN course_access ca ON ca.user_id = u.id AND ca.course_id = co.course_id
            WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (search) {
            queryText += ` AND (
                u.email ILIKE $${paramCount} OR
                u.first_name ILIKE $${paramCount} OR
                u.last_name ILIKE $${paramCount} OR
                co.course_name ILIKE $${paramCount}
            )`;
            params.push(`%${search}%`);
            paramCount++;
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
        queryText += ` ORDER BY co.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(parseInt(limit), offset);

        const result = await query(queryText, params);

        res.json({
            success: true,
            data: {
                purchases: result.rows,
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

module.exports = {
    getDashboard,
    getAllUsers,
    getAllRequests,
    getAllCoursePurchases,
    createUser,
    updateUser,
    createAnnouncement,
    getAnnouncements,
    deleteUser,
    getUserLoginDetails,
};
