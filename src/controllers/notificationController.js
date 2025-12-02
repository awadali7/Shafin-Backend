const { query } = require("../config/database");
const webpush = require("web-push");

// Configure web-push (you'll need to set VAPID keys in .env)
if (
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

/**
 * Create a notification
 */
const createNotification = async (
    userId,
    type,
    title,
    message,
    data = null
) => {
    try {
        // Validate inputs
        if (!userId || !type || !title || !message) {
            console.error("Missing required fields for notification:", {
                userId,
                type,
                title,
                message,
            });
            return null;
        }

        const result = await query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [userId, type, title, message, data ? JSON.stringify(data) : null]
        );

        console.log(`✅ Notification created: ${type} for user ${userId}`);

        // Send push notification if user has subscriptions (don't wait, don't fail if it errors)
        sendPushNotification(userId, {
            title,
            body: message,
            data: data || {},
            tag: type,
        }).catch((err) => {
            console.error(
                "Error sending push notification (non-critical):",
                err
            );
        });

        return result.rows[0];
    } catch (error) {
        console.error("Error creating notification:", error);
        // Don't throw - notifications are non-critical
        return null;
    }
};

/**
 * Send push notification to user's devices
 */
const sendPushNotification = async (userId, payload) => {
    try {
        // Get user's active push subscriptions
        const subscriptions = await query(
            `SELECT endpoint, p256dh, auth 
             FROM push_subscriptions 
             WHERE user_id = $1 AND is_active = true`,
            [userId]
        );

        if (subscriptions.rows.length === 0) {
            return; // No subscriptions
        }

        const notificationPayload = JSON.stringify(payload);

        // Send to all user's devices
        const promises = subscriptions.rows.map((sub) => {
            const subscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                },
            };

            return webpush
                .sendNotification(subscription, notificationPayload)
                .catch((err) => {
                    // If subscription is invalid, mark it as inactive
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        query(
                            `UPDATE push_subscriptions 
                             SET is_active = false 
                             WHERE endpoint = $1`,
                            [sub.endpoint]
                        ).catch(console.error);
                    }
                    console.error("Error sending push notification:", err);
                });
        });

        await Promise.allSettled(promises);
    } catch (error) {
        console.error("Error in sendPushNotification:", error);
        // Don't throw - push notifications are optional
    }
};

/**
 * Get VAPID public key (for frontend)
 */
const getVapidPublicKey = async (req, res, next) => {
    try {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        if (!publicKey) {
            return res.status(503).json({
                success: false,
                message: "Push notifications not configured",
            });
        }

        res.json({
            success: true,
            data: {
                publicKey,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user's notifications
 */
const getMyNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { limit = 50, offset = 0, unread_only = false } = req.query;

        let queryText = `
            SELECT 
                id,
                type,
                title,
                message,
                data,
                is_read,
                read_at,
                created_at
             FROM notifications
             WHERE user_id = $1
        `;

        const params = [userId];
        let paramCount = 2;

        if (unread_only === "true") {
            queryText += ` AND is_read = false`;
        }

        queryText += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params);

        // Get unread count
        const unreadCountResult = await query(
            `SELECT COUNT(*) as count 
             FROM notifications 
             WHERE user_id = $1 AND is_read = false`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                notifications: result.rows.map((notif) => {
                    let parsedData = null;
                    if (notif.data) {
                        try {
                            // PostgreSQL JSONB might already be an object or a string
                            parsedData =
                                typeof notif.data === "string"
                                    ? JSON.parse(notif.data)
                                    : notif.data;
                        } catch (e) {
                            console.error(
                                "Error parsing notification data:",
                                e
                            );
                            parsedData = null;
                        }
                    }
                    return {
                        ...notif,
                        data: parsedData,
                    };
                }),
                unread_count: parseInt(unreadCountResult.rows[0].count),
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Mark notification as read
 */
const markAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await query(
            `UPDATE notifications 
             SET is_read = true, read_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        let parsedData = null;
        if (result.rows[0].data) {
            try {
                parsedData =
                    typeof result.rows[0].data === "string"
                        ? JSON.parse(result.rows[0].data)
                        : result.rows[0].data;
            } catch (e) {
                console.error("Error parsing notification data:", e);
                parsedData = null;
            }
        }

        res.json({
            success: true,
            data: {
                ...result.rows[0],
                data: parsedData,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;

        await query(
            `UPDATE notifications 
             SET is_read = true, read_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND is_read = false`,
            [userId]
        );

        res.json({
            success: true,
            message: "All notifications marked as read",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Register push subscription
 */
const registerPushSubscription = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { endpoint, keys, userAgent, deviceInfo } = req.body;

        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({
                success: false,
                message: "Invalid push subscription data",
            });
        }

        // Upsert subscription
        const result = await query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_info, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             ON CONFLICT (user_id, endpoint) 
             DO UPDATE SET 
                 p256dh = EXCLUDED.p256dh,
                 auth = EXCLUDED.auth,
                 user_agent = EXCLUDED.user_agent,
                 device_info = EXCLUDED.device_info,
                 is_active = true,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                userId,
                endpoint,
                keys.p256dh,
                keys.auth,
                userAgent || null,
                deviceInfo ? JSON.stringify(deviceInfo) : null,
            ]
        );

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Unregister push subscription
 */
const unregisterPushSubscription = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({
                success: false,
                message: "Endpoint is required",
            });
        }

        await query(
            `UPDATE push_subscriptions 
             SET is_active = false 
             WHERE user_id = $1 AND endpoint = $2`,
            [userId, endpoint]
        );

        res.json({
            success: true,
            message: "Push subscription unregistered",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createNotification,
    sendPushNotification,
    getVapidPublicKey,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    registerPushSubscription,
    unregisterPushSubscription,
};
