const { verifyToken } = require("../config/jwt");
const { query } = require("../config/database");

// Columns returned to the Pinout app (never the password hash)
const APP_USER_FIELDS = [
    "id",
    "full_name",
    "email",
    "serial_number",
    "status",
    "rejection_reason",
    "serial_submitted_at",
    "reviewed_at",
    "is_active",
];

const appUserColumns = (alias) =>
    APP_USER_FIELDS.map((field) => (alias ? `${alias}.${field}` : field)).join(
        ", "
    );

const SESSION_ENDED = {
    replaced: {
        code: "SESSION_REPLACED",
        message:
            "Your account was signed in on another device. Please log in again.",
    },
    password_reset: {
        code: "SESSION_EXPIRED",
        message: "Your password was changed. Please log in again.",
    },
    default: {
        code: "SESSION_EXPIRED",
        message: "Your session has expired. Please log in again.",
    },
};

/**
 * Checks that an app session is still the account's active one.
 * Returns { user } or { error: { code, message } }. Shared by the middleware
 * and the refresh endpoint.
 */
const checkAppSession = async (appUserId, sessionToken) => {
    const result = await query(
        `SELECT s.is_active AS session_active,
                s.ended_reason,
                s.expires_at > NOW() AS session_live,
                ${appUserColumns("u")}
         FROM app_sessions s
         JOIN app_users u ON u.id = s.app_user_id
         WHERE s.session_token = $1 AND s.app_user_id = $2`,
        [sessionToken, appUserId]
    );

    if (result.rows.length === 0) {
        return { error: SESSION_ENDED.default };
    }

    const { session_active, ended_reason, session_live, ...user } =
        result.rows[0];

    if (!session_active) {
        return { error: SESSION_ENDED[ended_reason] || SESSION_ENDED.default };
    }

    if (!session_live) {
        return { error: SESSION_ENDED.default };
    }

    if (!user.is_active) {
        return {
            error: {
                code: "ACCOUNT_DEACTIVATED",
                message: "This account has been deactivated.",
            },
        };
    }

    return { user };
};

/**
 * Middleware to authenticate a Pinout app user. Only accepts tokens issued by
 * /api/app/auth (typ "app"); website tokens are rejected here, and app tokens
 * don't resolve to a website user in middleware/auth.js.
 */
const authenticateAppUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            code: "UNAUTHORIZED",
            message: "No token provided",
        });
    }

    let decoded;
    try {
        decoded = verifyToken(authHeader.substring(7));
    } catch (error) {
        decoded = null;
    }

    if (!decoded || decoded.typ !== "app" || !decoded.appUserId || !decoded.sessionId) {
        return res.status(401).json({
            success: false,
            code: "TOKEN_INVALID",
            message: "Invalid or expired token",
        });
    }

    try {
        const { user, error } = await checkAppSession(
            decoded.appUserId,
            decoded.sessionId
        );

        if (error) {
            return res.status(401).json({ success: false, ...error });
        }

        query(
            "UPDATE app_sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_token = $1",
            [decoded.sessionId]
        ).catch((err) =>
            console.error("Failed to update app session activity:", err)
        );

        req.appUser = { ...user, sessionId: decoded.sessionId };
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    appUserColumns,
    checkAppSession,
    authenticateAppUser,
};
