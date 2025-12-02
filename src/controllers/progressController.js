const { query, getClient } = require("../config/database");

/**
 * Mark video as watched
 */
const markVideoWatched = async (req, res, next) => {
    try {
        const { videoId } = req.params;
        const userId = req.user.id;

        // Get video details
        const videoResult = await query(
            `SELECT v.id, v.course_id, v.order_index, c.name as course_name
             FROM videos v
             JOIN courses c ON v.course_id = c.id
             WHERE v.id = $1 AND v.is_active = true`,
            [videoId]
        );

        if (videoResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video not found",
            });
        }

        const video = videoResult.rows[0];

        // Check if user has access to this course
        const accessCheck = await query(
            `SELECT * FROM course_access
             WHERE user_id = $1 AND course_id = $2 AND is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
            [userId, video.course_id]
        );

        // First video is always accessible, others require access
        const isFirstVideo = video.order_index === 0;
        if (!isFirstVideo && accessCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this course",
            });
        }

        // Check if progress exists
        const progressCheck = await query(
            `SELECT id, is_watched FROM video_progress
             WHERE user_id = $1 AND video_id = $2`,
            [userId, videoId]
        );

        if (progressCheck.rows.length > 0) {
            // Update existing progress
            if (!progressCheck.rows[0].is_watched) {
                await query(
                    `UPDATE video_progress
                     SET is_watched = true, watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = $1 AND video_id = $2`,
                    [userId, videoId]
                );
            }
        } else {
            // Create new progress record
            await query(
                `INSERT INTO video_progress (user_id, video_id, course_id, is_watched, watched_at)
                 VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)`,
                [userId, videoId, video.course_id]
            );
        }

        res.json({
            success: true,
            message: "Video marked as watched",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Unlock next video (after watching current video and clicking next)
 */
const unlockNextVideo = async (req, res, next) => {
    const client = await getClient();
    try {
        await client.query("BEGIN");

        const { videoId } = req.params;
        const userId = req.user.id;

        // Get current video details
        const videoResult = await client.query(
            `SELECT v.id, v.course_id, v.order_index, c.name as course_name
             FROM videos v
             JOIN courses c ON v.course_id = c.id
             WHERE v.id = $1 AND v.is_active = true`,
            [videoId]
        );

        if (videoResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Video not found",
            });
        }

        const currentVideo = videoResult.rows[0];

        // Check if user has access to this course
        const accessCheck = await client.query(
            `SELECT * FROM course_access
             WHERE user_id = $1 AND course_id = $2 AND is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
            [userId, currentVideo.course_id]
        );

        if (accessCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "You don't have access to this course",
            });
        }

        // Check if current video is watched
        const currentProgress = await client.query(
            `SELECT is_watched FROM video_progress
             WHERE user_id = $1 AND video_id = $2`,
            [userId, videoId]
        );

        if (
            currentProgress.rows.length === 0 ||
            !currentProgress.rows[0].is_watched
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message:
                    "You must watch the current video before unlocking the next one",
            });
        }

        // Get next video
        const nextVideoResult = await client.query(
            `SELECT id FROM videos
             WHERE course_id = $1 AND order_index = $2 AND is_active = true
             LIMIT 1`,
            [currentVideo.course_id, currentVideo.order_index + 1]
        );

        if (nextVideoResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "No next video found",
            });
        }

        const nextVideoId = nextVideoResult.rows[0].id;

        // Check if next video progress exists
        const nextProgressCheck = await client.query(
            `SELECT id, is_unlocked FROM video_progress
             WHERE user_id = $1 AND video_id = $2`,
            [userId, nextVideoId]
        );

        if (nextProgressCheck.rows.length > 0) {
            // Update existing progress
            if (!nextProgressCheck.rows[0].is_unlocked) {
                await client.query(
                    `UPDATE video_progress
                     SET is_unlocked = true, unlocked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = $1 AND video_id = $2`,
                    [userId, nextVideoId]
                );
            }
        } else {
            // Create new progress record with unlocked status
            await client.query(
                `INSERT INTO video_progress (user_id, video_id, course_id, is_unlocked, unlocked_at)
                 VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)`,
                [userId, nextVideoId, currentVideo.course_id]
            );
        }

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Next video unlocked successfully",
            data: {
                next_video_id: nextVideoId,
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
 * Get course progress
 */
const getCourseProgress = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const userId = req.user.id;

        // Check if user has access
        const accessCheck = await query(
            `SELECT * FROM course_access
             WHERE user_id = $1 AND course_id = $2 AND is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
            [userId, courseId]
        );

        // Get all videos
        const videosResult = await query(
            `SELECT id, title, order_index
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

        // Build progress data
        const videos = videosResult.rows.map((video) => {
            const progress = progressMap[video.id];
            const isFirstVideo = video.order_index === 0;
            const hasAccess = accessCheck.rows.length > 0;

            // First video is always unlocked if user has access
            const isUnlocked =
                isFirstVideo || (hasAccess && progress?.is_unlocked);

            return {
                video_id: video.id,
                title: video.title,
                order_index: video.order_index,
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
                has_access: accessCheck.rows.length > 0,
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

module.exports = {
    markVideoWatched,
    unlockNextVideo,
    getCourseProgress,
};
