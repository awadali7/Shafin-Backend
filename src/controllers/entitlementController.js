const { query } = require("../config/database");
const { normalizeImageUrl } = require("../utils/helpers");

/**
 * User: list my entitled products (digital downloads + admin grants)
 */
const getMyProductEntitlements = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT
                pe.id as entitlement_id,
                pe.source,
                pe.order_id,
                pe.note,
                pe.created_at as granted_at,
                p.id as product_id,
                p.name,
                p.slug,
                p.category,
                p.product_type,
                p.cover_image,
                p.digital_file_name,
                p.digital_file_format
             FROM product_entitlements pe
             JOIN products p ON p.id = pe.product_id
             WHERE pe.user_id = $1
             ORDER BY pe.created_at DESC`,
            [req.user.id]
        );

        const data = result.rows.map((r) => ({
            ...r,
            cover_image: normalizeImageUrl(r.cover_image),
            type: r.product_type,
        }));

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: grant a product to a user for free
 * body: { user_id, product_id, note? }
 */
const adminGrantProductToUser = async (req, res, next) => {
    try {
        const { user_id, product_id, note } = req.body || {};
        if (!user_id || !product_id) {
            return res.status(400).json({
                success: false,
                message: "user_id and product_id are required",
            });
        }

        // Ensure product exists and is digital (since this is for downloads)
        const prod = await query(
            `SELECT id, product_type FROM products WHERE id = $1`,
            [product_id]
        );
        if (prod.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }
        if (prod.rows[0].product_type !== "digital") {
            return res.status(400).json({
                success: false,
                message: "Only digital products can be granted for download",
            });
        }

        await query(
            `INSERT INTO product_entitlements (user_id, product_id, source, granted_by, note)
             VALUES ($1,$2,'admin_grant',$3,$4)
             ON CONFLICT (user_id, product_id) DO UPDATE
             SET source = 'admin_grant',
                 granted_by = EXCLUDED.granted_by,
                 note = EXCLUDED.note`,
            [user_id, product_id, req.user.id, note || "Granted by admin"]
        );

        res.json({ success: true, message: "Product granted to user" });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getMyProductEntitlements,
    adminGrantProductToUser,
};
