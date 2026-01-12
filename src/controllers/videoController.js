const { query } = require("../config/database");
const { formatVideoEmbedUrl, detectVideoPlatform, getPublicUrl } = require("../utils/helpers");
const { authenticate } = require("../middleware/auth");

/**
 * Get all videos for a course
 */
const getCourseVideos = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const userId = req.user?.id; // Optional, for authenticated users

        // Check if course exists
        const courseCheck = await query(
            "SELECT id, name FROM courses WHERE id = $1 AND is_active = true",
            [courseId]
        );

        if (courseCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Get all videos
        const videosResult = await query(
            `SELECT 
                id,
                title,
                video_url,
                description,
                order_index,
                pdfs,
                markdown,
                created_at
             FROM videos
             WHERE course_id = $1 AND is_active = true
             ORDER BY order_index`,
            [courseId]
        );

        // If user is authenticated, check access and progress
        let videos = videosResult.rows;

        if (userId) {
            // Check if user has access
            const accessCheck = await query(
                `SELECT * FROM course_access
                 WHERE user_id = $1 AND course_id = $2 AND is_active = true
                 AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
                [userId, courseId]
            );

            const hasAccess = accessCheck.rows.length > 0;

            // Get user progress
            const progressResult = await query(
                `SELECT video_id, is_watched, is_unlocked
                 FROM video_progress
                 WHERE user_id = $1 AND course_id = $2`,
                [userId, courseId]
            );

            const progressMap = {};
            progressResult.rows.forEach((row) => {
                progressMap[row.video_id] = row;
            });

            // Determine which videos are accessible
            videos = videos.map((video) => {
                const progress = progressMap[video.id];
                const isFirstVideo = video.order_index === 0;

                // First video is always unlocked if user has access OR if no access (free preview)
                const isUnlocked =
                    isFirstVideo || (hasAccess && progress?.is_unlocked);

                return {
                    ...video,
                    is_watched: progress?.is_watched || false,
                    is_unlocked: isUnlocked,
                    is_locked: !isUnlocked,
                };
            });
        } else {
            // For unauthenticated users, only first video is unlocked
            videos = videos.map((video) => ({
                ...video,
                is_watched: false,
                is_unlocked: video.order_index === 0,
                is_locked: video.order_index !== 0,
            }));
        }

        res.json({
            success: true,
            data: {
                course: courseCheck.rows[0],
                videos,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get video by ID
 */
const getVideoById = async (req, res, next) => {
    try {
        const { courseId, videoId } = req.params;
        const userId = req.user?.id;

        // Get video
        const videoResult = await query(
            `SELECT 
                v.id,
                v.title,
                v.video_url,
                v.description,
                v.order_index,
                v.pdfs,
                v.markdown,
                v.created_at,
                c.id as course_id,
                c.name as course_name
             FROM videos v
             JOIN courses c ON v.course_id = c.id
             WHERE v.id = $1 AND v.course_id = $2 AND v.is_active = true AND c.is_active = true`,
            [videoId, courseId]
        );

        if (videoResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video not found",
            });
        }

        const video = videoResult.rows[0];
        const isFirstVideo = video.order_index === 0;

        // Check access if user is authenticated
        let hasAccess = false;
        let isUnlocked = isFirstVideo; // First video is always unlocked for preview

        if (userId) {
            const accessCheck = await query(
                `SELECT * FROM course_access
                 WHERE user_id = $1 AND course_id = $2 AND is_active = true
                 AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
                [userId, courseId]
            );

            hasAccess = accessCheck.rows.length > 0;

            if (hasAccess) {
                // Check if video is unlocked
                const progressResult = await query(
                    `SELECT is_unlocked, is_watched FROM video_progress
                     WHERE user_id = $1 AND video_id = $2`,
                    [userId, videoId]
                );

                if (progressResult.rows.length > 0) {
                    isUnlocked = progressResult.rows[0].is_unlocked;
                } else if (isFirstVideo) {
                    // First video should be auto-unlocked when access is granted
                    isUnlocked = true;
                }
            }
        }

        res.json({
            success: true,
            data: {
                ...video,
                has_access: hasAccess,
                is_unlocked: isUnlocked,
                is_locked: !isUnlocked,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create video (Admin only)
 * Supports PDF file uploads via multipart/form-data
 */
const createVideo = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { title, video_url, description, order_index, markdown } =
            req.body;

        // Check if course exists
        const courseCheck = await query(
            "SELECT id FROM courses WHERE id = $1",
            [courseId]
        );

        if (courseCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Check if order_index already exists for this course
        const orderCheck = await query(
            "SELECT id FROM videos WHERE course_id = $1 AND order_index = $2",
            [courseId, order_index]
        );

        if (orderCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "Video with this order index already exists for this course",
            });
        }

        // Format video URL to embed format (supports YouTube and Vimeo)
        const formattedUrl = formatVideoEmbedUrl(video_url);
        const platform = detectVideoPlatform(video_url);
        
        console.log(`[VIDEO CREATE] Detected platform: ${platform}, Original URL: ${video_url}, Formatted: ${formattedUrl}`);

        // Process uploaded PDF files
        // Use public URL (frontend domain) for PDFs so they're accessible via public domain
        const publicUrl = getPublicUrl();
        // Ensure clean URL (remove commas, trailing slashes)
        const cleanPublicUrl = publicUrl ? publicUrl.split(',')[0].trim().replace(/\/+$/, '') : '';
        let pdfsArray = [];

        // Handle uploaded PDF files
        if (req.files && req.files.length > 0) {
            pdfsArray = req.files.map((file) => ({
                name: file.originalname,
                url: `${cleanPublicUrl}/uploads/pdfs/${file.filename}`,
            }));
        }

        // Handle PDFs from JSON body (if provided as URLs)
        // This allows mixing uploaded files with external URLs
        if (req.body.pdfs) {
            try {
                const bodyPdfs =
                    typeof req.body.pdfs === "string"
                        ? JSON.parse(req.body.pdfs)
                        : req.body.pdfs;
                if (Array.isArray(bodyPdfs)) {
                    // Merge with uploaded files
                    pdfsArray = [...pdfsArray, ...bodyPdfs];
                }
            } catch (e) {
                // Invalid JSON, ignore
            }
        }

        const result = await query(
            `INSERT INTO videos (course_id, title, video_url, description, order_index, pdfs, markdown)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, course_id, title, video_url, description, order_index, pdfs, markdown, created_at`,
            [
                courseId,
                title,
                formattedUrl,
                description || null,
                order_index,
                pdfsArray.length > 0 ? JSON.stringify(pdfsArray) : null,
                markdown || null,
            ]
        );

        res.status(201).json({
            success: true,
            message: "Video created successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update video (Admin only)
 * Supports PDF file uploads via multipart/form-data
 */
const updateVideo = async (req, res, next) => {
    try {
        const { courseId, videoId } = req.params;
        const {
            title,
            video_url,
            description,
            order_index,
            markdown,
            is_active,
        } = req.body;

        // Check if video exists
        const videoCheck = await query(
            "SELECT id FROM videos WHERE id = $1 AND course_id = $2",
            [videoId, courseId]
        );

        if (videoCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video not found",
            });
        }

        // Check if order_index is being changed and already exists
        if (order_index !== undefined) {
            const orderCheck = await query(
                "SELECT id FROM videos WHERE course_id = $1 AND order_index = $2 AND id != $3",
                [courseId, order_index, videoId]
            );

            if (orderCheck.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Video with this order index already exists for this course",
                });
            }
        }

        // Process uploaded PDF files
        // Use public URL (frontend domain) for PDFs so they're accessible via public domain
        const publicUrl = getPublicUrl();
        // Ensure clean URL (remove commas, trailing slashes)
        const cleanPublicUrl = publicUrl ? publicUrl.split(',')[0].trim().replace(/\/+$/, '') : '';
        let pdfsArray = null;

        // Handle uploaded PDF files
        if (req.files && req.files.length > 0) {
            pdfsArray = req.files.map((file) => ({
                name: file.originalname,
                url: `${cleanPublicUrl}/uploads/pdfs/${file.filename}`,
            }));
        }

        // Handle PDFs from JSON body (if provided as URLs)
        // This allows mixing uploaded files with external URLs
        if (req.body.pdfs) {
            try {
                const bodyPdfs =
                    typeof req.body.pdfs === "string"
                        ? JSON.parse(req.body.pdfs)
                        : req.body.pdfs;
                if (Array.isArray(bodyPdfs)) {
                    // If files were uploaded, merge with them; otherwise use body PDFs
                    pdfsArray = pdfsArray
                        ? [...pdfsArray, ...bodyPdfs]
                        : bodyPdfs;
                }
            } catch (e) {
                // Invalid JSON, ignore
            }
        }

        // Build update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (title) {
            updates.push(`title = $${paramCount++}`);
            values.push(title);
        }

        if (video_url) {
            const formattedUrl = formatVideoEmbedUrl(video_url);
            const platform = detectVideoPlatform(video_url);
            
            console.log(`[VIDEO UPDATE] Detected platform: ${platform}, Original URL: ${video_url}, Formatted: ${formattedUrl}`);
            
            updates.push(`video_url = $${paramCount++}`);
            values.push(formattedUrl);
        }

        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }

        if (order_index !== undefined) {
            updates.push(`order_index = $${paramCount++}`);
            values.push(order_index);
        }

        // Update PDFs if provided (either via files or body)
        if (pdfsArray !== null) {
            updates.push(`pdfs = $${paramCount++}`);
            values.push(
                pdfsArray.length > 0 ? JSON.stringify(pdfsArray) : null
            );
        }

        if (markdown !== undefined) {
            updates.push(`markdown = $${paramCount++}`);
            values.push(markdown);
        }

        if (is_active !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields to update",
            });
        }

        values.push(videoId);
        const updateQuery = `
            UPDATE videos 
            SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING id, course_id, title, video_url, description, order_index, pdfs, markdown, is_active, created_at
        `;

        const result = await query(updateQuery, values);

        res.json({
            success: true,
            message: "Video updated successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete video (Admin only)
 */
const deleteVideo = async (req, res, next) => {
    try {
        const { courseId, videoId } = req.params;

        // Check if video exists
        const videoCheck = await query(
            "SELECT id FROM videos WHERE id = $1 AND course_id = $2",
            [videoId, courseId]
        );

        if (videoCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video not found",
            });
        }

        // Soft delete
        await query(
            "UPDATE videos SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [videoId]
        );

        res.json({
            success: true,
            message: "Video deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCourseVideos,
    getVideoById,
    createVideo,
    updateVideo,
    deleteVideo,
};
