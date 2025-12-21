const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const { authenticate } = require("../middleware/auth");

// Razorpay: create order + verify payment (JSON)
// Note: JSON parser is applied globally in app.js for /api/payments
router.post(
    "/razorpay/order",
    authenticate,
    paymentController.createRazorpayOrder
);

router.post(
    "/razorpay/verify",
    authenticate,
    paymentController.verifyRazorpayPayment
);

// Razorpay webhook needs RAW body for signature verification
router.post(
    "/razorpay/webhook",
    express.raw({ type: "application/json" }),
    paymentController.razorpayWebhook
);

module.exports = router;
