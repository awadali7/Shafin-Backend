const { verifyToken } = require("../config/jwt");
const { query } = require("../config/database");

/**
 * Middleware to authenticate JWT token
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "No token provided",
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = verifyToken(token);

        // Get user from database
        const result = await query(
            "SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1",
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: "Account is deactivated",
            });
        }

        // Validate session if sessionId is present in token
        if (decoded.sessionId) {
            const sessionResult = await query(
                `SELECT id FROM user_sessions 
                 WHERE session_token = $1 
                 AND user_id = $2 
                 AND is_active = true 
                 AND expires_at > NOW()`,
                [decoded.sessionId, user.id]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: "Session expired or invalid. Please login again.",
                });
            }

            // Update last activity
            await query(
                `UPDATE user_sessions 
                 SET last_activity = CURRENT_TIMESTAMP 
                 WHERE session_token = $1`,
                [decoded.sessionId]
            ).catch((err) => {
                // Log error but don't fail the request
                console.error("Failed to update session activity:", err);
            });
        }

        // Attach user and sessionId to request object
        req.user = { ...user, sessionId: decoded.sessionId };
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: error.message || "Invalid token",
        });
    }
};

/**
 * Middleware to check if user is admin
 */
const isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required",
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access required",
        });
    }

    next();
};

/**
 * Optional authentication middleware - doesn't fail if no token
 * Sets req.user if valid token is provided, otherwise continues without req.user
 */
const optionalAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            // No token provided, continue without authentication
            return next();
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token);

        const result = await query(
            "SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1",
            [decoded.userId]
        );

        if (result.rows.length === 0 || !result.rows[0].is_active) {
            // Invalid user or inactive, continue without authentication
            return next();
        }

        const user = result.rows[0];

        // Validate session if sessionId is present
        if (decoded.sessionId) {
            const sessionResult = await query(
                `SELECT id FROM user_sessions 
                 WHERE session_token = $1 
                 AND user_id = $2 
                 AND is_active = true 
                 AND expires_at > NOW()`,
                [decoded.sessionId, user.id]
            );

            if (sessionResult.rows.length === 0) {
                // Invalid session, continue without authentication
                return next();
            }

            // Update last activity
            await query(
                `UPDATE user_sessions 
                 SET last_activity = CURRENT_TIMESTAMP 
                 WHERE session_token = $1`,
                [decoded.sessionId]
            ).catch((err) => {
                console.error("Failed to update session activity:", err);
            });
        }

        // Attach user to request object
        req.user = { ...user, sessionId: decoded.sessionId };
        next();
    } catch (error) {
        // Token invalid or error, continue without authentication
        next();
    }
};

module.exports = {
    authenticate,
    optionalAuthenticate,
    isAdmin,
};
