const express = require("express");
const router = express.Router();
const progressController = require("../controllers/progressController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

router.post("/videos/:videoId/watch", progressController.markVideoWatched);
router.post("/videos/:videoId/unlock-next", progressController.unlockNextVideo);
router.get("/courses/:courseId", progressController.getCourseProgress);

module.exports = router;
