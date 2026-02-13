const pool = require('../config/database');

/**
 * Get all site settings
 */
const getAllSettings = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM site_settings ORDER BY setting_key ASC'
        );
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
};

/**
 * Get a single setting by key
 */
const getSettingByKey = async (req, res) => {
    const { key } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM site_settings WHERE setting_key = $1',
            [key]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Setting not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch setting' });
    }
};

/**
 * Get public settings (for frontend)
 */
const getPublicSettings = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT setting_key, setting_value, setting_type 
             FROM site_settings 
             WHERE setting_key IN ('hero_video_url', 'hero_title', 'hero_description')
             ORDER BY setting_key ASC`
        );
        
        // Convert to key-value object for easier access
        const settings = result.rows.reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});
        
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error fetching public settings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
};

/**
 * Update a setting (Admin only)
 */
const updateSetting = async (req, res) => {
    const { key } = req.params;
    const { setting_value } = req.body;
    
    if (setting_value === undefined) {
        return res.status(400).json({ success: false, message: 'setting_value is required' });
    }
    
    try {
        const result = await pool.query(
            `UPDATE site_settings 
             SET setting_value = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE setting_key = $2 
             RETURNING *`,
            [setting_value, key]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Setting not found' });
        }
        
        res.json({ success: true, data: result.rows[0], message: 'Setting updated successfully' });
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ success: false, message: 'Failed to update setting' });
    }
};

/**
 * Create a new setting (Admin only)
 */
const createSetting = async (req, res) => {
    const { setting_key, setting_value, setting_type, description } = req.body;
    
    if (!setting_key) {
        return res.status(400).json({ success: false, message: 'setting_key is required' });
    }
    
    try {
        const result = await pool.query(
            `INSERT INTO site_settings (setting_key, setting_value, setting_type, description) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [setting_key, setting_value || '', setting_type || 'text', description || '']
        );
        
        res.status(201).json({ success: true, data: result.rows[0], message: 'Setting created successfully' });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ success: false, message: 'Setting key already exists' });
        }
        console.error('Error creating setting:', error);
        res.status(500).json({ success: false, message: 'Failed to create setting' });
    }
};

/**
 * Delete a setting (Admin only)
 */
const deleteSetting = async (req, res) => {
    const { key } = req.params;
    
    try {
        const result = await pool.query(
            'DELETE FROM site_settings WHERE setting_key = $1 RETURNING *',
            [key]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Setting not found' });
        }
        
        res.json({ success: true, message: 'Setting deleted successfully' });
    } catch (error) {
        console.error('Error deleting setting:', error);
        res.status(500).json({ success: false, message: 'Failed to delete setting' });
    }
};

module.exports = {
    getAllSettings,
    getSettingByKey,
    getPublicSettings,
    updateSetting,
    createSetting,
    deleteSetting,
};

