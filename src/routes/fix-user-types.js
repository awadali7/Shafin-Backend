const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// Public endpoint to fix user types (you can add auth later if needed)
router.post("/fix", async (req, res, next) => {
    try {
        console.log("🔧 Fixing user types...");

        // Fix users with Business KYC
        const businessResult = await query(`
            UPDATE users
            SET user_type = 'business_owner'
            WHERE id IN (
                SELECT user_id 
                FROM product_kyc_verifications
            )
            AND user_type IS NULL
            RETURNING id, email, user_type
        `);

        // Fix users with Student KYC
        const studentResult = await query(`
            UPDATE users
            SET user_type = 'student'
            WHERE id IN (
                SELECT user_id 
                FROM kyc_verifications
            )
            AND user_type IS NULL
            RETURNING id, email, user_type
        `);

        // Get all users with KYC
        const allUsers = await query(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.user_type,
                   k.status as student_kyc_status,
                   pk.status as business_kyc_status
            FROM users u
            LEFT JOIN kyc_verifications k ON u.id = k.user_id
            LEFT JOIN product_kyc_verifications pk ON u.id = pk.user_id
            WHERE k.id IS NOT NULL OR pk.id IS NOT NULL
            ORDER BY u.created_at DESC
        `);

        res.json({
            success: true,
            message: "User types fixed successfully!",
            data: {
                businessOwnersFix: businessResult.rows,
                studentsFix: studentResult.rows,
                allUsersWithKYC: allUsers.rows
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;

