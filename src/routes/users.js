const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const entitlementController = require("../controllers/entitlementController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

router.get("/profile", userController.getProfile);
router.put("/profile", userController.updateProfile);
router.post("/accept-terms", userController.acceptTerms);
router.get("/dashboard", userController.getUserDashboard);
router.get("/courses", userController.getUserCourses);
router.get("/courses/:courseId/progress", userController.getCourseProgress);
router.get(
    "/product-entitlements",
    entitlementController.getMyProductEntitlements
);

module.exports = router;
