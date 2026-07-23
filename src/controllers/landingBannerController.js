const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

exports.getActiveBanners = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM landing_banners WHERE is_active = true ORDER BY sort_order ASC, created_at ASC'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching landing banners:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getAllBanners = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM landing_banners ORDER BY sort_order ASC, created_at ASC'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching all landing banners:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.uploadBanner = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        }
        const imageUrl = `/uploads/landing-banners/${req.file.filename}`;
        const sortOrder = req.body.sort_order ? parseInt(req.body.sort_order) : 0;
        const result = await pool.query(
            'INSERT INTO landing_banners (image_url, sort_order) VALUES ($1, $2) RETURNING *',
            [imageUrl, sortOrder]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error uploading landing banner:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.toggleBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        const result = await pool.query(
            'UPDATE landing_banners SET is_active = $1 WHERE id = $2 RETURNING *',
            [is_active, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error toggling banner:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM landing_banners WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }
        const banner = result.rows[0];
        const filePath = path.join(__dirname, '../../', banner.image_url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true, message: 'Banner deleted' });
    } catch (error) {
        console.error('Error deleting banner:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
