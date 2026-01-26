const express = require("express");
const router = express.Router();
const {
    submitKYC,
    upgradeToBusiness,
    getMyKYC,
    getAllKYC,
    getKYCById,
    verifyKYC,
    uploadFields,
    uploadBusinessProof,
} = require("../controllers/kycController");
const { authenticate } = require("../middleware/auth");
const { isAdmin } = require("../middleware/auth");

// JSON body parser for verify/reject routes (these need JSON, not multipart)
const jsonParser = express.json({ limit: "50mb" });

// User routes (authenticated)
router.post("/", authenticate, uploadFields, submitKYC);
router.post("/upgrade-to-business", authenticate, uploadBusinessProof, upgradeToBusiness);
router.get("/me", authenticate, getMyKYC);

// Admin routes
router.get("/", authenticate, isAdmin, getAllKYC);
router.get("/:id", authenticate, isAdmin, getKYCById);
router.put("/:id/verify", authenticate, isAdmin, jsonParser, verifyKYC);

module.exports = router;
