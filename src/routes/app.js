const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const appUserController = require("../controllers/appUserController");
const { authenticateAppUser } = require("../middleware/appAuth");
const {
    appSignupValidation,
    appVerifySignupValidation,
    appLoginValidation,
    appForgotPasswordValidation,
    appResetPasswordValidation,
    appSerialValidation,
} = require("../utils/validators");
const validate = require("../middleware/validate");

// Limited per account email (not IP — `trust proxy` is on, so client-supplied
// X-Forwarded-For would make an IP key trivially bypassable). Code checks are
// limited by the per-code attempt counter instead.
const appAuthLimiter = rateLimit({
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
        message: "Too many attempts. Please try again later.",
    },
});

// Public routes
router.post(
    "/auth/signup",
    appAuthLimiter,
    appSignupValidation,
    validate,
    appUserController.signup
);
router.post(
    "/auth/signup/verify",
    appVerifySignupValidation,
    validate,
    appUserController.verifySignup
);
router.post(
    "/auth/login",
    appAuthLimiter,
    appLoginValidation,
    validate,
    appUserController.login
);
router.post("/auth/refresh", appUserController.refresh);
router.post(
    "/auth/forgot-password",
    appAuthLimiter,
    appForgotPasswordValidation,
    validate,
    appUserController.forgotPassword
);
router.post(
    "/auth/reset-password",
    appResetPasswordValidation,
    validate,
    appUserController.resetPassword
);

// Protected routes (require an app login)
router.post("/auth/logout", authenticateAppUser, appUserController.logout);
router.get("/me", authenticateAppUser, appUserController.getMe);
router.post(
    "/serial",
    authenticateAppUser,
    appSerialValidation,
    validate,
    appUserController.submitSerial
);

module.exports = router;
