const { query, getClient } = require("../config/database");

const listCourierBoxes = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT id, name, weight_grams, charge_a, charge_b, charge_c, charge_d, charge_e, charge_f, created_at
             FROM courier_boxes
             ORDER BY weight_grams ASC, name ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        next(error);
    }
};

const createCourierBox = async (req, res, next) => {
    try {
        const { name, weight_grams, charge_a, charge_b, charge_c, charge_d, charge_e, charge_f } = req.body || {};
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Name is required" });
        }
        const result = await query(
            `INSERT INTO courier_boxes (name, weight_grams, charge_a, charge_b, charge_c, charge_d, charge_e, charge_f)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                name.trim(),
                Number(weight_grams) || 0,
                Number(charge_a) || 0,
                Number(charge_b) || 0,
                Number(charge_c) || 0,
                Number(charge_d) || 0,
                Number(charge_e) || 0,
                Number(charge_f) || 0,
            ]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const updateCourierBox = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, weight_grams, charge_a, charge_b, charge_c, charge_d, charge_e, charge_f } = req.body || {};
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Name is required" });
        }
        const result = await query(
            `UPDATE courier_boxes
             SET name = $1, weight_grams = $2, charge_a = $3, charge_b = $4, charge_c = $5,
                 charge_d = $6, charge_e = $7, charge_f = $8, updated_at = NOW()
             WHERE id = $9
             RETURNING *`,
            [
                name.trim(),
                Number(weight_grams) || 0,
                Number(charge_a) || 0,
                Number(charge_b) || 0,
                Number(charge_c) || 0,
                Number(charge_d) || 0,
                Number(charge_e) || 0,
                Number(charge_f) || 0,
                id,
            ]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Courier box not found" });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const deleteCourierBox = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await query(
            `DELETE FROM courier_boxes WHERE id = $1 RETURNING id`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Courier box not found" });
        }
        res.json({ success: true, message: "Courier box deleted" });
    } catch (error) {
        next(error);
    }
};

module.exports = { listCourierBoxes, createCourierBox, updateCourierBox, deleteCourierBox };
