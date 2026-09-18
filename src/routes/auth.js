const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const {
    registerValidation,
    loginValidation,
    appLoginValidation,
    appVerifyOtpValidation,
} = require("../utils/validators");
const validate = require("../middleware/validate");

// Pinout app login is limited per account email (not IP — `trust proxy` is on,
// so client-supplied X-Forwarded-For would make an IP key trivially bypassable).
const pinoutLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    validate: { trustProxy: false },
    keyGenerator: (req) =>
        String(req.body?.email || "").trim().toLowerCase() || req.ip,
    message: {
        success: false,
        code: "RATE_LIMITED",
        message: "Too many login attempts. Please try again later.",
    },
});

// Public routes
router.post("/register", registerValidation, validate, authController.register);
router.post("/login", loginValidation, validate, authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/refresh", authController.refreshToken);

// Pinout app (email OTP + single-device lock)
router.post(
    "/app/login",
    pinoutLoginLimiter,
    appLoginValidation,
    validate,
    authController.appLogin
);
router.post(
    "/app/verify-otp",
    appVerifyOtpValidation,
    validate,
    authController.appVerifyOtp
);

// Protected routes (require authentication)
router.post("/logout", authenticate, authController.logout);
router.get("/sessions", authenticate, authController.getActiveSessions);

module.exports = router;
