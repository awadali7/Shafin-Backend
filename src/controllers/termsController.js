const { query } = require("../config/database");
const { createNotification } = require("./notificationController");

/**
 * Accept Course Terms & Conditions
 */
const acceptCourseTerms = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Check if already accepted
        const userCheck = await query(
            "SELECT course_terms_accepted_at FROM users WHERE id = $1",
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (userCheck.rows[0].course_terms_accepted_at) {
            return res.status(200).json({
                success: true,
                message: "Course terms already accepted",
                data: {
                    accepted_at: userCheck.rows[0].course_terms_accepted_at,
                },
            });
        }

        // Accept course terms
        const result = await query(
            `UPDATE users 
             SET course_terms_accepted_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, email, course_terms_accepted_at`,
            [userId]
        );

        // Create notification
        await createNotification(
            userId,
            "course_terms_required",
            "Course Terms Accepted",
            "You have successfully accepted the course terms and conditions. You can now purchase courses.",
            { accepted_at: result.rows[0].course_terms_accepted_at }
        );

        res.json({
            success: true,
            message: "Course terms accepted successfully",
            data: {
                accepted_at: result.rows[0].course_terms_accepted_at,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Accept Product Terms & Conditions
 */
const acceptProductTerms = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Check if already accepted
        const userCheck = await query(
            "SELECT product_terms_accepted_at FROM users WHERE id = $1",
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (userCheck.rows[0].product_terms_accepted_at) {
            return res.status(200).json({
                success: true,
                message: "Product terms already accepted",
                data: {
                    accepted_at: userCheck.rows[0].product_terms_accepted_at,
                },
            });
        }

        // Accept product terms
        const result = await query(
            `UPDATE users 
             SET product_terms_accepted_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, email, product_terms_accepted_at`,
            [userId]
        );

        // Create notification
        await createNotification(
            userId,
            "product_terms_required",
            "Product Terms Accepted",
            "You have successfully accepted the product terms and conditions. You can now purchase products.",
            { accepted_at: result.rows[0].product_terms_accepted_at }
        );

        res.json({
            success: true,
            message: "Product terms accepted successfully",
            data: {
                accepted_at: result.rows[0].product_terms_accepted_at,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user's terms acceptance status
 */
const getTermsStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT 
                course_terms_accepted_at,
                product_terms_accepted_at,
                user_type
             FROM users 
             WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            data: {
                course_terms_accepted: !!user.course_terms_accepted_at,
                course_terms_accepted_at: user.course_terms_accepted_at,
                product_terms_accepted: !!user.product_terms_accepted_at,
                product_terms_accepted_at: user.product_terms_accepted_at,
                user_type: user.user_type,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Set user type (student or business_owner)
 */
const setUserType = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { user_type } = req.body;

        // Validate user_type
        if (!user_type || !["student", "business_owner"].includes(user_type)) {
            return res.status(400).json({
                success: false,
                message: "user_type must be either 'student' or 'business_owner'",
            });
        }

        // Check if user type already set
        const userCheck = await query(
            "SELECT user_type FROM users WHERE id = $1",
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (userCheck.rows[0].user_type) {
            return res.status(400).json({
                success: false,
                message: `User type already set to '${userCheck.rows[0].user_type}'`,
                current_type: userCheck.rows[0].user_type,
            });
        }

        // Set user type
        const result = await query(
            `UPDATE users 
             SET user_type = $1
             WHERE id = $2
             RETURNING id, email, user_type`,
            [user_type, userId]
        );

        // Create notification
        await createNotification(
            userId,
            "system_update",
            "Account Type Set",
            `Your account has been set as ${user_type === "student" ? "Student" : "Business Owner"}. Please complete your KYC verification.`,
            { user_type }
        );

        res.json({
            success: true,
            message: `User type set to '${user_type}' successfully`,
            data: {
                user_type: result.rows[0].user_type,
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    acceptCourseTerms,
    acceptProductTerms,
    getTermsStatus,
    setUserType,
};

