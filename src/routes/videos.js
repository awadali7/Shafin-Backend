const express = require("express");
const router = express.Router();
const videoController = require("../controllers/videoController");
const { authenticate, isAdmin } = require("../middleware/auth");
const { createVideoValidation } = require("../utils/validators");
const validate = require("../middleware/validate");

// Public routes (but may require course access)
router.get("/:courseId/videos", videoController.getCourseVideos);
router.get("/:courseId/videos/:videoId", videoController.getVideoById);

// Admin only routes
router.post(
    "/:courseId/videos",
    authenticate,
    isAdmin,
    createVideoValidation,
    validate,
    videoController.createVideo
);
router.put(
    "/:courseId/videos/:videoId",
    authenticate,
    isAdmin,
    videoController.updateVideo
);
router.delete(
    "/:courseId/videos/:videoId",
    authenticate,
    isAdmin,
    videoController.deleteVideo
);

module.exports = router;
