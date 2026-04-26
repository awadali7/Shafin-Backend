const path = require("path");
const fs = require("fs");
const { query } = require("../config/database");
const { normalizeImageUrl } = require("../utils/helpers");

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value) {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    const s = String(value).trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    return undefined;
}

function normalizeImagesArray(images) {
    if (!images) return null;
    try {
        let parsed = images;
        if (typeof images === "string") {
            parsed = JSON.parse(images);
        }
        if (Array.isArray(parsed)) {
            return parsed
                .map((img) => (img ? normalizeImageUrl(img) : img))
                .filter((img) => img);
        }
    } catch (e) {
        // If it's already an array, try to normalize directly
        if (Array.isArray(images)) {
            return images
                .map((img) => (img ? normalizeImageUrl(img) : img))
                .filter((img) => img);
        }
    }
    return null;
}

function normalizeVideosArray(videos) {
    if (!videos) return null;
    try {
        const parsed = typeof videos === "string" ? JSON.parse(videos) : videos;
        if (Array.isArray(parsed)) {
            return parsed.map((video) => ({
                ...video,
                thumbnail: video.thumbnail
                    ? normalizeImageUrl(video.thumbnail)
                    : video.thumbnail,
            }));
        }
    } catch (e) {
        // ignore
    }
    return null;
}

/**
 * Public: List products
 * Supports: ?q= ?category= ?type= (physical|digital) ?page= ?limit=
 * Excludes digital products that the authenticated user has already purchased
 */
