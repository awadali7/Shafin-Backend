const express = require("express");
const router = express.Router();
const videoController = require("../controllers/videoController");
const { authenticate, isAdmin } = require("../middleware/auth");
const { createVideoValidation } = require("../utils/validators");
const validate = require("../middleware/validate");

// JSON body parser for video routes (videos use JSON, not multipart)
const jsonParser = express.json({ limit: "50mb" });

// Public routes (but may require course access)
router.get("/:courseId/videos", videoController.getCourseVideos);
router.get("/:courseId/videos/:videoId", videoController.getVideoById);

// Admin only routes
router.post(
    "/:courseId/videos",
    authenticate,
    isAdmin,
    jsonParser, // Add JSON parser for video creation
    createVideoValidation,
    validate,
    videoController.createVideo
);
router.put(
    "/:courseId/videos/:videoId",
    authenticate,
    isAdmin,
    jsonParser, // Add JSON parser for video updates
    videoController.updateVideo
);
router.delete(
    "/:courseId/videos/:videoId",
    authenticate,
    isAdmin,
    videoController.deleteVideo
);

module.exports = router;
