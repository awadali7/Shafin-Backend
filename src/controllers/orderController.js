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
            `SELECT id, name, price, product_type, stock_quantity, is_active, tiered_pricing, requires_kyc, weight, volumetric_weight, extra_shipping_charge
             FROM products
             WHERE id = ANY($1::uuid[])`,
            [ids]
        );

        const byId = new Map(productsRes.rows.map((p) => [p.id, p]));

        // Check if any product requires KYC
        const hasKycProduct = productsRes.rows.some((p) => p.requires_kyc);

        if (hasKycProduct) {
            // Admins bypass KYC requirements
            const userCheck = await client.query(
                `SELECT role, user_type FROM users WHERE id = $1`,
                [req.user.id]
            );

            const userRole = userCheck.rows[0]?.role;
            const userType = userCheck.rows[0]?.user_type;

            if (userRole !== "admin") {
                // Calculate total quantity of KYC products
                const kycQuantity = items
                    .filter((item) => byId.get(item.product_id)?.requires_kyc)
                    .reduce(
                        (sum, item) =>
                            sum + (parseInt(item.quantity) || 1),
                        0
                    );

                // 1. Check if user has Verified Business (Product) KYC
                const productKycCheck = await client.query(
                    `SELECT status FROM product_kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
                    [req.user.id]
                );

                const isBusinessVerified =
                    productKycCheck.rows[0]?.status === "verified";

                if (isBusinessVerified) {
                    // Business owner verified - Allow bulk purchase
                    // Ensure user_type is updated if not already
                    if (userType !== "business_owner") {
                        await client.query(
                            "UPDATE users SET user_type = 'business_owner' WHERE id = $1",
                            [req.user.id]
                        );
                    }
                } else {
                    // Not business verified - Check for Student KYC (Single quantity only)
                    const studentKycCheck = await client.query(
                        `SELECT status FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
                        [req.user.id]
                    );

                    const isStudentVerified =
                        studentKycCheck.rows[0]?.status === "verified";

                    if (!isStudentVerified) {
                        // Neither Business nor Student KYC verified
                        await client.query("ROLLBACK");
                        return res.status(403).json({
                            success: false,
                            message:
                                "KYC verification is required to purchase this product. Please complete your Student KYC or Business KYC.",
                            requires_business_kyc: true,
                        });
                    }

                    // Student is verified - Check quantity
                    if (kycQuantity > 1) {
                        await client.query("ROLLBACK");
                        return res.status(403).json({
                            success: false,
                            message:
                                "Students can only purchase a single quantity of KYC-required products. Please upgrade to a Business account for bulk orders.",
                            single_quantity_required: true,
                            requires_business_upgrade: true,
                        });
                    }
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
                        requires_product_terms_acceptance: true,
                    });
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

        // Fetch shipping origin and courier settings
        const settingsRes = await client.query(
            "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('shipping_origin_city', 'shipping_origin_state', 'local_base_weight', 'local_base_rate', 'local_additional_weight', 'local_additional_rate', 'regional_base_weight', 'regional_base_rate', 'regional_additional_weight', 'regional_additional_rate', 'national_base_weight', 'national_base_rate', 'national_additional_weight', 'national_additional_rate')"
        );
        const settings = {};
        settingsRes.rows.forEach((r) => (settings[r.setting_key] = r.setting_value));
        const originCity = settings.shipping_origin_city || "Ernakulam";
        const originState = settings.shipping_origin_state || "Kerala";

        // Determine Shipping Zone
        let zone = "national";
        if (customer?.city?.trim().toLowerCase() === originCity.trim().toLowerCase()) {
            zone = "local";
        } else if (customer?.state?.trim().toLowerCase() === originState.trim().toLowerCase()) {
            zone = "regional";
        }

        // Calculate totals with quantity pricing and zone-based shipping
        let itemsSubtotal = 0;
        let totalWeight = 0;
        let totalDiscount = 0;
        const itemsWithPricing = [];

        for (const item of items) {
            const p = byId.get(item.product_id);
            const basePrice = Number(p.price);
            const quantity = Number(item.quantity || 1);
            const weight = Number(p.weight ?? 0); // Default to 0kg if not set
            const volWeight = Number(p.volumetric_weight ?? 0);
            const extraShippingCharge = Number(p.extra_shipping_charge ?? 0);
            const chargeableWeight = Math.max(weight, volWeight); // Whichever is higher

            if (p.product_type === 'physical') {
                totalWeight += chargeableWeight * quantity;
                totalShippingCost += extraShippingCharge * quantity; // Base extra charges accumulated
            }

            // Calculate pricing for this quantity and zone
            const pricingInfo = calculateQuantityPrice(
                basePrice,
                quantity,
                p.tiered_pricing || [],
                zone
            );

            const itemItemsTotal = pricingInfo.itemsTotal; // Total for items only
            const itemSavings = pricingInfo.savings;

            itemsSubtotal += itemItemsTotal;
            totalDiscount += itemSavings;

            itemsWithPricing.push({
                ...item,
                basePrice,
                totalPrice: pricingInfo.totalPrice, // Items + Shipping for this item
                pricePerItem: pricingInfo.pricePerItem,
                courierCharge: 0, // No longer tracked per item
                savings: itemSavings,
                isPricing: pricingInfo.isPricing,
                appliedPricing: pricingInfo.appliedPricing,
            });
        }

        let totalShippingCost = 0;

        if (hasPhysical && totalWeight > 0) {
            let baseWeight, baseRate, addWeight, addRate;

            if (zone === 'local') {
                baseWeight = Number(settings.local_base_weight || 1000);
                baseRate = Number(settings.local_base_rate || 50);
                addWeight = Number(settings.local_additional_weight || 1000);
                addRate = Number(settings.local_additional_rate || 40);
            } else if (zone === 'regional') {
                baseWeight = Number(settings.regional_base_weight || 1000);
                baseRate = Number(settings.regional_base_rate || 70);
                addWeight = Number(settings.regional_additional_weight || 1000);
                addRate = Number(settings.regional_additional_rate || 60);
            } else {
                baseWeight = Number(settings.national_base_weight || 1000);
                baseRate = Number(settings.national_base_rate || 100);
                addWeight = Number(settings.national_additional_weight || 1000);
                addRate = Number(settings.national_additional_rate || 90);
            }

            if (totalWeight <= baseWeight) {
                totalShippingCost = baseRate;
            } else {
                const extraWeight = totalWeight - baseWeight;
                const extraSlabs = Math.ceil(extraWeight / addWeight);
                totalShippingCost = baseRate + (extraSlabs * addRate);
            }
        }

        const subtotal = toMoney(itemsSubtotal);
        const shippingCost = toMoney(totalShippingCost);
        totalDiscount = toMoney(totalDiscount);
        const total = toMoney(subtotal + shippingCost);


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
             RETURNING id, order_number, status, subtotal, discount, shipping_cost, total, created_at`,
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
        } catch { }
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
            `SELECT id, order_number, status, subtotal, shipping_cost, total, 
                    tracking_number, tracking_url, estimated_delivery_date, 
                    shipped_at, delivered_at, origin_city, destination_city,
                    courier_service_type, tracking_history, created_at, updated_at
             FROM orders
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        // For each order, fetch its items with product details
        const ordersWithItems = await Promise.all(
            ordersRes.rows.map(async (order) => {
                // Get product items
                const productItemsRes = await query(
                    `SELECT
                        oi.id,
                        oi.product_id,
                        oi.quantity,
                        oi.unit_price,
                        oi.product_type,
                        p.name as product_name,
                        p.slug as product_slug,
                        p.cover_image
                     FROM order_items oi
                     JOIN products p ON p.id = oi.product_id
                     WHERE oi.order_id = $1
                     ORDER BY oi.created_at ASC`,
                    [order.id]
                );

                // Get course items
                const courseItemsRes = await query(
                    `SELECT
                        id,
                        course_id as product_id,
                        1 as quantity,
                        course_price as unit_price,
                        'digital' as product_type,
                        course_name as product_name,
                        '' as product_slug
                     FROM course_orders
                     WHERE order_id = $1`,
                    [order.id]
                );

                return {
                    ...order,
                    items: [...productItemsRes.rows, ...courseItemsRes.rows]
                };
            })
        );

        res.json({ success: true, data: ordersWithItems });
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
        } catch { }
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
                o.order_number,
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
                (COUNT(DISTINCT oi.id) FILTER (WHERE oi.product_type = 'digital') + COUNT(DISTINCT co.id)) as digital_items,
                (COUNT(DISTINCT oi.id) FILTER (WHERE oi.product_type = 'physical')) as physical_items,
                COALESCE(STRING_AGG(DISTINCT p.name, ', '), '') || 
                CASE 
                    WHEN COUNT(DISTINCT co.id) > 0 THEN 
                        (CASE WHEN STRING_AGG(DISTINCT p.name, ', ') IS NOT NULL THEN ', ' ELSE '' END) || 
                        STRING_AGG(DISTINCT co.course_name, ', ')
                    ELSE '' 
                END as item_names
             FROM orders o
             JOIN users u ON u.id = o.user_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN products p ON p.id = oi.product_id
             LEFT JOIN course_orders co ON co.order_id = o.id
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
                o.id,
                o.order_number,
                o.status,
                o.payment_provider,
                o.payment_reference,
                o.subtotal,
                o.discount,
                o.shipping_cost,
                o.total,
                o.first_name,
                o.last_name,
                o.email,
                o.phone,
                o.address,
                o.city,
                o.state,
                o.pincode,
                o.tracking_number,
                o.tracking_url,
                o.estimated_delivery_date,
                o.shipped_at,
                o.delivered_at,
                o.origin_city,
                o.destination_city,
                o.courier_service_type,
                o.tracking_history,
                o.created_at,
                o.updated_at,
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

        const productItemsRes = await query(
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

        const courseItemsRes = await query(
            `SELECT
                id,
                course_id as product_id,
                1 as quantity,
                course_price as unit_price,
                'digital' as product_type,
                course_name as product_name,
                '' as product_slug
             FROM course_orders
             WHERE order_id = $1`,
            [id]
        );

        res.json({
            success: true,
            data: {
                order: orderRes.rows[0],
                items: [...productItemsRes.rows, ...courseItemsRes.rows]
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: update tracking information for an order
 */
const adminUpdateTracking = async (req, res, next) => {
    const client = await getClient();
    try {
        const { id } = req.params;
        const {
            status,
            tracking_number,
            tracking_url,
            estimated_delivery_date,
            shipped_at,
            delivered_at,
            origin_city,
            destination_city,
            courier_service_type,
            tracking_history
        } = req.body || {};

        const orderRes = await client.query("SELECT status FROM orders WHERE id = $1", [id]);
        if (orderRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const currentStatus = orderRes.rows[0].status;
        let targetStatus = status !== undefined ? status : currentStatus;

        // Status Automation
        if (delivered_at) {
            targetStatus = "delivered";
        } else if (shipped_at && (targetStatus === "paid" || targetStatus === "processing")) {
            targetStatus = "shipped";
        }

        // Build dynamic update query
        const updates = [];
        const values = [id];
        let paramCount = 2;

        if (targetStatus !== currentStatus || status !== undefined) {
            updates.push(`status = $${paramCount}`);
            values.push(targetStatus);
            paramCount++;
        }

        if (tracking_number !== undefined) {
            updates.push(`tracking_number = $${paramCount}`);
            values.push(tracking_number || null);
            paramCount++;
        }

        if (tracking_url !== undefined) {
            updates.push(`tracking_url = $${paramCount}`);
            values.push(tracking_url || null);
            paramCount++;
        }

        if (estimated_delivery_date !== undefined) {
            updates.push(`estimated_delivery_date = $${paramCount}`);
            values.push(estimated_delivery_date || null);
            paramCount++;
        }

        if (shipped_at !== undefined) {
            updates.push(`shipped_at = $${paramCount}`);
            values.push(shipped_at || null);
            paramCount++;
        }

        if (delivered_at !== undefined) {
            updates.push(`delivered_at = $${paramCount}`);
            values.push(delivered_at || null);
            paramCount++;
        }

        if (origin_city !== undefined) {
            updates.push(`origin_city = $${paramCount}`);
            values.push(origin_city || null);
            paramCount++;
        }

        if (destination_city !== undefined) {
            updates.push(`destination_city = $${paramCount}`);
            values.push(destination_city || null);
            paramCount++;
        }

        if (courier_service_type !== undefined) {
            updates.push(`courier_service_type = $${paramCount}`);
            values.push(courier_service_type || null);
            paramCount++;
        }

        if (tracking_history !== undefined) {
            updates.push(`tracking_history = $${paramCount}`);
            values.push(Array.isArray(tracking_history) ? JSON.stringify(tracking_history) : null);
            paramCount++;
        }

        if (updates.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "No fields to update",
            });
        }

        const updateQuery = `
            UPDATE orders
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING *
        `;

        const result = await client.query(updateQuery, values);

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Tracking information updated successfully",
            data: result.rows[0],
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch { }
        next(error);
    } finally {
        client.release();
    }
};

module.exports = {
    createOrder,
    getMyOrders,
    adminMarkOrderPaid,
    adminGetAllOrders,
    adminGetOrderById,
    adminUpdateTracking,
};
