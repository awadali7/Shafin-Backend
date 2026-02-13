const express = require("express");
const router = express.Router();

const orderController = require("../controllers/orderController");
const { authenticate, isAdmin } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// User routes
router.post("/", orderController.createOrder);
router.get("/my", orderController.getMyOrders);

// Admin routes
router.get("/admin/all", isAdmin, orderController.adminGetAllOrders);
router.get("/admin/:id", isAdmin, orderController.adminGetOrderById);
router.post("/:id/mark-paid", isAdmin, orderController.adminMarkOrderPaid);
router.patch("/:id/tracking", isAdmin, orderController.adminUpdateTracking);

module.exports = router;
