const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, isAdmin } = require('../middleware/auth');

// Public route - Get public settings (no auth required)
router.get('/public', settingsController.getPublicSettings);

// Admin routes - Require authentication and admin role
router.get('/', authenticate, isAdmin, settingsController.getAllSettings);
router.get('/:key', authenticate, isAdmin, settingsController.getSettingByKey);
router.post('/', authenticate, isAdmin, settingsController.createSetting);
router.put('/:key', authenticate, isAdmin, settingsController.updateSetting);
router.delete('/:key', authenticate, isAdmin, settingsController.deleteSetting);

module.exports = router;

