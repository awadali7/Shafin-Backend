const express = require("express");
const router = express.Router();
const {
    acceptCourseTerms,
    acceptProductTerms,
    getTermsStatus,
    setUserType,
} = require("../controllers/termsController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// Get terms acceptance status
router.get("/status", getTermsStatus);

// Accept course terms
router.post("/course/accept", acceptCourseTerms);

// Accept product terms
router.post("/product/accept", acceptProductTerms);

// Set user type (student or business_owner)
router.post("/user-type", setUserType);

module.exports = router;

