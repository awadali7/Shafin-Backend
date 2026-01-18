const express = require("express");
const router = express.Router();
const {
    submitProductKYC,
    getMyProductKYC,
    getAllProductKYC,
    getProductKYCById,
    verifyProductKYC,
    uploadFields,
} = require("../controllers/productKycController");
const { authenticate, isAdmin } = require("../middleware/auth");

// JSON body parser for verify/reject routes (these need JSON, not multipart)
const jsonParser = express.json({ limit: "50mb" });

// User routes (authenticated)
router.post("/", authenticate, uploadFields, submitProductKYC);
router.get("/me", authenticate, getMyProductKYC);

// Admin routes
router.get("/", authenticate, isAdmin, getAllProductKYC);
router.get("/:id", authenticate, isAdmin, getProductKYCById);
router.put("/:id/verify", authenticate, isAdmin, jsonParser, verifyProductKYC);

module.exports = router;

