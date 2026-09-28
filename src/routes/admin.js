const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const entitlementController = require("../controllers/entitlementController");
const digitalController = require("../controllers/digitalController");
const courierBoxController = require("../controllers/courierBoxController");
const appUserController = require("../controllers/appUserController");
const { authenticate, isAdmin } = require("../middleware/auth");
const {
    appUserIdValidation,
    appRejectValidation,
} = require("../utils/validators");
const validate = require("../middleware/validate");

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
router.post("/digital-files/grant-access", digitalController.grantDigitalFileAccess);
router.post("/digital-files/revoke-access", digitalController.revokeDigitalFileAccess);

// Courier Boxes
router.get("/courier-boxes", courierBoxController.listCourierBoxes);
router.post("/courier-boxes", courierBoxController.createCourierBox);
router.put("/courier-boxes/:id", courierBoxController.updateCourierBox);
router.delete("/courier-boxes/:id", courierBoxController.deleteCourierBox);

// Pinout app users (App Data tab)
router.get("/app-users", appUserController.listAppUsers);
router.post(
    "/app-users/:id/approve",
    appUserIdValidation,
    validate,
    appUserController.approveAppUser
);
router.post(
    "/app-users/:id/reject",
    appRejectValidation,
    validate,
    appUserController.rejectAppUser
);

module.exports = router;
