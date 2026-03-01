const { query } = require("../config/database");
const { generateSlug, normalizeImageUrl } = require("../utils/helpers");

/**
 * Get all published blog posts (public)
 */
const getAllBlogPosts = async (req, res, next) => {
    try {
        const { limit = 10, offset = 0, search } = req.query;
        const limitNum = parseInt(limit);
        const offsetNum = parseInt(offset);

        let queryText = `
            SELECT 
                bp.id,
                bp.title,
                bp.slug,
                bp.cover_image,
                bp.views,
                bp.published_at,
                bp.created_at,
                u.first_name || ' ' || u.last_name as author_name,
                u.id as author_id
            FROM blog_posts bp
            JOIN users u ON bp.author_id = u.id
            WHERE bp.is_published = true
        `;

        const queryParams = [];

        if (search) {
            queryText += ` AND bp.title ILIKE $${queryParams.length + 1}`;
            queryParams.push(`%${search}%`);
        }

        queryText += ` ORDER BY bp.published_at DESC LIMIT $${queryParams.length + 1
            } OFFSET $${queryParams.length + 2}`;
        queryParams.push(limitNum, offsetNum);

        const result = await query(queryText, queryParams);

        // Get total count for pagination
        let countQuery = `
            SELECT COUNT(*) as total
            FROM blog_posts bp
            WHERE bp.is_published = true
        `;
        const countParams = [];

        if (search) {
            countQuery += ` AND bp.title ILIKE $1`;
            countParams.push(`%${search}%`);
        }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        // Normalize image URLs before returning
        const blogPosts = result.rows.map((post) => ({
            ...post,
            cover_image: normalizeImageUrl(post.cover_image),
        }));

        res.json({
            success: true,
            data: {
                data: blogPosts,
                pagination: {
                    total,
                    limit: limitNum,
                    offset: offsetNum,
                    hasMore: offsetNum + limitNum < total,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all blog posts (admin only - includes unpublished)
 */
const getAllBlogPostsAdmin = async (req, res, next) => {
    try {
        const { limit = 10, offset = 0, search, status } = req.query;
        const limitNum = parseInt(limit);
        const offsetNum = parseInt(offset);

        let queryText = `
            SELECT 
                bp.id,
                bp.title,
                bp.slug,
                bp.content,
                bp.cover_image,
                bp.pdfs,
                bp.is_published,
                bp.views,
                bp.published_at,
                bp.created_at,
                bp.updated_at,
                u.first_name || ' ' || u.last_name as author_name,
                u.id as author_id
            FROM blog_posts bp
            JOIN users u ON bp.author_id = u.id
            WHERE 1=1
        `;

        const queryParams = [];

        if (search) {
            queryText += ` AND bp.title ILIKE $${queryParams.length + 1}`;
            queryParams.push(`%${search}%`);
        }

        if (status === "published") {
            queryText += ` AND bp.is_published = true`;
        } else if (status === "draft") {
            queryText += ` AND bp.is_published = false`;
        }

        queryText += ` ORDER BY bp.created_at DESC LIMIT $${queryParams.length + 1
            } OFFSET $${queryParams.length + 2}`;
        queryParams.push(limitNum, offsetNum);

        const result = await query(queryText, queryParams);

        // Get total count
        let countQuery = `
            SELECT COUNT(*) as total
            FROM blog_posts bp
            WHERE 1=1
        `;
        const countParams = [];

        if (search) {
            countQuery += ` AND bp.title ILIKE $1`;
            countParams.push(`%${search}%`);
        }

        if (status === "published") {
            countQuery += ` AND bp.is_published = true`;
        } else if (status === "draft") {
            countQuery += ` AND bp.is_published = false`;
        }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        // Normalize image URLs before returning
        const blogPosts = result.rows.map((post) => ({
            ...post,
            cover_image: normalizeImageUrl(post.cover_image),
        }));

        res.json({
            success: true,
            data: {
                data: blogPosts,
                pagination: {
                    total,
                    limit: limitNum,
                    offset: offsetNum,
                    hasMore: offsetNum + limitNum < total,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get blog post by slug (public - only published)
 */
const getBlogPostBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;

        const result = await query(
            `SELECT 
                bp.id,
                bp.title,
                bp.slug,
                bp.content,
                bp.cover_image,
                bp.pdfs,
                bp.views,
                bp.published_at,
                bp.created_at,
                bp.updated_at,
                u.first_name || ' ' || u.last_name as author_name,
                u.id as author_id,
                u.email as author_email
            FROM blog_posts bp
            JOIN users u ON bp.author_id = u.id
            WHERE bp.slug = $1 AND bp.is_published = true`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Blog post not found",
            });
        }

        // Increment view count
        await query(`UPDATE blog_posts SET views = views + 1 WHERE id = $1`, [
            result.rows[0].id,
        ]);

        // Normalize image URL before returning
        const blogPost = {
            ...result.rows[0],
            views: result.rows[0].views + 1, // Return incremented view count
            cover_image: normalizeImageUrl(result.rows[0].cover_image),
        };

        res.json({
            success: true,
            data: blogPost,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get blog post by ID (admin - includes unpublished)
 */
const getBlogPostById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT 
                bp.id,
                bp.title,
                bp.slug,
                bp.content,
                bp.cover_image,
                bp.pdfs,
                bp.is_published,
                bp.views,
                bp.published_at,
                bp.created_at,
                bp.updated_at,
                u.first_name || ' ' || u.last_name as author_name,
                u.id as author_id,
                u.email as author_email
            FROM blog_posts bp
            JOIN users u ON bp.author_id = u.id
            WHERE bp.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Blog post not found",
            });
        }

        // Normalize image URL before returning
        const blogPost = {
            ...result.rows[0],
            cover_image: normalizeImageUrl(result.rows[0].cover_image),
        };

        res.json({
            success: true,
            data: blogPost,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create blog post (admin only)
 * Note: Content field supports HTML including images, iframes, videos, and other rich media
 */
const createBlogPost = async (req, res, next) => {
    try {
        const { title, content, cover_image, is_published, pdfs } = req.body;
        const authorId = req.user.id;

        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: "Title and content are required",
            });
        }

        // Content is stored as-is to support HTML, images, iframes, videos, etc.

        // Generate slug from title
        const slug = generateSlug(title);

        // Check if slug already exists
        const slugCheck = await query(
            `SELECT id FROM blog_posts WHERE slug = $1`,
            [slug]
        );

        let finalSlug = slug;
        if (slugCheck.rows.length > 0) {
            // Append timestamp if slug exists
            finalSlug = `${slug}-${Date.now()}`;
        }

        const publishedAt = is_published ? new Date() : null;

        const result = await query(
            `INSERT INTO blog_posts (title, slug, content, cover_image, author_id, is_published, published_at, pdfs)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                title,
                finalSlug,
                content,
                cover_image || null,
                authorId,
                is_published || false,
                publishedAt,
                JSON.stringify(pdfs || []),
            ]
        );

        res.status(201).json({
            success: true,
            message: "Blog post created successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update blog post (admin only)
 * Note: Content field supports HTML including images, iframes, videos, and other rich media
 */
const updateBlogPost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, content, cover_image, is_published, pdfs } = req.body;

        // Content is stored as-is to support HTML, images, iframes, videos, etc.

        // Check if post exists
        const postCheck = await query(
            `SELECT id, slug, is_published FROM blog_posts WHERE id = $1`,
            [id]
        );

        if (postCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Blog post not found",
            });
        }

        const currentPost = postCheck.rows[0];
        let slug = currentPost.slug;
        let publishedAt = currentPost.published_at;

        // Generate new slug if title changed
        if (title && title !== currentPost.title) {
            slug = generateSlug(title);
            // Check if new slug exists
            const slugCheck = await query(
                `SELECT id FROM blog_posts WHERE slug = $1 AND id != $2`,
                [slug, id]
            );
            if (slugCheck.rows.length > 0) {
                slug = `${slug}-${Date.now()}`;
            }
        }

        // Set published_at if being published for the first time
        if (is_published === true && !currentPost.published_at) {
            publishedAt = new Date();
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (title) {
            updateFields.push(`title = $${paramIndex++}`);
            updateValues.push(title);
        }
        if (content) {
            updateFields.push(`content = $${paramIndex++}`);
            updateValues.push(content);
        }
        if (cover_image !== undefined) {
            updateFields.push(`cover_image = $${paramIndex++}`);
            updateValues.push(cover_image);
        }
        if (is_published !== undefined) {
            updateFields.push(`is_published = $${paramIndex++}`);
            updateValues.push(is_published);
        }
        if (pdfs !== undefined) {
            updateFields.push(`pdfs = $${paramIndex++}`);
            updateValues.push(JSON.stringify(pdfs || []));
        }
        if (slug !== currentPost.slug) {
            updateFields.push(`slug = $${paramIndex++}`);
            updateValues.push(slug);
        }
        if (publishedAt !== currentPost.published_at) {
            updateFields.push(`published_at = $${paramIndex++}`);
            updateValues.push(publishedAt);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields to update",
            });
        }

        updateValues.push(id);
        const queryText = `UPDATE blog_posts SET ${updateFields.join(
            ", "
        )} WHERE id = $${paramIndex} RETURNING *`;

        const result = await query(queryText, updateValues);

        res.json({
            success: true,
            message: "Blog post updated successfully",
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete blog post (admin only)
 */
const deleteBlogPost = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            `DELETE FROM blog_posts WHERE id = $1 RETURNING id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Blog post not found",
            });
        }

        res.json({
            success: true,
            message: "Blog post deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllBlogPosts,
    getAllBlogPostsAdmin,
    getBlogPostBySlug,
    getBlogPostById,
    createBlogPost,
    updateBlogPost,
    deleteBlogPost,
};
