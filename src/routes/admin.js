const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const entitlementController = require("../controllers/entitlementController");
const { authenticate, isAdmin } = require("../middleware/auth");

// All routes require admin authentication
router.use(authenticate);
router.use(isAdmin);

router.get("/dashboard", adminController.getDashboard);
router.get("/users", adminController.getAllUsers);
router.get("/users/:id/login-details", adminController.getUserLoginDetails);
router.get("/requests", adminController.getAllRequests);
router.post("/users", adminController.createUser);
router.put("/users/:id", adminController.updateUser);
router.delete("/users/:id", adminController.deleteUser);
router.post("/announcements", adminController.createAnnouncement);
router.get("/announcements", adminController.getAnnouncements);

// Product entitlements (free grants)
router.post(
    "/product-entitlements/grant",
    entitlementController.adminGrantProductToUser
);

module.exports = router;
