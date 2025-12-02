const express = require("express");
const router = express.Router();
const uploadController = require("../controllers/uploadController");
const { authenticate } = require("../middleware/auth");
const { isAdmin } = require("../middleware/auth");

// Upload single file (Admin only)
router.post(
    "/single",
    authenticate,
    isAdmin,
    uploadController.upload.single("file"),
    uploadController.uploadFile
);

// Upload multiple files (Admin only)
router.post(
    "/multiple",
    authenticate,
    isAdmin,
    uploadController.upload.array("files", 10),
    uploadController.uploadMultipleFiles
);

// Delete file (Admin only)
router.delete(
    "/:type/:filename",
    authenticate,
    isAdmin,
    uploadController.deleteFile
);

module.exports = router;

