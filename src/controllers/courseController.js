const { query, getClient } = require("../config/database");
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
                is_featured,
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
 * Get featured courses (public)
 */
const getFeaturedCourses = async (req, res, next) => {
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
             WHERE is_active = true AND is_featured = true
             ORDER BY created_at DESC
             LIMIT 6`
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
            `SELECT id, name, slug, description, price, cover_image, icon_name, is_featured, created_at
             FROM courses
             WHERE slug = $1 AND is_active = true
             LIMIT 1`,
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
            is_featured,
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

                    const base64Data = coverImageData.replace(
                        /^data:image\/\w+;base64,/,
                        ""
                    );
                    const buffer = Buffer.from(base64Data, "base64");

                    // Detect image type from data URL
                    const imageType = coverImageData
                        .split(";")[0]
                        .split("/")[1];
                    const ext = imageType === "jpeg" ? "jpg" : imageType;
                    const filename = `${uuidv4()}.${ext}`;
                    const filepath = path.join(imagesDir, filename);

                    fs.writeFileSync(filepath, buffer);

                    const baseUrl =
                        process.env.BACKEND_URL || "http://localhost:5001";
                    cover_image = `${baseUrl}/uploads/images/${filename}`;
                } catch (err) {
                    console.error("Error saving base64 image:", err);
                    return res.status(400).json({
                        success: false,
                        message: "Invalid base64 image data",
                    });
                }
            } else {
                // Case 3: URL string in JSON - use as is
                cover_image = coverImageData;
            }
        }

        const finalSlug = slug || generateSlug(name);

        // Check if slug already exists
        const existingSlug = await query(
            "SELECT id FROM courses WHERE slug = $1",
            [finalSlug]
        );
        if (existingSlug.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Course with this slug already exists",
            });
        }

        const result = await query(
            `INSERT INTO courses (name, slug, description, price, cover_image, icon_name, is_featured, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, name, slug, description, price, cover_image, icon_name, is_featured, created_at`,
            [
                name,
                finalSlug,
                description || null,
                price || 0,
                cover_image,
                icon_name || null,
                is_featured || false,
                req.user.id,
            ]
        );

        // Normalize image URL before returning
        const course = {
            ...result.rows[0],
            cover_image: normalizeImageUrl(result.rows[0].cover_image),
        };

        res.status(201).json({
            success: true,
            message: "Course created successfully",
            data: course,
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
            icon_name,
            is_featured,
            cover_image,
        } = req.body;

        // Check if course exists
        const existingCourse = await query(
            "SELECT id FROM courses WHERE id = $1",
            [id]
        );
        if (existingCourse.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // If slug is being updated, check if it's unique
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

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (slug !== undefined) {
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
        if (icon_name !== undefined) {
            updates.push(`icon_name = $${paramCount++}`);
            values.push(icon_name);
        }
        if (is_featured !== undefined) {
            updates.push(`is_featured = $${paramCount++}`);
            values.push(is_featured);
        }
        if (cover_image !== undefined) {
            updates.push(`cover_image = $${paramCount++}`);
            values.push(cover_image);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields to update",
            });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await query(
            `UPDATE courses 
             SET ${updates.join(", ")}
             WHERE id = $${paramCount}
             RETURNING id, name, slug, description, price, cover_image, icon_name, created_at, updated_at`,
            values
        );

        // Normalize image URL before returning
        const course = {
            ...result.rows[0],
            cover_image: normalizeImageUrl(result.rows[0].cover_image),
        };

        res.json({
            success: true,
            message: "Course updated successfully",
            data: course,
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
        const existingCourse = await query(
            "SELECT id FROM courses WHERE id = $1",
            [id]
        );
        if (existingCourse.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        // Soft delete - set is_active to false
        await query(
            `UPDATE courses 
             SET is_active = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
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

/**
 * Purchase course - creates an order for course purchase
 * This is separate from shop/product orders
 * We store course_id in course_orders table to track which orders are for courses
 */
const purchaseCourse = async (req, res, next) => {
    const client = await getClient();
    try {
        const { id: courseId } = req.params;
        const userId = req.user.id;

        await client.query("BEGIN");

        // Check if course exists and is active
        const courseRes = await client.query(
            `SELECT id, name, price FROM courses WHERE id = $1 AND is_active = true`,
            [courseId]
        );

        if (courseRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Course not found or inactive",
            });
        }

        const course = courseRes.rows[0];
        const coursePrice = Number(course.price) || 0;

        // Check if user has completed KYC verification
        const kycCheck = await client.query(
            `SELECT id, status FROM kyc_verifications WHERE user_id = $1`,
            [userId]
        );

        if (
            kycCheck.rows.length === 0 ||
            kycCheck.rows[0].status !== "verified"
        ) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message:
                    "KYC verification is required before purchasing courses. Please complete your KYC first.",
                requires_kyc: true,
                kyc_status:
                    kycCheck.rows.length > 0
                        ? kycCheck.rows[0].status
                        : "not_completed",
            });
        }

        // Check if user has accepted terms and conditions
        const userCheck = await client.query(
            `SELECT terms_accepted_at FROM users WHERE id = $1`,
            [userId]
        );

        if (
            userCheck.rows.length === 0 ||
            !userCheck.rows[0].terms_accepted_at
        ) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message:
                    "Terms and conditions acceptance is required before purchasing courses.",
                requires_terms_acceptance: true,
            });
        }

        // Check if user already has access to this course
        const existingAccess = await client.query(
            `SELECT id FROM course_access 
             WHERE user_id = $1 AND course_id = $2 AND is_active = true
             AND (access_end IS NULL OR access_end > CURRENT_TIMESTAMP)`,
            [userId, courseId]
        );

        if (existingAccess.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "You already have access to this course",
            });
        }

        // Create order for course purchase
        const orderRes = await client.query(
            `INSERT INTO orders (
                user_id,
                status,
                subtotal,
                shipping_cost,
                total
             ) VALUES (
                $1, 'pending', $2, 0, $2
             )
             RETURNING id, status, total, created_at`,
            [userId, coursePrice]
        );

        const order = orderRes.rows[0];

        // Store course purchase info in course_orders table
        // This table links orders to courses (separate from product orders)
        await client.query(
            `INSERT INTO course_orders (order_id, course_id, course_name, course_price)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (order_id) DO UPDATE SET course_id = $2, course_name = $3, course_price = $4`,
            [order.id, courseId, course.name, coursePrice]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            data: {
                order_id: order.id,
            },
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        next(error);
    } finally {
        client.release();
    }
};

