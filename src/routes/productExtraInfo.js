const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, isAdmin } = require("../middleware/auth");
const productExtraInfoController = require("../controllers/productExtraInfoController");

const tempDir = path.join(__dirname, "../../uploads/temp");
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB
    }
});

router.post("/", authenticate, isAdmin, upload.fields([
    { name: "images", maxCount: 20 },
    { name: "pdfs", maxCount: 10 }
]), productExtraInfoController.createProductExtraInfo);

router.get("/", authenticate, isAdmin, productExtraInfoController.getAllProductExtraInfos);
router.get("/my/access", authenticate, productExtraInfoController.getMyProductExtraInfos);
router.get("/slug/:slug", authenticate, productExtraInfoController.getAccessibleProductExtraInfoBySlug);
router.get("/:id", authenticate, isAdmin, productExtraInfoController.getProductExtraInfoById);
router.post("/grant", express.json(), authenticate, isAdmin, productExtraInfoController.grantAccess);
router.delete("/:id", authenticate, isAdmin, productExtraInfoController.deleteProductExtraInfo);
router.get("/download/:id", productExtraInfoController.downloadZip);

module.exports = router;
