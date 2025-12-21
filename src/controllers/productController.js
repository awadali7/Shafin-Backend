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

/**
 * Public: List products
 * Supports: ?q= ?category= ?type= (physical|digital)
 */
const getAllProducts = async (req, res, next) => {
    try {
        const q = (req.query.q || "").toString().trim();
        const category = (req.query.category || "").toString().trim();
        const type = (req.query.type || "").toString().trim();

        const where = ["is_active = true"];
        const params = [];
        let i = 1;

        if (category && category.toLowerCase() !== "all") {
            where.push(`category = $${i++}`);
            params.push(category);
        }
        if (type && ["physical", "digital"].includes(type)) {
            where.push(`product_type = $${i++}`);
            params.push(type);
        }
        if (q) {
            where.push(
                `(LOWER(name) LIKE $${i} OR LOWER(category) LIKE $${i} OR LOWER(COALESCE(description,'')) LIKE $${i})`
            );
            params.push(`%${q.toLowerCase()}%`);
            i++;
        }

        const result = await query(
            `SELECT
                id,
                name,
                slug,
                description,
                price,
                category,
                product_type,
                cover_image,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                created_at,
                updated_at
             FROM products
             WHERE ${where.join(" AND ")}
             ORDER BY created_at DESC`,
            params
        );

        const products = result.rows.map((p) => ({
            ...p,
            type: p.product_type,
            cover_image: normalizeImageUrl(p.cover_image),
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
                price,
                category,
                product_type,
                cover_image,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
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
                cover_image: normalizeImageUrl(p.cover_image),
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
                price,
                category,
                product_type,
                cover_image,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                created_at,
                updated_at
             FROM products
             ORDER BY created_at DESC`
        );

        const products = result.rows.map((p) => ({
            ...p,
            type: p.product_type,
            cover_image: normalizeImageUrl(p.cover_image),
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
            category = "",
            product_type,
            price,
            stock_quantity,
            rating,
            reviews_count,
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

        if (type === "digital" && !digitalFile) {
            return res.status(400).json({
                success: false,
                message: "digital_file is required for digital products",
            });
        }

        const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
        const coverImageUrl = coverImageFile
            ? `${baseUrl}/uploads/images/${coverImageFile.filename}`
            : null;

        const insert = await query(
            `INSERT INTO products (
                name,
                slug,
                description,
                price,
                category,
                product_type,
                cover_image,
                digital_file_storage_path,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                created_by
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
            )
            RETURNING
                id,
                name,
                slug,
                description,
                price,
                category,
                product_type,
                cover_image,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
                created_at,
                updated_at`,
            [
                name,
                slug,
                description,
                toNumber(price, 0),
                category || null,
                type,
                coverImageUrl,
                digitalFile ? digitalFile.path : null,
                digitalFile ? digitalFile.originalname : null,
                digitalFile
                    ? path
                          .extname(digitalFile.originalname)
                          .replace(".", "")
                          .toLowerCase()
                    : null,
                type === "physical" ? toNumber(stock_quantity, 0) : null,
                toNumber(rating, 0),
                Math.max(0, parseInt(reviews_count || "0", 10) || 0),
                req.user?.id || null,
            ]
        );

        const p = insert.rows[0];
        res.status(201).json({
            success: true,
            data: {
                ...p,
                type: p.product_type,
                cover_image: normalizeImageUrl(p.cover_image),
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
            `SELECT id, product_type, digital_file_storage_path FROM products WHERE id = $1`,
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
            category,
            product_type,
            type,
            price,
            stock_quantity,
            rating,
            reviews_count,
            is_active,
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

        const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
        const coverImageUrl = coverImageFile
            ? `${baseUrl}/uploads/images/${coverImageFile.filename}`
            : undefined;

        // Replace digital file if uploaded
        let digitalPath = undefined;
        let digitalName = undefined;
        let digitalFormat = undefined;
        if (digitalFile) {
            digitalPath = digitalFile.path;
            digitalName = digitalFile.originalname;
            digitalFormat = path
                .extname(digitalFile.originalname)
                .replace(".", "")
                .toLowerCase();

            const oldPath = current.digital_file_storage_path;
            if (oldPath && fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (e) {
                    // ignore
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
        setIfDefined("category", category);
        setIfDefined("product_type", nextType);
        if (price !== undefined) setIfDefined("price", toNumber(price, 0));
        if (rating !== undefined) setIfDefined("rating", toNumber(rating, 0));
        if (reviews_count !== undefined)
            setIfDefined(
                "reviews_count",
                Math.max(0, parseInt(reviews_count, 10) || 0)
            );

        if (nextType === "physical" && stock_quantity !== undefined) {
            setIfDefined("stock_quantity", toNumber(stock_quantity, 0));
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
                price,
                category,
                product_type,
                cover_image,
                digital_file_name,
                digital_file_format,
                stock_quantity,
                rating,
                reviews_count,
                is_active,
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
                cover_image: normalizeImageUrl(p.cover_image),
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
    getProductBySlug,
    adminGetAllProducts,
    adminCreateProduct,
    adminUpdateProduct,
    adminDeleteProduct,
    downloadDigitalProductBySlug,
};