/**
 * Grant course access to a user (Admin only)
 */
const grantCourseAccess = async (req, res, next) => {
    const client = await getClient();
    try {
        const { id: courseId } = req.params;
        const { user_id, access_start, access_end } = req.body;
        const adminId = req.user.id;

        // Validate required fields
        if (!user_id || !access_start || !access_end) {
            client.release();
            return res.status(400).json({
                success: false,
                message: "user_id, access_start, and access_end are required",
            });
        }

        await client.query("BEGIN");

        // Check if course exists
        const courseCheck = await client.query(
            "SELECT id, name FROM courses WHERE id = $1 AND is_active = true",
            [courseId]
        );

        if (courseCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Course not found",
            });
        }

        const course = courseCheck.rows[0];

        // Check if user exists
        const userCheck = await client.query(
            "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
            [user_id]
        );

        if (userCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const user = userCheck.rows[0];

        // Check if user already has active access
        const existingAccess = await client.query(
            `SELECT id FROM course_access 
             WHERE user_id = $1 AND course_id = $2 AND is_active = true
             AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end`,
            [user_id, courseId]
        );

        if (existingAccess.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "User already has active access to this course",
            });
        }

        // Create course access (without request_id since it's direct grant)
        const accessResult = await client.query(
            `INSERT INTO course_access (user_id, course_id, request_id, access_start, access_end, granted_by)
             VALUES ($1, $2, NULL, $3, $4, $5)
             RETURNING id, access_start, access_end`,
            [user_id, courseId, access_start, access_end, adminId]
        );

        // Unlock all videos for the course
        await client.query(
            `INSERT INTO video_progress (user_id, video_id, course_id, is_unlocked, unlocked_at)
             SELECT $1, v.id, $2, true, CURRENT_TIMESTAMP
             FROM videos v
             WHERE v.course_id = $2 AND v.is_active = true
             ON CONFLICT (user_id, video_id) 
             DO UPDATE SET is_unlocked = true, unlocked_at = CURRENT_TIMESTAMP`,
            [user_id, courseId]
        );

        await client.query("COMMIT");

        // Create notification for user
        const { createNotification } = require("./notificationController");
        createNotification(
            user_id,
            "course_access_granted",
            "Course Access Granted! 🎉",
            `You have been granted access to "${course.name}". You can now access all course content.`,
            {
                course_id: courseId,
                course_name: course.name,
                access_start: access_start,
                access_end: access_end,
            }
        ).catch((err) => console.error("Failed to create notification:", err));

        res.json({
            success: true,
            message: "Course access granted successfully",
            data: accessResult.rows[0],
        });
    } catch (error) {
        await client.query("ROLLBACK");
        next(error);
    } finally {
        client.release();
    }
};

module.exports = {
    getAllCourses,
    getFeaturedCourses,
    getCourseBySlug,
    createCourse,
    updateCourse,
    deleteCourse,
    purchaseCourse,
    grantCourseAccess,
};
