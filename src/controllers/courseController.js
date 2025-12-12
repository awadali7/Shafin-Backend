const { query } = require("../config/database");
const { generateSlug, normalizeImageUrl } = require("../utils/helpers");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

/**
 * Get all courses (public)
 */
const getAllCourses = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT 
                id,
                name,
                slug,
                description,
                price,
                cover_image,
                icon_name,
                created_at,
                (SELECT COUNT(*) FROM videos WHERE course_id = courses.id AND is_active = true) as video_count
             FROM courses
             WHERE is_active = true
             ORDER BY created_at DESC`
        );

        // Normalize image URLs before returning
        const courses = result.rows.map((course) => ({
            ...course,
            cover_image: normalizeImageUrl(course.cover_image),
        }));

        res.json({
            success: true,
            data: courses,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get course by slug
 */
const getCourseBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;

        const result = await query(
            `SELECT 
                id,
                name,
                slug,
                description,
                price,
                cover_image,
                icon_name,
                created_at,
                (SELECT COUNT(*) FROM videos WHERE course_id = courses.id AND is_active = true) as video_count
             FROM courses
             WHERE slug = $1 AND is_active = true`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Normalize image URL before returning
        const course = {
            ...result.rows[0],
            cover_image: normalizeImageUrl(result.rows[0].cover_image),
        };

        res.json({
            success: true,
            data: course,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create course (Admin only)
 */
const createCourse = async (req, res, next) => {
    try {
        const {
            name,
            slug,
            description,
            price,
            icon_name,
            cover_image: coverImageData,
        } = req.body;

        // Handle cover image - supports multiple formats:
        // 1. File upload via multipart/form-data (req.file)
        // 2. Base64 encoded image in JSON (req.body.cover_image as base64 string)
        // 3. URL string in JSON (req.body.cover_image as URL)
        let cover_image = null;

        if (req.file) {
            // Case 1: File uploaded via multipart/form-data
            const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
            cover_image = `${baseUrl}/uploads/images/${req.file.filename}`;
        } else if (coverImageData) {
            // Check if it's a base64 encoded image (starts with data:image/)
            if (coverImageData.startsWith("data:image/")) {
                // Case 2: Base64 encoded image in JSON
                try {
                    const imagesDir = path.join(
                        __dirname,
                        "../../uploads/images"
                    );
                    if (!fs.existsSync(imagesDir)) {
                        fs.mkdirSync(imagesDir, { recursive: true });
                    }

                    // Extract base64 data and mime type
                    const matches = coverImageData.match(
                        /^data:image\/(\w+);base64,(.+)$/
                    );
                    if (!matches) {
                        return res.status(400).json({
                            success: false,
                            message:
                                "Invalid base64 image format. Expected format: data:image/png;base64,...",
                        });
                    }

                    const mimeType = matches[1];
                    const base64Data = matches[2];

                    // Validate image type
                    const allowedTypes = [
                        "jpeg",
                        "jpg",
                        "png",
                        "gif",
                        "webp",
                        "svg+xml",
                    ];
                    if (!allowedTypes.includes(mimeType)) {
                        return res.status(400).json({
                            success: false,
                            message:
                                "Invalid image type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.",
                        });
                    }

                    // Generate unique filename
                    const extension =
                        mimeType === "svg+xml"
                            ? "svg"
                            : mimeType === "jpeg"
                            ? "jpg"
                            : mimeType;
                    const filename = `${uuidv4()}.${extension}`;
                    const filePath = path.join(imagesDir, filename);

                    // Decode and save base64 image
                    const imageBuffer = Buffer.from(base64Data, "base64");
                    fs.writeFileSync(filePath, imageBuffer);

                    // Generate URL
                    const baseUrl =
                        process.env.BACKEND_URL || "http://localhost:5001";
                    cover_image = `${baseUrl}/uploads/images/${filename}`;
                } catch (error) {
                    return res.status(400).json({
                        success: false,
                        message: `Failed to process base64 image: ${error.message}`,
                    });
                }
            } else if (
                coverImageData.startsWith("http://") ||
                coverImageData.startsWith("https://")
            ) {
                // Case 3: URL string provided
                cover_image = coverImageData;
            } else {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid cover_image format. Provide either a base64 encoded image (data:image/...;base64,...), a URL, or upload a file via multipart/form-data.",
                });
            }
        }

        // Check if slug already exists
        const slugCheck = await query(
            "SELECT id FROM courses WHERE slug = $1",
            [slug]
        );

        if (slugCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Course with this slug already exists",
            });
        }

        const result = await query(
            `INSERT INTO courses (name, slug, description, price, cover_image, icon_name, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, slug, description, price, cover_image, icon_name, created_at`,
            [
                name,
                slug,
                description || null,
                parseFloat(price) || 0,
                cover_image || null,
                icon_name || null,
                req.user.id,
            ]
        );

        res.status(201).json({
            success: true,
            message: "Course created successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update course (Admin only)
 */
const updateCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name,
            slug,
            description,
            price,
            cover_image,
            icon_name,
            is_active,
        } = req.body;

        // Check if course exists
        const courseCheck = await query(
            "SELECT id FROM courses WHERE id = $1",
            [id]
        );

        if (courseCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Check if slug is being changed and already exists
        if (slug) {
            const slugCheck = await query(
                "SELECT id FROM courses WHERE slug = $1 AND id != $2",
                [slug, id]
            );

            if (slugCheck.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Course with this slug already exists",
                });
            }
        }

        // Build update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }

        if (slug) {
            updates.push(`slug = $${paramCount++}`);
            values.push(slug);
        }

        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }

        if (price !== undefined) {
            updates.push(`price = $${paramCount++}`);
            values.push(price);
        }

        if (cover_image !== undefined) {
            updates.push(`cover_image = $${paramCount++}`);
            values.push(cover_image);
        }

        if (icon_name !== undefined) {
            updates.push(`icon_name = $${paramCount++}`);
            values.push(icon_name);
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

        values.push(id);
        const updateQuery = `
            UPDATE courses 
            SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING id, name, slug, description, price, cover_image, icon_name, is_active, created_at
        `;

        const result = await query(updateQuery, values);

        res.json({
            success: true,
            message: "Course updated successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete course (Admin only)
 */
const deleteCourse = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if course exists
        const courseCheck = await query(
            "SELECT id FROM courses WHERE id = $1",
            [id]
        );

        if (courseCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Soft delete (set is_active to false)
        await query(
            "UPDATE courses SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [id]
        );

        res.json({
            success: true,
            message: "Course deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllCourses,
    getCourseBySlug,
    createCourse,
    updateCourse,
    deleteCourse,
};
