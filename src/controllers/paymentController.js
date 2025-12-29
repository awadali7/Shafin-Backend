const crypto = require("crypto");
const { getClient } = require("../config/database");
const { getRazorpayClient } = require("../config/razorpay");

function toPaise(amountInRupees) {
    const n = Number(amountInRupees);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
}

function verifyRazorpayPaymentSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    key_secret,
}) {
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
        .createHmac("sha256", key_secret)
        .update(payload)
        .digest("hex");
    return expected === razorpay_signature;
}

async function grantDigitalEntitlementsForOrder(
    client,
    orderId,
    userId,
    grantedBy
) {
    const itemsRes = await client.query(
        `SELECT product_id, product_type
         FROM order_items
         WHERE order_id = $1`,
        [orderId]
    );

    const digitalIds = itemsRes.rows
        .filter((i) => i.product_type === "digital")
        .map((i) => i.product_id);

    for (const productId of digitalIds) {
        await client.query(
            `INSERT INTO product_entitlements (user_id, product_id, source, order_id, granted_by, note)
             VALUES ($1,$2,'order',$3,$4,$5)
             ON CONFLICT (user_id, product_id) DO NOTHING`,
            [userId, productId, orderId, grantedBy, "Granted by paid order"]
        );
    }
}

/**
 * User: create a Razorpay order for an internal order (pending)
 * body: { order_id }
 */
