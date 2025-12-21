const { query, getClient } = require("../config/database");

function toMoney(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
}

/**
 * User: create order from cart items
 * body: { items: [{product_id, quantity}], customer?: {...shipping/contact} }
 */
const createOrder = async (req, res, next) => {
    const client = await getClient();
    try {
        const { items, customer } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "items are required",
            });
        }

        // Load products
        const ids = items.map((i) => i.product_id).filter(Boolean);
        if (ids.length !== items.length) {
            return res.status(400).json({
                success: false,
                message: "Each item must include product_id",
            });
        }

        await client.query("BEGIN");

        const productsRes = await client.query(
            `SELECT id, name, price, product_type, stock_quantity, is_active
             FROM products
             WHERE id = ANY($1::uuid[])`,
            [ids]
        );

        const byId = new Map(productsRes.rows.map((p) => [p.id, p]));
        for (const item of items) {
            const p = byId.get(item.product_id);
            if (!p || !p.is_active) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: "One or more products are invalid or inactive",
                });
            }
            const qty = Math.max(1, parseInt(item.quantity || "1", 10) || 1);
            if (p.product_type === "digital" && qty !== 1) {
                // enforce 1 for digital products
                item.quantity = 1;
            } else {
                item.quantity = qty;
            }
            if (
                p.product_type === "physical" &&
                (p.stock_quantity ?? 0) < item.quantity
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${p.name}`,
                });
            }
        }

        const hasPhysical = items.some((i) => {
            const p = byId.get(i.product_id);
            return p?.product_type === "physical";
        });

        const subtotal = toMoney(
            items.reduce((sum, i) => {
                const p = byId.get(i.product_id);
                return sum + Number(p.price) * Number(i.quantity || 1);
            }, 0)
        );
        const shippingCost = hasPhysical ? 200 : 0;
        const total = toMoney(subtotal + shippingCost);

        const orderRes = await client.query(
            `INSERT INTO orders (
                user_id,
                status,
                subtotal,
                shipping_cost,
                total,
                first_name,
                last_name,
                email,
                phone,
                address,
                city,
                state,
                pincode
             ) VALUES (
                $1,'pending',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
             )
             RETURNING id, status, subtotal, shipping_cost, total, created_at`,
            [
                req.user.id,
                subtotal,
                shippingCost,
                total,
                customer?.first_name || null,
                customer?.last_name || null,
                customer?.email || null,
                customer?.phone || null,
                customer?.address || null,
                customer?.city || null,
                customer?.state || null,
                customer?.pincode || null,
            ]
        );

        const order = orderRes.rows[0];

        for (const item of items) {
            const p = byId.get(item.product_id);
            await client.query(
                `INSERT INTO order_items (
                    order_id, product_id, quantity, unit_price, product_type
                 ) VALUES ($1,$2,$3,$4,$5)`,
                [order.id, p.id, item.quantity, p.price, p.product_type]
            );
        }

        // Reserve stock (simple decrement on create)
        for (const item of items) {
            const p = byId.get(item.product_id);
            if (p.product_type === "physical") {
                await client.query(
                    `UPDATE products
                     SET stock_quantity = GREATEST(COALESCE(stock_quantity,0) - $1, 0)
                     WHERE id = $2`,
                    [item.quantity, p.id]
                );
            }
        }

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            data: {
                ...order,
                has_physical_items: hasPhysical,
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
 * User: list my orders
 */
const getMyOrders = async (req, res, next) => {
    try {
        const ordersRes = await query(
            `SELECT id, status, subtotal, shipping_cost, total, created_at, updated_at
             FROM orders
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, data: ordersRes.rows });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: mark an order as paid (simulates payment success)
 * Also creates entitlements for digital items.
 */
const adminMarkOrderPaid = async (req, res, next) => {
    const client = await getClient();
    try {
        const { id } = req.params;
        const { payment_provider, payment_reference } = req.body || {};

        await client.query("BEGIN");

        const orderRes = await client.query(
            `SELECT id, user_id, status FROM orders WHERE id = $1`,
            [id]
        );
        if (orderRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderRes.rows[0];
        if (order.status === "paid") {
            await client.query("COMMIT");
            return res.json({ success: true, message: "Order already paid" });
        }

        await client.query(
            `UPDATE orders
             SET status = 'paid',
                 payment_provider = COALESCE($2, payment_provider),
                 payment_reference = COALESCE($3, payment_reference)
             WHERE id = $1`,
            [id, payment_provider || null, payment_reference || null]
        );

        const itemsRes = await client.query(
            `SELECT oi.product_id, oi.product_type
             FROM order_items oi
             WHERE oi.order_id = $1`,
            [id]
        );

        const digitalProductIds = itemsRes.rows
            .filter((i) => i.product_type === "digital")
            .map((i) => i.product_id);

        for (const productId of digitalProductIds) {
            await client.query(
                `INSERT INTO product_entitlements (user_id, product_id, source, order_id, granted_by, note)
                 VALUES ($1,$2,'order',$3,$4,$5)
                 ON CONFLICT (user_id, product_id) DO NOTHING`,
                [
                    order.user_id,
                    productId,
                    id,
                    req.user.id,
                    "Granted by paid order",
                ]
            );
        }

        await client.query("COMMIT");
        res.json({ success: true, message: "Order marked as paid" });
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
 * Admin: list all orders
 */
const adminGetAllOrders = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT
                o.id,
                o.status,
                o.total,
                o.subtotal,
                o.shipping_cost,
                o.payment_provider,
                o.payment_reference,
                o.created_at,
                u.id as user_id,
                u.email as user_email,
                u.first_name,
                u.last_name,
                COUNT(oi.id) FILTER (WHERE oi.product_type = 'digital') as digital_items,
                COUNT(oi.id) FILTER (WHERE oi.product_type = 'physical') as physical_items
             FROM orders o
             JOIN users u ON u.id = o.user_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             GROUP BY o.id, u.id, u.email, u.first_name, u.last_name
             ORDER BY o.created_at DESC
             LIMIT 200`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: get one order (with items)
 */
const adminGetOrderById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const orderRes = await query(
            `SELECT
                o.*,
                u.email as user_email,
                u.first_name as user_first_name,
                u.last_name as user_last_name
             FROM orders o
             JOIN users u ON u.id = o.user_id
             WHERE o.id = $1
             LIMIT 1`,
            [id]
        );

        if (orderRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const itemsRes = await query(
            `SELECT
                oi.id,
                oi.product_id,
                oi.quantity,
                oi.unit_price,
                oi.product_type,
                p.name as product_name,
                p.slug as product_slug
             FROM order_items oi
             JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY oi.created_at ASC`,
            [id]
        );

        res.json({
            success: true,
            data: { order: orderRes.rows[0], items: itemsRes.rows },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createOrder,
    getMyOrders,
    adminMarkOrderPaid,
    adminGetAllOrders,
    adminGetOrderById,
};
