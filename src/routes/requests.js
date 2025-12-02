const express = require("express");
const router = express.Router();
const requestController = require("../controllers/requestController");
const { authenticate, isAdmin } = require("../middleware/auth");
const {
    createRequestValidation,
    approveRequestValidation,
} = require("../utils/validators");
const validate = require("../middleware/validate");

// User routes (require authentication)
router.use(authenticate);

router.post(
    "/",
    createRequestValidation,
    validate,
    requestController.createRequest
);
router.get("/", requestController.getUserRequests);
router.get("/:id", requestController.getRequestById);

// Admin routes
router.get("/admin/all", isAdmin, requestController.getAllRequests);
router.put(
    "/:id/approve",
    isAdmin,
    approveRequestValidation,
    validate,
    requestController.approveRequest
);
router.put("/:id/reject", isAdmin, requestController.rejectRequest);

module.exports = router;
