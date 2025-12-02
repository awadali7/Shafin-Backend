const bcrypt = require("bcryptjs");
const { query } = require("../config/database");

/**
 * Get current user profile
 */
const getProfile = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT id, email, first_name, last_name, role, email_verified, created_at
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update user profile
 */
const updateProfile = async (req, res, next) => {
    try {
        const { first_name, last_name, email } = req.body;
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (first_name) {
            updates.push(`first_name = $${paramCount++}`);
            values.push(first_name);
        }

        if (last_name) {
            updates.push(`last_name = $${paramCount++}`);
            values.push(last_name);
        }

        if (email && email !== req.user.email) {
            // Check if email already exists
            const emailCheck = await query(
                "SELECT id FROM users WHERE email = $1 AND id != $2",
                [email, req.user.id]
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

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields to update",
            });
        }

        values.push(req.user.id);
        const updateQuery = `
            UPDATE users 
            SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING id, email, first_name, last_name, role, created_at
        `;

        const result = await query(updateQuery, values);

        res.json({
            success: true,
            message: "Profile updated successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user's enrolled courses
 */
const getUserCourses = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT 
                c.id,
                c.name,
                c.slug,
                c.description,
                c.price,
                c.cover_image,
                ca.access_start,
                ca.access_end,
                ca.is_active as access_active,
                CASE 
                    WHEN CURRENT_TIMESTAMP BETWEEN ca.access_start AND ca.access_end 
                    THEN true 
                    ELSE false 
                END as has_valid_access
             FROM course_access ca
             JOIN courses c ON ca.course_id = c.id
             WHERE ca.user_id = $1 AND ca.is_active = true
             ORDER BY ca.created_at DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get course progress for user
 */
const getCourseProgress = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const userId = req.user.id;

        // Check if user has access to this course
        const accessCheck = await query(
            `SELECT * FROM course_access
             WHERE user_id = $1 AND course_id = $2 AND is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
            [userId, courseId]
        );

        // Get course info
        const courseResult = await query(
            "SELECT id, name, slug FROM courses WHERE id = $1",
            [courseId]
        );

        if (courseResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Get all videos
        const videosResult = await query(
            `SELECT id, title, order_index, video_url
             FROM videos
             WHERE course_id = $1 AND is_active = true
             ORDER BY order_index`,
            [courseId]
        );

        // Get user progress
        const progressResult = await query(
            `SELECT video_id, is_watched, is_unlocked, watched_at, unlocked_at
             FROM video_progress
             WHERE user_id = $1 AND course_id = $2`,
            [userId, courseId]
        );

        // Create progress map
        const progressMap = {};
        progressResult.rows.forEach((row) => {
            progressMap[row.video_id] = row;
        });

        // Determine which videos are accessible
        const videos = videosResult.rows.map((video) => {
            const progress = progressMap[video.id];
            const isFirstVideo = video.order_index === 0;
            const hasAccess = accessCheck.rows.length > 0;

            // First video is always unlocked if user has access OR if no access (free preview)
            const isUnlocked =
                isFirstVideo || (hasAccess && progress?.is_unlocked);

            return {
                ...video,
                is_watched: progress?.is_watched || false,
                is_unlocked: isUnlocked,
                watched_at: progress?.watched_at || null,
                unlocked_at: progress?.unlocked_at || null,
            };
        });

        // Calculate statistics
        const totalVideos = videos.length;
        const watchedVideos = videos.filter((v) => v.is_watched).length;
        const unlockedVideos = videos.filter((v) => v.is_unlocked).length;

        res.json({
            success: true,
            data: {
                course: courseResult.rows[0],
                hasAccess: accessCheck.rows.length > 0,
                access: accessCheck.rows[0] || null,
                videos,
                progress: {
                    total: totalVideos,
                    watched: watchedVideos,
                    unlocked: unlockedVideos,
                    percentage:
                        totalVideos > 0
                            ? Math.round((watchedVideos / totalVideos) * 100)
                            : 0,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user dashboard data
 */
const getUserDashboard = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get user's enrolled courses with progress
        const coursesResult = await query(
            `SELECT 
                c.id,
                c.name,
                c.slug,
                c.description,
                c.cover_image,
                ca.access_start,
                ca.access_end,
                ca.is_active as access_active,
                CASE 
                    WHEN CURRENT_TIMESTAMP BETWEEN ca.access_start AND ca.access_end 
                    THEN true 
                    ELSE false 
                END as has_valid_access
             FROM course_access ca
             JOIN courses c ON ca.course_id = c.id
             WHERE ca.user_id = $1 AND ca.is_active = true
             ORDER BY ca.created_at DESC`,
            [userId]
        );

        // Get overall progress statistics
        const progressStatsResult = await query(
            `SELECT 
                COUNT(DISTINCT vp.course_id) as total_courses,
                COUNT(DISTINCT vp.video_id) FILTER (WHERE vp.is_watched = true) as watched_videos,
                COUNT(DISTINCT v.id) as total_videos
             FROM course_access ca
             JOIN videos v ON v.course_id = ca.course_id AND v.is_active = true
             LEFT JOIN video_progress vp ON vp.user_id = ca.user_id AND vp.video_id = v.id
             WHERE ca.user_id = $1 
             AND ca.is_active = true
             AND CURRENT_TIMESTAMP BETWEEN ca.access_start AND ca.access_end`,
            [userId]
        );

        // Get currently watching video (most recent watched but not completed)
        const currentVideoResult = await query(
            `SELECT 
                v.id,
                v.title,
                v.video_url,
                v.order_index,
                vp.watched_at,
                vp.last_position,
                vp.watch_duration,
                c.id as course_id,
                c.name as course_name,
                c.slug as course_slug
             FROM video_progress vp
             JOIN videos v ON v.id = vp.video_id
             JOIN courses c ON c.id = v.course_id
             WHERE vp.user_id = $1
             AND vp.is_watched = true
             AND EXISTS (
                 SELECT 1 FROM course_access ca
                 WHERE ca.user_id = $1
                 AND ca.course_id = c.id
                 AND ca.is_active = true
                 AND CURRENT_TIMESTAMP BETWEEN ca.access_start AND ca.access_end
             )
             ORDER BY vp.watched_at DESC
             LIMIT 1`,
            [userId]
        );

        // Get latest videos from user's courses
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
                c.cover_image,
                vp.is_watched,
                vp.watched_at
             FROM course_access ca
             JOIN courses c ON c.id = ca.course_id
             JOIN videos v ON v.course_id = c.id AND v.is_active = true
             LEFT JOIN video_progress vp ON vp.user_id = $1 AND vp.video_id = v.id
             WHERE ca.user_id = $1
             AND ca.is_active = true
             AND CURRENT_TIMESTAMP BETWEEN ca.access_start AND ca.access_end
             ORDER BY v.created_at DESC
             LIMIT 10`,
            [userId]
        );

        // Get pending course requests (notifications)
        const notificationsResult = await query(
            `SELECT 
                cr.id,
                cr.status,
                cr.created_at,
                cr.reviewed_at,
                c.name as course_name,
                c.slug as course_slug
             FROM course_requests cr
             JOIN courses c ON c.id = cr.course_id
             WHERE cr.user_id = $1
             ORDER BY cr.created_at DESC
             LIMIT 10`,
            [userId]
        );

        // Calculate course progress for each course
        const coursesWithProgress = await Promise.all(
            coursesResult.rows.map(async (course) => {
                const courseProgressResult = await query(
                    `SELECT 
                        COUNT(*) as total_videos,
                        COUNT(vp.video_id) FILTER (WHERE vp.is_watched = true) as watched_videos
                     FROM videos v
                     LEFT JOIN video_progress vp ON vp.user_id = $1 AND vp.video_id = v.id
                     WHERE v.course_id = $2 AND v.is_active = true`,
                    [userId, course.id]
                );

                const progress = courseProgressResult.rows[0];
                const percentage =
                    progress.total_videos > 0
                        ? Math.round(
                              (parseInt(progress.watched_videos) /
                                  parseInt(progress.total_videos)) *
                                  100
                          )
                        : 0;

                return {
                    ...course,
                    progress: {
                        total: parseInt(progress.total_videos),
                        watched: parseInt(progress.watched_videos),
                        percentage,
                    },
                };
            })
        );

        const stats = progressStatsResult.rows[0];
        const overallPercentage =
            stats.total_videos > 0
                ? Math.round(
                      (parseInt(stats.watched_videos) /
                          parseInt(stats.total_videos)) *
                          100
                  )
                : 0;

        res.json({
            success: true,
            data: {
                performance: {
                    total_courses: parseInt(stats.total_courses) || 0,
                    total_videos: parseInt(stats.total_videos) || 0,
                    watched_videos: parseInt(stats.watched_videos) || 0,
                    completion_percentage: overallPercentage,
                },
                courses: coursesWithProgress,
                current_video: currentVideoResult.rows[0] || null,
                latest_videos: latestVideosResult.rows,
                notifications: notificationsResult.rows.map((notif) => ({
                    id: notif.id,
                    type:
                        notif.status === "pending"
                            ? "request_pending"
                            : notif.status === "approved"
                            ? "request_approved"
                            : "request_rejected",
                    message: `Course request "${notif.course_name}" ${notif.status}`,
                    course_name: notif.course_name,
                    course_slug: notif.course_slug,
                    created_at: notif.created_at,
                    reviewed_at: notif.reviewed_at,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProfile,
    updateProfile,
    getUserCourses,
    getCourseProgress,
    getUserDashboard,
};