const getAllProducts = async (req, res, next) => {
    try {
        const q = (req.query.q || "").toString().trim();
        const category = (req.query.category || "").toString().trim();
        const type = (req.query.type || "").toString().trim();
        const userId = req.user?.id; // Optional: user ID if authenticated

        // Parse categoryPath - supports both array and repeated query params
        let categoryPath = req.query.categoryPath;
        if (categoryPath && !Array.isArray(categoryPath)) {
            // If single value, convert to array
            categoryPath = [categoryPath];
        }
        // Filter out empty strings and ensure all are strings
        if (Array.isArray(categoryPath)) {
            categoryPath = categoryPath
                .map(c => String(c).trim())
                .filter(c => c.length > 0);
        }

        // Pagination parameters
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)); // Default 20, max 100
        const offset = (page - 1) * limit;

        const where = ["p.is_active = true"];
        const params = [];
        let i = 1;

        // Filter by category path (hierarchical) or single category (backward compatibility)
        if (categoryPath && Array.isArray(categoryPath) && categoryPath.length > 0) {
            // Hierarchical category path filtering.
            // Match each selected level by array index so the path behaves like a prefix.
            const pathConditions = categoryPath.map((cat, index) => {
                params.push(cat);
                const condition = `p.categories->>${index} = $${i}`;
                i++;
                return condition;
            });
            where.push(`(${pathConditions.join(" AND ")})`);
        } else if (category && category.toLowerCase() !== "all") {
            // Backward compatibility: single category filter
            where.push(`p.categories @> $${i}::jsonb`);
            params.push(JSON.stringify([category]));
            i++;
        }
        if (type && ["physical", "digital"].includes(type)) {
            where.push(`p.product_type = $${i++}`);
            params.push(type);
        }
        if (q) {
            // Search in name, description, and all categories
            where.push(
                `(LOWER(p.name) LIKE $${i} OR LOWER(COALESCE(p.description,'')) LIKE $${i} OR 
                 EXISTS (
                     SELECT 1 FROM jsonb_array_elements_text(p.categories) AS cat 
                     WHERE LOWER(cat) LIKE $${i}
                 ))`
            );
            params.push(`%${q.toLowerCase()}%`);
            i++;
        }

        // If user is authenticated, exclude digital products they've already purchased
        if (userId) {
            where.push(
                `(p.product_type != 'digital' OR NOT EXISTS (
                    SELECT 1 FROM product_entitlements pe 
                    WHERE pe.product_id = p.id AND pe.user_id = $${i}
                ))`
            );
            params.push(userId);
            i++;
        }

        // Get total count for pagination
        const countResult = await query(
            `SELECT COUNT(*) as total
             FROM products p
             WHERE ${where.join(" AND ")}`,
            params
        );
        const totalProducts = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalProducts / limit);

        // Get paginated results
        const result = await query(
            `SELECT
                p.id,
                p.name,
                p.slug,
                p.description,
                p.english_description,
                p.malayalam_description,
                p.hindi_description,
                p.price,
                p.offer_price,
                p.category,
                p.categories,
                p.product_type,
                p.cover_image,
                p.images,
                p.videos,
                p.digital_file_name,
                p.digital_file_format,
                p.stock_quantity,
                p.rating,
                p.reviews_count,
                p.is_active,
                p.is_coming_soon,
                p.is_contact_only,
                p.tiered_pricing,
                p.requires_kyc,
                p.requires_kyc_multiple,
                p.show_price_before_kyc,
                p.product_detail_pdf,
                p.product_extra_info_id,
                p.origin_city,
                p.origin_state,
                p.origin_pincode,
                p.created_at,
                p.updated_at
             FROM products p
             WHERE ${where.join(" AND ")}
             ORDER BY p.created_at DESC
             LIMIT $${i} OFFSET $${i + 1}`,
            [...params, limit, offset]
        );

        const products = result.rows.map((p) => ({
            ...p,
            type: p.product_type,
            // For backward compatibility, keep category field (first category from array)
            category:
                p.categories &&
                    Array.isArray(p.categories) &&
                    p.categories.length > 0
                    ? p.categories[0]
                    : p.category || null,
            categories: p.categories || [],
            cover_image: normalizeImageUrl(p.cover_image),
            images: normalizeImagesArray(p.images) || [],
            videos: normalizeVideosArray(p.videos) || [],
            // Map tiered_pricing to quantity_pricing for frontend compatibility
            quantity_pricing: p.tiered_pricing || [],
            in_stock:
                p.product_type === "digital"
                    ? true
                    : (p.stock_quantity ?? 0) > 0,
        }));

        res.json({
            success: true,
            data: products,
            pagination: {
                total: totalProducts,
                page: page,
                limit: limit,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Public: Get featured products
 */
const getFeaturedProducts = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT
                p.id,
                p.name,
                p.slug,
                p.description,
                p.english_description,
                p.malayalam_description,
                p.hindi_description,
                p.price,
                p.offer_price,
                p.category,
                p.categories,
                p.product_type,
                p.cover_image,
                p.images,
                p.videos,
                p.digital_file_name,
                p.digital_file_format,
                p.stock_quantity,
                p.rating,
                p.reviews_count,
                p.is_active,
                p.is_coming_soon,
                p.is_contact_only,
                p.tiered_pricing,
                p.requires_kyc,
                p.requires_kyc_multiple,
                p.show_price_before_kyc,
                p.product_detail_pdf,
                p.product_extra_info_id,
                p.origin_city,
                p.origin_state,
                p.origin_pincode,
                p.created_at,
                p.updated_at
             FROM products p
             WHERE p.is_active = true AND p.is_featured = true
             ORDER BY p.created_at DESC
             LIMIT 6`
        );

        const products = result.rows.map((p) => ({
            ...p,
            type: p.product_type,
            category:
                p.categories &&
                    Array.isArray(p.categories) &&
                    p.categories.length > 0
                    ? p.categories[0]
                    : p.category || null,
            categories: p.categories || [],
            cover_image: normalizeImageUrl(p.cover_image),
            images: normalizeImagesArray(p.images) || [],
            videos: normalizeVideosArray(p.videos) || [],
            // Map tiered_pricing to quantity_pricing for frontend compatibility
            quantity_pricing: p.tiered_pricing || [],
            in_stock:
                p.product_type === "digital"
                    ? true
                    : (p.stock_quantity ?? 0) > 0,
        }));

        res.json({ success: true, data: products });
    } catch (error) {
        next(error);
    }
};

/**
 * Public: Get product by slug
 */
const getProductBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;

        const result = await query(
            `SELECT
                id,
                name,
                slug,
                description,
                english_description,
                malayalam_description,
                hindi_description,
                price,
                offer_price,
                category,
                categories,
                product_type,
                cover_image,
                images,
                videos,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                is_coming_soon,
                is_contact_only,
                tiered_pricing,
                requires_kyc,
                requires_kyc_multiple,
                show_price_before_kyc,
                product_detail_pdf,
                product_extra_info_id,
                origin_city,
                origin_state,
                origin_pincode,
                weight,
                created_at,
                updated_at
             FROM products
             WHERE slug = $1 AND is_active = true
             LIMIT 1`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const p = result.rows[0];
        res.json({
            success: true,
            data: {
                ...p,
                type: p.product_type,
                category:
                    p.categories &&
                        Array.isArray(p.categories) &&
                        p.categories.length > 0
                        ? p.categories[0]
                        : p.category || null,
                categories: p.categories || [],
                cover_image: normalizeImageUrl(p.cover_image),
                images: normalizeImagesArray(p.images) || [],
                videos: normalizeVideosArray(p.videos) || [],
                // Map tiered_pricing to quantity_pricing for frontend compatibility
                quantity_pricing: p.tiered_pricing || [],
                in_stock:
                    p.product_type === "digital"
                        ? true
                        : (p.stock_quantity ?? 0) > 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: List all products (includes inactive)
 */
const adminGetAllProducts = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT
                id,
                name,
                slug,
                description,
                english_description,
                malayalam_description,
                hindi_description,
                price,
                offer_price,
                category,
                categories,
                product_type,
                cover_image,
                images,
                videos,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                is_coming_soon,
                is_contact_only,
                tiered_pricing,
                requires_kyc,
                requires_kyc_multiple,
                show_price_before_kyc,
                product_detail_pdf,
                product_extra_info_id,
                origin_city,
                origin_state,
                origin_pincode,
                weight,
                created_at,
                updated_at
             FROM products
             ORDER BY created_at DESC`
        );

        const products = result.rows.map((p) => ({
            ...p,
            type: p.product_type,
            category:
                p.categories &&
                    Array.isArray(p.categories) &&
                    p.categories.length > 0
                    ? p.categories[0]
                    : p.category || null,
            categories: p.categories || [],
            cover_image: normalizeImageUrl(p.cover_image),
            images: normalizeImagesArray(p.images) || [],
            videos: normalizeVideosArray(p.videos) || [],
            // Map tiered_pricing to quantity_pricing for frontend compatibility
            quantity_pricing: p.tiered_pricing || [],
            in_stock:
                p.product_type === "digital"
                    ? true
                    : (p.stock_quantity ?? 0) > 0,
        }));

        res.json({ success: true, data: products });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: Create product (supports multipart)
 * Files:
 * - cover_image (optional) -> /uploads/images (public)
 * - digital_file (optional) -> /private_uploads/digital (private)
 */
const adminCreateProduct = async (req, res, next) => {
    try {
        const {
            name,
            slug,
            description = "",
            english_description = "",
            malayalam_description = "",
            hindi_description = "",
            category = "",
            categories,
            product_type,
            price,
            offer_price,
            stock_quantity,
            is_active,
            is_featured,
            rating,
            reviews_count,
            images,
            videos,
            quantity_discounts,
            requires_kyc,
            requires_kyc_multiple,
            show_price_before_kyc,
            weight,
            length,
            width,
            height,
            product_extra_info_id,
            extra_shipping_charge,
            shipping_zones_config,
            weight_slabs_config,
            origin_city,
            origin_state,
            origin_pincode,
        } = req.body || {};

        const type = (product_type || req.body?.type || "").toString().trim();
        if (!name || !slug) {
            return res.status(400).json({
                success: false,
                message: "name and slug are required",
            });
        }
        if (!["physical", "digital"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "product_type must be physical or digital",
            });
        }

        const coverImageFile = req.files?.cover_image?.[0];
        const digitalFile = req.files?.digital_file?.[0];
        const imageFiles = req.files?.images || [];
        const videoFiles = req.files?.videos || [];
        const videoThumbnailFiles = req.files?.video_thumbnails || [];
        const productDetailPdfFile = req.files?.product_detail_pdf?.[0];

        let digitalFilePath = null;
        let digitalFileName = null;
        let digitalFileFormat = null;

        if (type === "digital") {
            if (digitalFile) {
                // New file uploaded
                digitalFilePath = digitalFile.path;
                digitalFileName = digitalFile.originalname;
                digitalFileFormat = path.extname(digitalFile.originalname).replace(".", "").toLowerCase();
            } else if (req.body.digital_file_name) {
                // Linking existing file
                const linkedFileName = req.body.digital_file_name;
                const linkedFilePath = path.join(__dirname, "../../private_uploads/digital", linkedFileName);

                if (fs.existsSync(linkedFilePath)) {
                    digitalFilePath = linkedFilePath;
                    digitalFileName = linkedFileName;
                    digitalFileFormat = path.extname(linkedFileName).replace(".", "").toLowerCase();
                } else {
                    return res.status(400).json({
                        success: false,
                        message: "Linked digital file does not exist",
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: "digital_file or digital_file_name is required for digital products",
                });
            }
        }

        const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
        const coverImageUrl = coverImageFile
            ? `${baseUrl}/uploads/images/${coverImageFile.filename}`
            : null;

        const productDetailPdfUrl = productDetailPdfFile
            ? `${baseUrl}/uploads/pdfs/${productDetailPdfFile.filename}`
            : null;

        // Process uploaded image files to URLs
        const uploadedImageUrls = imageFiles.map(
            (file) => `${baseUrl}/uploads/images/${file.filename}`
        );

        // Process uploaded video files and thumbnails
        // Note: Videos are stored as files, but we need to handle them differently
        // For now, we'll store video file paths and serve them via a download/stream endpoint
        // Or we can store them as URLs if they're meant to be embedded
        const videoThumbnailUrls = videoThumbnailFiles.map(
            (file) => `${baseUrl}/uploads/images/${file.filename}`
        );

        // Combine uploaded images with any existing image URLs from JSON
        let allImageUrls = [...uploadedImageUrls];
        if (images !== undefined) {
            try {
                const parsedImages =
                    typeof images === "string" ? JSON.parse(images) : images;
                if (Array.isArray(parsedImages)) {
                    // Filter out base64 data URLs (they're too large) and keep only regular URLs
                    const urlImages = parsedImages.filter(
                        (img) =>
                            img &&
                            typeof img === "string" &&
                            !img.startsWith("data:")
                    );
                    allImageUrls = [...allImageUrls, ...urlImages];
                }
            } catch (e) {
                // ignore
            }
        }

        // If cover_image was uploaded, add it to images array if not already there
        if (coverImageUrl && !allImageUrls.includes(coverImageUrl)) {
            allImageUrls.unshift(coverImageUrl); // Add cover image as first image
        }

        // Process videos - combine uploaded videos with JSON videos
        let allVideos = [];

        // Handle uploaded video files
        videoFiles.forEach((videoFile, index) => {
            const videoTitle =
                req.body[`video_titles[${index}]`] ||
                req.body[`video_titles_${index}`] ||
                `Video ${index + 1}`;
            const thumbnailUrl = videoThumbnailUrls[index] || null;
            // For now, store video file path - you may want to serve videos via a streaming endpoint
            const videoUrl = `${baseUrl}/uploads/videos/${videoFile.filename}`;
            allVideos.push({
                title: videoTitle,
                url: videoUrl,
                thumbnail: thumbnailUrl,
            });
        });

        // Add videos from JSON (if any)
        if (videos !== undefined) {
            try {
                const parsedVideos =
                    typeof videos === "string" ? JSON.parse(videos) : videos;
                if (Array.isArray(parsedVideos)) {
                    // Filter out base64 data URLs and keep only regular URLs
                    const urlVideos = parsedVideos.filter(
                        (video) =>
                            video &&
                            video.url &&
                            typeof video.url === "string" &&
                            !video.url.startsWith("data:")
                    );
                    allVideos = [...allVideos, ...urlVideos];
                }
            } catch (e) {
                // ignore
            }
        }

        const imagesJson =
            allImageUrls.length > 0 ? JSON.stringify(allImageUrls) : null;
        const videosJson =
            allVideos.length > 0 ? JSON.stringify(allVideos) : null;

        // Handle categories array
        let categoriesArray = [];
        if (categories) {
            try {
                const parsedCategories =
                    typeof categories === "string"
                        ? JSON.parse(categories)
                        : categories;
                if (Array.isArray(parsedCategories)) {
                    categoriesArray = parsedCategories
                        .filter((cat) => cat && cat.trim())
                        .slice(0, 4); // Max 4 categories
                }
            } catch (e) {
                // If parsing fails and it's a string, treat as single category
                if (typeof categories === "string" && categories.trim()) {
                    categoriesArray = [categories.trim()];
                }
            }
        }
        // Backward compatibility: if no categories but category exists, use it
        if (categoriesArray.length === 0 && category && category.trim()) {
            categoriesArray = [category.trim()];
        }
        const categoriesJson = JSON.stringify(categoriesArray);

        const insert = await query(
            `INSERT INTO products (
                name,
                slug,
                description,
                english_description,
                malayalam_description,
                hindi_description,
                price,
                offer_price,
                category,
                categories,
                product_type,
                cover_image,
                images,
                videos,
                digital_file_storage_path,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                is_featured,
                is_coming_soon,
                is_contact_only,
                requires_kyc,
                requires_kyc_multiple,
                show_price_before_kyc,
                tiered_pricing,
                product_detail_pdf,
                product_extra_info_id,
                weight,
                length,
                width,
                height,
                volumetric_weight,
                extra_shipping_charge,
                shipping_zones_config,
                weight_slabs_config,
                origin_city,
                origin_state,
                origin_pincode
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41
            )
            RETURNING
                id,
                name,
                slug,
                description,
                english_description,
                malayalam_description,
                hindi_description,
                price,
                offer_price,
                category,
                categories,
                product_type,
                cover_image,
                images,
                videos,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                is_coming_soon,
                is_contact_only,
                tiered_pricing,
                requires_kyc,
                requires_kyc_multiple,
                show_price_before_kyc,
                product_extra_info_id,
                origin_city,
                origin_state,
                origin_pincode,
                weight,
                created_at,
                updated_at`,
            [
                name,
                slug,
                description,
                english_description,
                malayalam_description,
                hindi_description,
                toNumber(price, 0),
                toNumber(offer_price, 0) > 0 ? toNumber(offer_price, 0) : null,
                categoriesArray.length > 0 ? categoriesArray[0] : null, // First category for backward compatibility
                categoriesJson,
                type,
                coverImageUrl,
                imagesJson,
                videosJson,
                digitalFilePath,
                digitalFileName,
                digitalFileFormat,
                type === "physical" ? toNumber(stock_quantity, 0) : null,
                toNumber(rating, 0),
                Math.max(0, parseInt(reviews_count || "0", 10) || 0),
                toBoolean(is_active) ?? true,
                toBoolean(is_featured) || false,
                toBoolean(req.body.is_coming_soon) || false,
                toBoolean(req.body.is_contact_only) || false,
                toBoolean(requires_kyc) || false,
                toBoolean(requires_kyc_multiple) || false,
                toBoolean(show_price_before_kyc) || false,
                // Handle tiered pricing (accepts either tiered_pricing or quantity_pricing or quantity_discounts from body)
                (() => {
                    const pricing = req.body.tiered_pricing || req.body.quantity_pricing || req.body.quantity_discounts;
                    if (!pricing) return null;
                    try {
                        return typeof pricing === 'string' ? pricing : JSON.stringify(pricing);
                    } catch (e) { return null; }
                })(),
                productDetailPdfUrl,
                product_extra_info_id || null,
                toNumber(weight, 0),
                toNumber(length, 0),
                toNumber(width, 0),
                toNumber(height, 0),
                Math.ceil((toNumber(length, 0) * toNumber(width, 0) * toNumber(height, 0)) / 5000),
                toNumber(extra_shipping_charge, 0),
                (shipping_zones_config && typeof shipping_zones_config === 'string') ? shipping_zones_config : (shipping_zones_config ? JSON.stringify(shipping_zones_config) : null),
                (weight_slabs_config && typeof weight_slabs_config === 'string') ? weight_slabs_config : (weight_slabs_config ? JSON.stringify(weight_slabs_config) : null),
                origin_city?.trim() || null,
                origin_state?.trim() || null,
                origin_pincode?.trim() || null,
            ]
        );

        const p = insert.rows[0];
        res.status(201).json({
            success: true,
            data: {
                ...p,
                type: p.product_type,
                category:
                    p.categories &&
                        Array.isArray(p.categories) &&
                        p.categories.length > 0
                        ? p.categories[0]
                        : p.category || null,
                categories: p.categories || [],
                cover_image: normalizeImageUrl(p.cover_image),
                images: normalizeImagesArray(p.images) || [],
                videos: normalizeVideosArray(p.videos) || [],
                // Map tiered_pricing to quantity_pricing for frontend compatibility
                quantity_pricing: p.tiered_pricing || [],
                in_stock:
                    p.product_type === "digital"
                        ? true
                        : (p.stock_quantity ?? 0) > 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: Update product (supports JSON or multipart)
 * If a new digital_file is uploaded, replaces the existing file on disk.
 */
const adminUpdateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await query(
            `SELECT id, product_type, digital_file_storage_path, length, width, height FROM products WHERE id = $1`,
            [id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const current = existing.rows[0];

        const {
            name,
            slug,
            description,
            english_description,
            malayalam_description,
            hindi_description,
            category,
            categories,
            product_type,
            type,
            price,
            offer_price,
            stock_quantity,
            rating,
            reviews_count,
            is_active,
            is_featured,
            is_coming_soon,
            is_contact_only,
            requires_kyc,
            requires_kyc_multiple,
            show_price_before_kyc,
            weight,
            length,
            width,
            height,
            extra_shipping_charge,
            shipping_zones_config,
            weight_slabs_config,
            videos,
            tiered_pricing,
            quantity_pricing,
            quantity_discounts,
            product_extra_info_id,
            origin_city,
            origin_state,
            origin_pincode,
        } = req.body || {};

        const nextType = (product_type || type || current.product_type || "")
            .toString()
            .trim();
        if (!["physical", "digital"].includes(nextType)) {
            return res.status(400).json({
                success: false,
                message: "product_type must be physical or digital",
            });
        }

        const coverImageFile = req.files?.cover_image?.[0];
        const digitalFile = req.files?.digital_file?.[0];
        const productDetailPdfFile = req.files?.product_detail_pdf?.[0];
        const imageFiles = req.files?.images || [];

        const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
        const coverImageUrl = coverImageFile
            ? `${baseUrl}/uploads/images/${coverImageFile.filename}`
            : undefined;

        // Convert newly uploaded image files to URLs
        const uploadedImageUrls = imageFiles.map(
            (file) => `${baseUrl}/uploads/images/${file.filename}`
        );

        const productDetailPdfUrl = productDetailPdfFile
            ? `${baseUrl}/uploads/pdfs/${productDetailPdfFile.filename}`
            : undefined;

        // Replace digital file if uploaded OR linked
        let digitalPath = undefined;
        let digitalName = undefined;
        let digitalFormat = undefined;

        if (digitalFile) {
            // New file uploaded
            digitalPath = digitalFile.path;
            digitalName = digitalFile.originalname;
            digitalFormat = path
                .extname(digitalFile.originalname)
                .replace(".", "")
                .toLowerCase();

            // Delete old file if exists
            const oldPath = current.digital_file_storage_path;
            if (oldPath && fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (e) {
                    // ignore
                }
            }
        } else if (req.body.digital_file_name) {
            // Linking existing file
            const linkedFileName = req.body.digital_file_name;
            const linkedFilePath = path.join(__dirname, "../../private_uploads/digital", linkedFileName);

            if (fs.existsSync(linkedFilePath)) {
                // Check if it's different from current
                if (current.digital_file_storage_path !== linkedFilePath) {
                    digitalPath = linkedFilePath;
                    digitalName = linkedFileName;
                    digitalFormat = path.extname(linkedFileName).replace(".", "").toLowerCase();

                    // We don't delete the old file if we are just switching links, 
                    // unless the old file was exclusive to this product. 
                    // For now, let's NOT delete old files when switching links to avoid deleting shared files.
                }
            }
        }

        const updates = [];
        const values = [];
        let paramCount = 1;

        const setIfDefined = (col, val) => {
            if (val === undefined) return;
            updates.push(`${col} = $${paramCount++}`);
            values.push(val);
        };

        setIfDefined("name", name);
        setIfDefined("slug", slug);
        setIfDefined("description", description);
        setIfDefined("english_description", english_description);
        setIfDefined("malayalam_description", malayalam_description);
        setIfDefined("hindi_description", hindi_description);

        // Handle categories array update
        if (categories !== undefined) {
            let categoriesArray = [];
            try {
                const parsedCategories =
                    typeof categories === "string"
                        ? JSON.parse(categories)
                        : categories;
                if (Array.isArray(parsedCategories)) {
                    categoriesArray = parsedCategories
                        .filter((cat) => cat && cat.trim())
                        .slice(0, 4);
                }
            } catch (e) {
                if (typeof categories === "string" && categories.trim()) {
                    categoriesArray = [categories.trim()];
                }
            }
            // Backward compatibility: if no categories but category exists, use it
            if (categoriesArray.length === 0 && category && category.trim()) {
                categoriesArray = [category.trim()];
            }
            setIfDefined("categories", JSON.stringify(categoriesArray));
            // Also update category field for backward compatibility
            if (categoriesArray.length > 0) {
                setIfDefined("category", categoriesArray[0]);
            }
        } else if (category !== undefined) {
            // If only category is provided (not categories array), update both
            setIfDefined("category", category);
            if (category && category.trim()) {
                setIfDefined("categories", JSON.stringify([category.trim()]));
            }
        }

        setIfDefined("product_type", nextType);
        if (price !== undefined) setIfDefined("price", toNumber(price, 0));
        if (offer_price !== undefined) {
            setIfDefined(
                "offer_price",
                toNumber(offer_price, 0) > 0 ? toNumber(offer_price, 0) : null
            );
        }
        if (rating !== undefined) setIfDefined("rating", toNumber(rating, 0));
        if (reviews_count !== undefined)
            setIfDefined(
                "reviews_count",
                Math.max(0, parseInt(reviews_count, 10) || 0)
            );
        if (is_featured !== undefined)
            setIfDefined("is_featured", toBoolean(is_featured) || false);
        if (is_coming_soon !== undefined)
            setIfDefined("is_coming_soon", toBoolean(is_coming_soon) || false);
        if (is_contact_only !== undefined)
            setIfDefined("is_contact_only", toBoolean(is_contact_only) || false);
        if (requires_kyc !== undefined)
            setIfDefined("requires_kyc", toBoolean(requires_kyc) || false);
        if (requires_kyc_multiple !== undefined)
            setIfDefined(
                "requires_kyc_multiple",
                toBoolean(requires_kyc_multiple) || false
            );
        if (show_price_before_kyc !== undefined)
            setIfDefined(
                "show_price_before_kyc",
                toBoolean(show_price_before_kyc) || false
            );

        if (nextType === "physical" && stock_quantity !== undefined) {
            setIfDefined("stock_quantity", toNumber(stock_quantity, 0));
        }

        let l = Number(current.length) || 0;
        let w = Number(current.width) || 0;
        let h = Number(current.height) || 0;
        let dimsChanged = false;

        if (weight !== undefined) setIfDefined("weight", toNumber(weight, 0));

        if (length !== undefined) {
            l = toNumber(length, 0);
            setIfDefined("length", l);
            dimsChanged = true;
        }
        if (width !== undefined) {
            w = toNumber(width, 0);
            setIfDefined("width", w);
            dimsChanged = true;
        }
        if (height !== undefined) {
            h = toNumber(height, 0);
            setIfDefined("height", h);
            dimsChanged = true;
        }

        if (dimsChanged) {
            const vw = Math.ceil((l * w * h) / 5000);
            setIfDefined("volumetric_weight", vw);
        }

        if (extra_shipping_charge !== undefined) {
            setIfDefined("extra_shipping_charge", toNumber(extra_shipping_charge, 0));
        }
        if (shipping_zones_config !== undefined) {
            setIfDefined("shipping_zones_config", (shipping_zones_config && typeof shipping_zones_config === 'string') ? shipping_zones_config : (shipping_zones_config ? JSON.stringify(shipping_zones_config) : null));
        }
        if (weight_slabs_config !== undefined) {
            setIfDefined("weight_slabs_config", (weight_slabs_config && typeof weight_slabs_config === 'string') ? weight_slabs_config : (weight_slabs_config ? JSON.stringify(weight_slabs_config) : null));
        }
        if (nextType === "digital") {
            // For digital products, stock doesn't apply
            setIfDefined("stock_quantity", null);
        }

        if (coverImageUrl !== undefined)
            setIfDefined("cover_image", coverImageUrl);
        if (digitalPath !== undefined)
            setIfDefined("digital_file_storage_path", digitalPath);
        if (digitalName !== undefined)
            setIfDefined("digital_file_name", digitalName);
        if (digitalFormat !== undefined)
            setIfDefined("digital_file_format", digitalFormat);
        if (productDetailPdfUrl !== undefined)
            setIfDefined("product_detail_pdf", productDetailPdfUrl);
        if (product_extra_info_id !== undefined)
            setIfDefined("product_extra_info_id", product_extra_info_id || null);
        if (origin_city !== undefined)
            setIfDefined("origin_city", origin_city?.trim() || null);
        if (origin_state !== undefined)
            setIfDefined("origin_state", origin_state?.trim() || null);
        if (origin_pincode !== undefined)
            setIfDefined("origin_pincode", origin_pincode?.trim() || null);

        // Handle images: merge existing URLs to keep with newly uploaded files
        {
            // existing_images: JSON array of image URLs the client wants to preserve
            const existingImagesBody = req.body.existing_images;
            let keptUrls = [];
            if (existingImagesBody !== undefined) {
                try {
                    const parsed = typeof existingImagesBody === "string"
                        ? JSON.parse(existingImagesBody)
                        : existingImagesBody;
                    if (Array.isArray(parsed)) {
                        keptUrls = parsed.filter(
                            (img) => img && typeof img === "string" && !img.startsWith("data:")
                        );
                    }
                } catch (e) {
                    // ignore invalid JSON
                }
            }

            const finalImageUrls = [...keptUrls, ...uploadedImageUrls];

            // Only update the images column when the client explicitly sent
            // existing_images or uploaded new files — otherwise leave DB unchanged
            if (existingImagesBody !== undefined || uploadedImageUrls.length > 0) {
                setIfDefined("images", JSON.stringify(finalImageUrls));
            }
        }

        // Handle videos array (JSONB)
        if (videos !== undefined) {
            try {
                const videosJson = Array.isArray(videos)
                    ? JSON.stringify(videos)
                    : videos;
                setIfDefined("videos", videosJson);
            } catch (e) {
                // ignore invalid JSON
            }
        }

        // Handle tiered_pricing array (JSONB) - check all aliases
        const pricingUpdate = tiered_pricing || quantity_pricing || quantity_discounts;
        if (pricingUpdate !== undefined) {
            try {
                const pricingJson = Array.isArray(pricingUpdate)
                    ? JSON.stringify(pricingUpdate)
                    : pricingUpdate;
                setIfDefined("tiered_pricing", pricingJson);
            } catch (e) {
                // ignore invalid JSON
            }
        }

        const activeBool = toBoolean(is_active);
        if (activeBool !== undefined) setIfDefined("is_active", activeBool);

        if (updates.length === 0) {
            return res.json({ success: true, message: "No changes" });
        }

        values.push(id);
        const updated = await query(
            `UPDATE products
             SET ${updates.join(", ")}
             WHERE id = $${paramCount}
             RETURNING
                id,
                name,
                slug,
                description,
                english_description,
                malayalam_description,
                hindi_description,
                price,
                offer_price,
                category,
                categories,
                product_type,
                cover_image,
                images,
                videos,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                is_coming_soon,
                is_contact_only,
                requires_kyc,
                requires_kyc_multiple,
                show_price_before_kyc,
                tiered_pricing,
                product_detail_pdf,
                product_extra_info_id,
                origin_city,
                origin_state,
                origin_pincode,
                created_at,
                updated_at`,
            values
        );

        const p = updated.rows[0];
        res.json({
            success: true,
            data: {
                ...p,
                type: p.product_type,
                category:
                    p.categories &&
                        Array.isArray(p.categories) &&
                        p.categories.length > 0
                        ? p.categories[0]
                        : p.category || null,
                categories: p.categories || [],
                cover_image: normalizeImageUrl(p.cover_image),
                images: normalizeImagesArray(p.images) || [],
                videos: normalizeVideosArray(p.videos) || [],
                // Map tiered_pricing to quantity_pricing for frontend compatibility
                quantity_pricing: p.tiered_pricing || [],
                in_stock:
                    p.product_type === "digital"
                        ? true
                        : (p.stock_quantity ?? 0) > 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * User: Download a digital product by slug (requires entitlement)
 */
const downloadDigitalProductBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;

        const result = await query(
            `SELECT id, name, slug, product_type, is_active,
                    digital_file_storage_path, digital_file_name
             FROM products
             WHERE slug = $1
             LIMIT 1`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const product = result.rows[0];
        if (!product.is_active) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        if (product.product_type !== "digital") {
            return res.status(400).json({
                success: false,
                message: "This product is not a digital download",
            });
        }

        const entitlement = await query(
            `SELECT 1
             FROM product_entitlements
             WHERE user_id = $1 AND product_id = $2
             LIMIT 1`,
            [req.user.id, product.id]
        );

        if (entitlement.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message:
                    "You don't have access to this digital product. Complete payment or contact admin.",
            });
        }

        const filePath = product.digital_file_storage_path;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: "Digital file not found",
            });
        }

        // Security: ensure file is within private_uploads/digital
        const allowedDir = path.resolve(
            __dirname,
            "../../private_uploads/digital"
        );
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(allowedDir + path.sep)) {
            return res.status(403).json({
                success: false,
                message: "Invalid file path",
            });
        }

        const filename = product.digital_file_name || path.basename(resolved);
        res.download(resolved, filename, (err) => {
            if (err) return next(err);
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: Delete product
 * Also removes private digital file if present.
 */
const adminDeleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const existing = await query(
            `SELECT id, digital_file_storage_path FROM products WHERE id = $1`,
            [id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const oldPath = existing.rows[0].digital_file_storage_path;

        await query(`DELETE FROM products WHERE id = $1`, [id]);

        if (oldPath && fs.existsSync(oldPath)) {
            try {
                fs.unlinkSync(oldPath);
            } catch (e) {
                // ignore
            }
        }

        res.json({ success: true, message: "Product deleted" });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllProducts,
    getFeaturedProducts,
    getProductBySlug,
    adminGetAllProducts,
    adminCreateProduct,
    adminUpdateProduct,
    adminDeleteProduct,
    downloadDigitalProductBySlug,
};
