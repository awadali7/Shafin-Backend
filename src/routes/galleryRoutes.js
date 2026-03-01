const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const { authenticate, isAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for gallery image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../../uploads/gallery');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Create unique filename: gallery-timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'gallery-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload only images.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Public routes
router.get('/active', galleryController.getActiveGalleryImages);

// Admin routes
router.use(authenticate);
router.use(isAdmin);

router.get('/', galleryController.getGalleryImages);
router.post('/upload', upload.single('image'), galleryController.uploadGalleryImage);
router.patch('/:id/status', galleryController.toggleGalleryImageStatus);
router.delete('/:id', galleryController.deleteGalleryImage);

module.exports = router;
