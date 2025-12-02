const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { registerValidation, loginValidation } = require("../utils/validators");
const validate = require("../middleware/validate");

// Public routes
router.post("/register", registerValidation, validate, authController.register);
router.post("/login", loginValidation, validate, authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/refresh", authController.refreshToken);

// Protected routes (require authentication)
router.post("/logout", authenticate, authController.logout);
router.get("/sessions", authenticate, authController.getActiveSessions);

module.exports = router;