const createRazorpayOrder = async (req, res, next) => {
    const client = await getClient();
    try {
        const { order_id } = req.body || {};
        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: "order_id is required",
            });
        }

        await client.query("BEGIN");

        const orderRes = await client.query(
            `SELECT id, user_id, status, total, payment_reference
             FROM orders
             WHERE id = $1
             LIMIT 1`,
            [order_id]
        );
        if (orderRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderRes.rows[0];
        if (order.user_id !== req.user.id) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "Not allowed",
            });
        }

        if (order.status !== "pending") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: `Order is not pending (status: ${order.status})`,
            });
        }

        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            await client.query("ROLLBACK");
            return res.status(500).json({
                success: false,
                message:
                    "Razorpay is not configured. Missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET.",
            });
        }

        const razorpay = getRazorpayClient();
        const amount = toPaise(order.total);

        // If we already created a Razorpay order and stored it, reuse it
        if (
            order.payment_reference &&
            String(order.payment_reference).startsWith("order_")
        ) {
            await client.query("COMMIT");
            return res.json({
                success: true,
                data: {
                    key_id: keyId,
                    razorpay_order_id: order.payment_reference,
                    amount,
                    currency: "INR",
                    internal_order_id: order.id,
                },
            });
        }

        const rpOrder = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `order_${order.id.substring(0, 8)}`,
            notes: {
                internal_order_id: order.id,
                user_id: order.user_id,
            },
        });

        await client.query(
            `UPDATE orders
             SET payment_provider = 'razorpay',
                 payment_reference = $2
             WHERE id = $1`,
            [order.id, rpOrder.id]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            data: {
                key_id: keyId,
                razorpay_order_id: rpOrder.id,
                amount,
                currency: rpOrder.currency || "INR",
                internal_order_id: order.id,
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
 * User: verify Razorpay payment and mark order paid (unlocks entitlements)
 * body: { internal_order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
const verifyRazorpayPayment = async (req, res, next) => {
    const client = await getClient();
    try {
        const {
            internal_order_id,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body || {};

        if (
            !internal_order_id ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "internal_order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature are required",
            });
        }

        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keySecret) {
            return res.status(500).json({
                success: false,
                message: "Missing RAZORPAY_KEY_SECRET",
            });
        }

        const ok = verifyRazorpayPaymentSignature({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            key_secret: keySecret,
        });

        if (!ok) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment signature",
            });
        }

        await client.query("BEGIN");

        const orderRes = await client.query(
            `SELECT id, user_id, status, payment_reference
             FROM orders
             WHERE id = $1
             LIMIT 1`,
            [internal_order_id]
        );
        if (orderRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderRes.rows[0];
        if (order.user_id !== req.user.id) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "Not allowed",
            });
        }

        // Optional safety: ensure the razorpay_order_id matches what we stored
        if (
            order.payment_reference &&
            order.payment_reference !== razorpay_order_id
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "Payment order mismatch",
            });
        }

        if (order.status === "paid") {
            // Already paid, skip
            await client.query("COMMIT");
            return res.json({
                success: true,
                message: "Order already marked as paid",
            });
        }

        await client.query(
            `UPDATE orders
             SET status = 'paid',
                 payment_provider = 'razorpay',
                 payment_reference = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [order.id, razorpay_payment_id]
        );

        // Grant entitlements based on order type
        // Check if this is a course order or product order
        const courseOrderCheck = await client.query(
            `SELECT course_id FROM course_orders WHERE order_id = $1`,
            [order.id]
        );

        if (courseOrderCheck.rows.length > 0) {
            // This is a course order - grant course access
            const courseId = courseOrderCheck.rows[0].course_id;

            // Grant course access (lifetime access - set access_end far in future, 100 years)
            const accessEnd = new Date();
            accessEnd.setFullYear(accessEnd.getFullYear() + 100);

            // Check if course access already exists
            const existingAccess = await client.query(
                `SELECT id FROM course_access WHERE user_id = $1 AND course_id = $2`,
                [order.user_id, courseId]
            );

            if (existingAccess.rows.length === 0) {
                await client.query(
                    `INSERT INTO course_access (user_id, course_id, access_start, access_end, is_active, granted_by)
                     VALUES ($1, $2, CURRENT_TIMESTAMP, $3, true, $4)`,
                    [order.user_id, courseId, accessEnd, req.user.id]
                );
            } else {
                // Update existing access to be active
                await client.query(
                    `UPDATE course_access 
                     SET is_active = true, 
                         access_end = $1,
                         granted_by = $2,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = $3 AND course_id = $4`,
                    [accessEnd, req.user.id, order.user_id, courseId]
                );
            }

            // Unlock all videos for the course
            await client.query(
                `INSERT INTO video_progress (user_id, video_id, course_id, is_unlocked, unlocked_at)
                 SELECT $1, v.id, $2, true, CURRENT_TIMESTAMP
                 FROM videos v
                 WHERE v.course_id = $2 AND v.is_active = true
                 ON CONFLICT (user_id, video_id) 
                 DO UPDATE SET is_unlocked = true, unlocked_at = CURRENT_TIMESTAMP`,
                [order.user_id, courseId]
            );
        } else {
            // This is a product order - grant digital entitlements
            await grantDigitalEntitlementsForOrder(
                client,
                order.id,
                order.user_id,
                req.user.id
            );
        }

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Payment verified and order marked as paid",
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
 * Razorpay webhook handler
 * Verifies signature with RAZORPAY_WEBHOOK_SECRET.
 * Handles multiple payment events:
 * - payment.captured: Mark order as paid and grant entitlements
 * - payment.failed: Mark order as failed
 * - order.paid: Alternative confirmation for paid orders
 * - refund.created: Mark refund initiated
 * - refund.processed: Mark refund completed
 */
const razorpayWebhook = async (req, res, next) => {
    const client = await getClient();
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
            return res.status(500).send("Missing RAZORPAY_WEBHOOK_SECRET");
        }

        const signature = req.headers["x-razorpay-signature"];
        const body = req.body; // raw Buffer
        if (!signature || !Buffer.isBuffer(body)) {
            return res.status(400).send("Invalid webhook payload");
        }

        const expected = crypto
            .createHmac("sha256", webhookSecret)
            .update(body)
            .digest("hex");

        if (expected !== signature) {
            return res.status(400).send("Invalid signature");
        }

        const payload = JSON.parse(body.toString("utf8"));
        const event = payload?.event;

        // Handle different event types
        switch (event) {
            case "payment.captured":
            case "order.paid": {
                // Handle successful payment
                const entity =
                    payload?.payload?.payment?.entity ||
                    payload?.payload?.order?.entity;
                const razorpayOrderId = entity?.order_id || entity?.id;
                const razorpayPaymentId =
                    entity?.id || entity?.payments?.[0]?.id;

                if (!razorpayOrderId) {
                    return res.status(200).send("No order_id");
                }

                await client.query("BEGIN");

                const orderRes = await client.query(
                    `SELECT id, user_id, status
                     FROM orders
                     WHERE payment_provider = 'razorpay'
                     AND payment_reference = $1
                     LIMIT 1`,
                    [razorpayOrderId]
                );

                if (orderRes.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(200).send("No matching internal order");
                }

                const order = orderRes.rows[0];

                if (order.status === "paid") {
                    // Already processed
                    await client.query("COMMIT");
                    return res.status(200).send("OK");
                }

                await client.query(
                    `UPDATE orders
                     SET status = 'paid',
                         payment_provider = 'razorpay',
                         payment_reference = COALESCE($2, payment_reference),
                         updated_at = NOW()
                     WHERE id = $1`,
                    [order.id, razorpayPaymentId || null]
                );

                // Grant entitlements based on order type
                const courseOrderCheck = await client.query(
                    `SELECT course_id FROM course_orders WHERE order_id = $1`,
                    [order.id]
                );

                if (courseOrderCheck.rows.length > 0) {
                    // This is a course order - grant course access
                    const courseId = courseOrderCheck.rows[0].course_id;

                    // Grant course access (lifetime access - set access_end far in future, 100 years)
                    const accessEnd = new Date();
                    accessEnd.setFullYear(accessEnd.getFullYear() + 100);

                    // Check if course access already exists
                    const existingAccess = await client.query(
                        `SELECT id FROM course_access WHERE user_id = $1 AND course_id = $2`,
                        [order.user_id, courseId]
                    );

                    if (existingAccess.rows.length === 0) {
                        await client.query(
                            `INSERT INTO course_access (user_id, course_id, access_start, access_end, is_active, granted_by)
                             VALUES ($1, $2, CURRENT_TIMESTAMP, $3, true, NULL)`,
                            [order.user_id, courseId, accessEnd]
                        );
                    } else {
                        await client.query(
                            `UPDATE course_access 
                             SET is_active = true, 
                                 access_end = $1,
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE user_id = $2 AND course_id = $3`,
                            [accessEnd, order.user_id, courseId]
                        );
                    }

                    // Unlock all videos for the course
                    await client.query(
                        `INSERT INTO video_progress (user_id, video_id, course_id, is_unlocked, unlocked_at)
                         SELECT $1, v.id, $2, true, CURRENT_TIMESTAMP
                         FROM videos v
                         WHERE v.course_id = $2 AND v.is_active = true
                         ON CONFLICT (user_id, video_id) 
                         DO UPDATE SET is_unlocked = true, unlocked_at = CURRENT_TIMESTAMP`,
                        [order.user_id, courseId]
                    );
                } else {
                    // This is a product order - grant digital entitlements
                    await grantDigitalEntitlementsForOrder(
                        client,
                        order.id,
                        order.user_id,
                        null
                    );
                }

                await client.query("COMMIT");
                return res.status(200).send("OK");
            }

            case "payment.failed": {
                // Handle failed payment
                const entity = payload?.payload?.payment?.entity;
                const razorpayOrderId = entity?.order_id;

                if (!razorpayOrderId) {
                    return res.status(200).send("No order_id");
                }

                await client.query("BEGIN");

                const orderRes = await client.query(
                    `SELECT id, status
                     FROM orders
                     WHERE payment_provider = 'razorpay'
                     AND payment_reference = $1
                     LIMIT 1`,
                    [razorpayOrderId]
                );

                if (orderRes.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(200).send("No matching internal order");
                }

                const order = orderRes.rows[0];

                // Only update if still pending
                if (order.status === "pending") {
                    await client.query(
                        `UPDATE orders
                         SET status = 'failed',
                             updated_at = NOW()
                         WHERE id = $1`,
                        [order.id]
                    );
                }

                await client.query("COMMIT");
                return res.status(200).send("OK");
            }

            case "refund.created":
            case "refund.processed": {
                // Handle refunds (optional - for future implementation)
                // You can add refund tracking logic here
                return res.status(200).send("OK");
            }

            default:
                // Ignore other events
                return res.status(200).send("Ignored");
        }
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        // Log error but return 200 to prevent Razorpay from retrying
        console.error("Webhook error:", error);
        return res.status(200).send("Error processed");
    } finally {
        client.release();
    }
};

module.exports = {
    createRazorpayOrder,
    verifyRazorpayPayment,
    razorpayWebhook,
};
