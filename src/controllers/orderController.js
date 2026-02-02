const { query, getClient } = require("../config/database");
const {
    calculateQuantityPrice,
    getNextPricingOption,
} = require("../utils/pricing");

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
            `SELECT id, name, price, product_type, stock_quantity, is_active, tiered_pricing, requires_kyc
             FROM products
             WHERE id = ANY($1::uuid[])`,
            [ids]
        );

        const byId = new Map(productsRes.rows.map((p) => [p.id, p]));

        // Check if any product requires KYC
        const hasKycProduct = productsRes.rows.some((p) => p.requires_kyc);

        if (hasKycProduct) {
            // KYC-required products need business owner status
            // Check user role and type
            const userCheck = await client.query(
                `SELECT role, user_type FROM users WHERE id = $1`,
                [req.user.id]
            );

            const userRole = userCheck.rows[0]?.role;
            const userType = userCheck.rows[0]?.user_type;

            // Admins bypass KYC requirements
            if (userRole === 'admin') {
                // Admin can purchase without KYC - skip to next validation
            } else {
                // Non-admin users need KYC verification

                // If student, tell them to upgrade to business
                if (userType === "student") {
                    await client.query("ROLLBACK");
                    return res.status(403).json({
                        success: false,
                        message:
                            "KYC-required products can only be purchased by business owners. Please upgrade your account by adding business information.",
                        requires_business_upgrade: true,
                        user_type: "student",
                    });
                }

                // Check if user has Product KYC (Business Owner KYC)
                const productKycCheck = await client.query(
                    `SELECT id, status FROM product_kyc_verifications WHERE user_id = $1`,
                    [req.user.id]
                );

                // If no Product KYC, they need to complete Business Owner KYC
                if (productKycCheck.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(403).json({
                        success: false,
                        message:
                            "Business Owner KYC verification is required before purchasing KYC-required products. Please complete your Business Owner KYC.",
                        requires_business_kyc: true,
                        kyc_status: "not_completed",
                    });
                }

                const productKyc = productKycCheck.rows[0];
                if (productKyc.status !== "verified") {
                    await client.query("ROLLBACK");
                    return res.status(403).json({
                        success: false,
                        message: `Your Business Owner KYC verification is ${productKyc.status}. Please complete and verify your Business Owner KYC before purchasing.`,
                        requires_business_kyc: true,
                        kyc_status: productKyc.status,
                    });
                }

                // Check if product terms accepted
                const productTermsCheck = await client.query(
                    `SELECT product_terms_accepted_at FROM users WHERE id = $1`,
                    [req.user.id]
                );

                if (!productTermsCheck.rows[0]?.product_terms_accepted_at) {
                    await client.query("ROLLBACK");
                    return res.status(403).json({
                        success: false,
                        message:
                            "Product terms acceptance is required before purchasing KYC-required products.",
                        requires_product_terms: true,
                    });
                }

                // Set user type to business_owner if not set
                if (!userType) {
                    await client.query(
                        "UPDATE users SET user_type = 'business_owner' WHERE id = $1",
                        [req.user.id]
                    );
                }
            }
        }

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

        // Calculate subtotal with quantity pricing
        let subtotal = 0;
        let totalDiscount = 0;
        const itemsWithPricing = [];

        for (const item of items) {
            const p = byId.get(item.product_id);
            const basePrice = Number(p.price);
            const quantity = Number(item.quantity || 1);

            // Calculate price for this quantity
            const pricingInfo = calculateQuantityPrice(
                basePrice,
                quantity,
                p.tiered_pricing || []
            );

            const itemTotal = pricingInfo.totalPrice;
            const regularTotal = basePrice * quantity;
            const itemSavings = pricingInfo.savings;

            subtotal += itemTotal;
            totalDiscount += itemSavings;

            itemsWithPricing.push({
                ...item,
                basePrice,
                totalPrice: itemTotal,
                pricePerItem: pricingInfo.pricePerItem,
                savings: itemSavings,
                isPricing: pricingInfo.isPricing,
                appliedPricing: pricingInfo.appliedPricing,
            });
        }

        subtotal = toMoney(subtotal);
        totalDiscount = toMoney(totalDiscount);
        const shippingCost = 0; // No shipping charges
        const total = toMoney(subtotal);

        const orderRes = await client.query(
            `INSERT INTO orders (
                user_id,
                status,
                subtotal,
                discount,
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
                $1,'pending',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
             )
             RETURNING id, status, subtotal, discount, shipping_cost, total, created_at`,
            [
                req.user.id,
                subtotal,
                totalDiscount,
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

        // Insert order items with pricing information
        for (const itemInfo of itemsWithPricing) {
            const p = byId.get(itemInfo.product_id);
            await client.query(
                `INSERT INTO order_items (
                    order_id, product_id, quantity, unit_price, custom_price, price_type, product_type
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    order.id,
                    p.id,
                    itemInfo.quantity,
                    itemInfo.basePrice,
                    itemInfo.isPricing ? itemInfo.totalPrice : null,
                    itemInfo.isPricing ? "bulk_pricing" : "regular",
                    p.product_type,
                ]
            );
        }

        // NOTE: Stock is NOT reduced here!
        // Stock will be reduced when payment is confirmed in paymentController.js
        // This prevents stock loss when users create orders but don't complete payment

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
