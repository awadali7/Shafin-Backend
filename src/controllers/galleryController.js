const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

exports.uploadGalleryImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        }

        const imageUrl = `/uploads/gallery/${req.file.filename}`;
        const { heading } = req.body;
        const isActive = req.body.is_active !== undefined ? req.body.is_active === 'true' || req.body.is_active === true : true; // Default true

        const result = await pool.query(
            'INSERT INTO gallery (image_url, heading, is_active) VALUES ($1, $2, $3) RETURNING *',
            [imageUrl, heading || null, isActive]
        );

        res.status(201).json({
            success: true,
            message: 'Gallery image uploaded successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error uploading gallery image:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getGalleryImages = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM gallery ORDER BY created_at DESC');
        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching gallery images:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getActiveGalleryImages = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM gallery WHERE is_active = true ORDER BY created_at DESC');
        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching active gallery images:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.toggleGalleryImageStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        const result = await pool.query(
            'UPDATE gallery SET is_active = $1 WHERE id = $2 RETURNING *',
            [is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Gallery image status updated',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating gallery image status:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteGalleryImage = async (req, res) => {
    try {
        const { id } = req.params;

        // Find the image first to get the URL
        const findResult = await pool.query('SELECT image_url FROM gallery WHERE id = $1', [id]);

        if (findResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        const imageUrl = findResult.rows[0].image_url;

        // Delete from DB
        await pool.query('DELETE FROM gallery WHERE id = $1', [id]);

        // Delete file from filesystem
        // The URL is typically something like /uploads/gallery/filename.jpg
        const filename = path.basename(imageUrl);
        const filepath = path.join(__dirname, '../../uploads/gallery', filename);

        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }

        res.status(200).json({
            success: true,
            message: 'Gallery image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting gallery image:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
