const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { authenticate, isAdmin } = require("../middleware/auth");
const { createCourseValidation } = require("../utils/validators");
const validate = require("../middleware/validate");

// Public routes
router.get("/", courseController.getAllCourses);
router.get("/:slug", courseController.getCourseBySlug);

// Admin only routes
router.post(
    "/",
    authenticate,
    isAdmin,
    createCourseValidation,
    validate,
    courseController.createCourse
);
router.put("/:id", authenticate, isAdmin, courseController.updateCourse);
router.delete("/:id", authenticate, isAdmin, courseController.deleteCourse);

module.exports = router;
