const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const entitlementController = require("../controllers/entitlementController");
const digitalController = require("../controllers/digitalController");
const { authenticate, isAdmin } = require("../middleware/auth");

// All routes require admin authentication
router.use(authenticate);
router.use(isAdmin);

router.get("/dashboard", adminController.getDashboard);
router.get("/users", adminController.getAllUsers);
router.get("/users/:id/login-details", adminController.getUserLoginDetails);
router.get("/requests", adminController.getAllRequests);
router.get("/course-purchases", adminController.getAllCoursePurchases);
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

// Digital File Library
router.get("/digital-files", digitalController.listDigitalFiles);
router.post(
    "/digital-files",
    digitalController.upload.single("file"),
    digitalController.uploadDigitalFile
);
router.delete("/digital-files/:filename", digitalController.deleteDigitalFile);
router.get("/digital-files/:filename/download", digitalController.downloadDigitalFile);

module.exports = router;
