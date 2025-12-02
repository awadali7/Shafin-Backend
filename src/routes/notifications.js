const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

// Get VAPID public key (public endpoint)
router.get("/vapid-key", notificationController.getVapidPublicKey);

// All other notification routes require authentication
router.use(authenticate);

// Get user's notifications
router.get("/", notificationController.getMyNotifications);

// Mark notification as read
router.put("/:id/read", notificationController.markAsRead);

// Mark all notifications as read
router.put("/read-all", notificationController.markAllAsRead);

// Register push subscription
router.post("/push/subscribe", notificationController.registerPushSubscription);

// Unregister push subscription
router.post(
    "/push/unsubscribe",
    notificationController.unregisterPushSubscription
);

module.exports = router;
