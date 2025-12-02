const { query } = require("../config/database");
const { generateSlug } = require("../utils/helpers");

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

        res.json({
            success: true,
            data: result.rows,
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

        res.json({
            success: true,
            data: result.rows[0],
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
        const { name, slug, description, price, cover_image, icon_name } =
            req.body;

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
                price,
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
