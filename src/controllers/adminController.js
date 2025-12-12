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

        // Get approved requests (last 30 days)
        const approvedRequestsResult = await query(
            `SELECT COUNT(*) as total FROM course_requests
             WHERE status = $1 AND reviewed_at >= NOW() - INTERVAL '30 days'`,
            [REQUEST_STATUS.APPROVED]
        );
        const approvedRequests = parseInt(approvedRequestsResult.rows[0].total);

        // Get active course accesses
        const activeAccessResult = await query(
            `SELECT COUNT(*) as total FROM course_access
             WHERE is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`
        );
        const activeAccess = parseInt(activeAccessResult.rows[0].total);

        // Get recent requests (last 10)
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

        // Get performance notifications (pending requests, expiring access, etc.)
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
                business_overview: {
                    statistics: {
                        total_users: totalUsers,
                        total_courses: totalCourses,
                        total_videos: totalVideos,
                        pending_requests: pendingRequests,
                        approved_requests_30d: approvedRequests,
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
                id,
                email,
                first_name,
                last_name,
                role,
                email_verified,
                is_active,
                last_login_at,
                last_login_ip,
                last_login_device,
                created_at
             FROM users
             WHERE 1=1
        `;

        const params = [];
        let paramCount = 1;

        if (role) {
            queryText += ` AND role = $${paramCount++}`;
            params.push(role);
        }

        if (search) {
            queryText += ` AND (
                email ILIKE $${paramCount} OR
                first_name ILIKE $${paramCount} OR
                last_name ILIKE $${paramCount}
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
        queryText += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
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

module.exports = {
    getDashboard,
    getAllUsers,
    getAllRequests,
    createUser,
    updateUser,
    createAnnouncement,
    getAnnouncements,
    deleteUser,
    getUserLoginDetails,
};
