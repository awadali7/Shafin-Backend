const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/landingBannerController');
const { authenticate, isAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/landing-banners');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'banner-' + unique + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images are allowed'), false);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

function handleUpload(req, res, next) {
    upload.single('image')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'File is too large. Maximum size is 10 MB.' });
        }
        return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
    });
}

// Public
router.get('/active', ctrl.getActiveBanners);

// Admin only
router.use(authenticate, isAdmin);
router.get('/', ctrl.getAllBanners);
router.post('/upload', handleUpload, ctrl.uploadBanner);
router.patch('/:id/status', ctrl.toggleBanner);
router.delete('/:id', ctrl.deleteBanner);

module.exports = router;
