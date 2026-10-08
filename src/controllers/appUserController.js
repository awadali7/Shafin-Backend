const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { query, getClient } = require("../config/database");
const {
    generateToken,
    generateRefreshToken,
    verifyRefreshToken,
} = require("../config/jwt");
const {
    sendAppOtpEmail,
    sendAppAccessApprovedEmail,
    sendAppAccessRejectedEmail,
} = require("../config/email");
const { appUserColumns, checkAppSession } = require("../middleware/appAuth");

// ---------------------------------------------------------------------------
// Pinout app accounts — separate from website users.
// Signup: name + email + password → email code → account (status
// serial_required) → serial number (pending) → admin approves or rejects.
// One device at a time: each login ends the previous device's session.
// ---------------------------------------------------------------------------

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_DAYS = 30; // matches the refresh token

const APP_USER_STATUSES = ["serial_required", "pending", "approved", "rejected"];

const sendError = (res, status, code, message, data) =>
    res.status(status).json({
        success: false,
        code,
        message,
        ...(data && { data }),
    });

const toAppUserResponse = (user) => ({
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    serial_number: user.serial_number,
    phone: user.phone,
    status: user.status,
    rejection_reason: user.rejection_reason,
    serial_submitted_at: user.serial_submitted_at,
    reviewed_at: user.reviewed_at,
});

const buildDeviceInfo = (req) => ({
    deviceName: req.body.device_name || "Unknown device",
    platform: req.body.device_platform || "unknown",
    userAgent: req.headers["user-agent"] || "",
});

const issueTokens = (appUserId, sessionToken) => {
    const payload = { appUserId, sessionId: sessionToken, typ: "app" };
    return {
        token: generateToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
};

/**
 * Creates a session for this device and ends every other one, so only the
 * newest login stays signed in. The user row lock serializes concurrent
 * logins — without it two devices logging in at once could end each other.
 */
const startSession = async (user, req) => {
    const sessionToken = uuidv4();
    const deviceInfo = buildDeviceInfo(req);
    const client = await getClient();

    try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM app_users WHERE id = $1 FOR UPDATE", [
            user.id,
        ]);
        await client.query(
            `UPDATE app_sessions
             SET is_active = false, ended_reason = 'replaced'
             WHERE app_user_id = $1 AND is_active = true`,
            [user.id]
        );
        await client.query(
            `INSERT INTO app_sessions (app_user_id, session_token, device_id, device_info, ip_address, expires_at)
             VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${SESSION_TTL_DAYS} days')`,
            [
                user.id,
                sessionToken,
                req.body.device_id,
                JSON.stringify(deviceInfo),
                req.ip || "unknown",
            ]
        );
        await client.query(
            `UPDATE app_users
             SET last_login_at = CURRENT_TIMESTAMP, last_login_device = $1
             WHERE id = $2`,
            [JSON.stringify(deviceInfo), user.id]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return issueTokens(user.id, sessionToken);
};

/**
 * Emails a fresh 6-digit code and responds with its challengeId.
 * One pending code per email + purpose, with a resend cooldown.
 */
const issueOtp = async (res, { email, name, purpose, payload = null }) => {
    const recentOtp = await query(
        `SELECT CEIL(EXTRACT(EPOCH FROM (created_at + INTERVAL '${OTP_RESEND_COOLDOWN_SECONDS} seconds' - NOW())))::int AS retry_after
         FROM app_email_otps
         WHERE email = $1
         AND purpose = $2
         AND used = false
         AND created_at > NOW() - INTERVAL '${OTP_RESEND_COOLDOWN_SECONDS} seconds'
         ORDER BY created_at DESC
         LIMIT 1`,
        [email, purpose]
    );

    if (recentOtp.rows.length > 0) {
        const retryAfterSeconds = Math.max(recentOtp.rows[0].retry_after, 1);
        return sendError(
            res,
            429,
            "OTP_COOLDOWN",
            `Please wait ${retryAfterSeconds}s before requesting a new code`,
            { retryAfterSeconds }
        );
    }

    await query(
        "DELETE FROM app_email_otps WHERE email = $1 AND purpose = $2 AND used = false",
        [email, purpose]
    );

    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
    const otpHash = await bcrypt.hash(otp, 10);

    const otpResult = await query(
        `INSERT INTO app_email_otps (email, purpose, otp_hash, payload, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${OTP_TTL_MINUTES} minutes')
         RETURNING id`,
        [email, purpose, otpHash, payload ? JSON.stringify(payload) : null]
    );
    const challengeId = otpResult.rows[0].id;

    if (process.env.NODE_ENV !== "production") {
        console.log(`🔐 Pinout app ${purpose} code for ${email}: ${otp}`);
    }

    const emailResult = await sendAppOtpEmail(
        email,
        name,
        otp,
        purpose,
        OTP_TTL_MINUTES
    );

    if (!emailResult.success && process.env.NODE_ENV === "production") {
        // Drop the undeliverable code so the user isn't stuck behind the cooldown
        await query("DELETE FROM app_email_otps WHERE id = $1", [challengeId]);
        return sendError(
            res,
            503,
            "OTP_SEND_FAILED",
            "Could not send the verification code. Please try again."
        );
    }

    return res.json({
        success: true,
        message: "Verification code sent to your email",
        data: {
            challengeId,
            expiresInSeconds: OTP_TTL_MINUTES * 60,
            resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        },
    });
};

/**
 * Checks an emailed code. Each call uses up one attempt; a correct code can
 * be claimed only once. Returns { challenge: { email, payload } } or
 * { error: { status, code, message, data } }.
 */
const consumeOtp = async (challengeId, purpose, otp) => {
    const tooManyAttempts = {
        status: 429,
        code: "OTP_TOO_MANY_ATTEMPTS",
        message: "Too many incorrect attempts. Please request a new code.",
    };
    const expired = {
        status: 400,
        code: "OTP_EXPIRED",
        message: "This code has expired. Please request a new code.",
    };

    const attemptResult = await query(
        `UPDATE app_email_otps
         SET attempts = attempts + 1
         WHERE id = $1
         AND purpose = $2
         AND used = false
         AND expires_at > NOW()
         AND attempts < $3
         RETURNING email, otp_hash, payload, attempts`,
        [challengeId, purpose, OTP_MAX_ATTEMPTS]
    );

    if (attemptResult.rows.length === 0) {
        const lockedResult = await query(
            `SELECT id FROM app_email_otps
             WHERE id = $1 AND purpose = $2 AND used = false AND expires_at > NOW()`,
            [challengeId, purpose]
        );

        if (lockedResult.rows.length > 0) {
            await query("UPDATE app_email_otps SET used = true WHERE id = $1", [
                challengeId,
            ]);
            return { error: tooManyAttempts };
        }

        return { error: expired };
    }

    const challenge = attemptResult.rows[0];
    const isOtpValid = await bcrypt.compare(otp, challenge.otp_hash);

    if (!isOtpValid) {
        const attemptsRemaining = OTP_MAX_ATTEMPTS - challenge.attempts;

        if (attemptsRemaining <= 0) {
            await query("UPDATE app_email_otps SET used = true WHERE id = $1", [
                challengeId,
            ]);
            return { error: tooManyAttempts };
        }

        return {
            error: {
                status: 400,
                code: "OTP_INVALID",
                message: `Incorrect code. ${attemptsRemaining} attempt${
                    attemptsRemaining === 1 ? "" : "s"
                } left.`,
                data: { attemptsRemaining },
            },
        };
    }

    // Single use: only one request can claim the code. The payload holds the
    // signup password hash, so clear it once claimed.
    const claimResult = await query(
        `UPDATE app_email_otps SET used = true, payload = NULL
         WHERE id = $1 AND used = false
         RETURNING id`,
        [challengeId]
    );

    if (claimResult.rows.length === 0) {
        return { error: expired };
    }

    return { challenge };
};

const sendOtpError = (res, { status, code, message, data }) =>
    sendError(res, status, code, message, data);

/**
 * Pinout app signup step 1: email a verification code.
 * The account is only created once the code is verified.
 */
const signup = async (req, res, next) => {
    try {
        const { full_name, email, password } = req.body;

        const existing = await query("SELECT id FROM app_users WHERE email = $1", [
            email,
        ]);

        if (existing.rows.length > 0) {
            return sendError(
                res,
                409,
                "EMAIL_TAKEN",
                "An account with this email already exists. Please log in."
            );
        }

        const password_hash = await bcrypt.hash(password, 12);

        return await issueOtp(res, {
            email,
            name: full_name,
            purpose: "signup",
            payload: { full_name, password_hash },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Pinout app signup step 2: verify the code, create the account, log in
 */
const verifySignup = async (req, res, next) => {
    try {
        const { challenge_id, otp } = req.body;

        const { challenge, error } = await consumeOtp(challenge_id, "signup", otp);
        if (error) return sendOtpError(res, error);

        const { full_name, password_hash } = challenge.payload || {};
        if (!full_name || !password_hash) {
            return sendError(
                res,
                400,
                "OTP_EXPIRED",
                "This code has expired. Please request a new code."
            );
        }

        let user;
        try {
            const insertResult = await query(
                `INSERT INTO app_users (full_name, email, password_hash)
                 VALUES ($1, $2, $3)
                 RETURNING ${appUserColumns()}`,
                [full_name, challenge.email, password_hash]
            );
            user = insertResult.rows[0];
        } catch (insertError) {
            if (insertError.code === "23505") {
                return sendError(
                    res,
                    409,
                    "EMAIL_TAKEN",
                    "An account with this email already exists. Please log in."
                );
            }
            throw insertError;
        }

        const tokens = await startSession(user, req);

        res.status(201).json({
            success: true,
            message: "Account created",
            data: { user: toAppUserResponse(user), ...tokens },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Pinout app login: email + password. Logs out any other device.
 */
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const result = await query(
            `SELECT ${appUserColumns()}, password_hash FROM app_users WHERE email = $1`,
            [email]
        );

        const user = result.rows[0];
        const isPasswordValid =
            user && (await bcrypt.compare(password, user.password_hash));

        if (!isPasswordValid) {
            return sendError(
                res,
                401,
                "INVALID_CREDENTIALS",
                "Invalid email or password"
            );
        }

        if (!user.is_active) {
            return sendError(
                res,
                401,
                "ACCOUNT_DEACTIVATED",
                "This account has been deactivated."
            );
        }

        const tokens = await startSession(user, req);

        res.json({
            success: true,
            message: "Login successful",
            data: { user: toAppUserResponse(user), ...tokens },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Refresh app tokens. Fails with SESSION_REPLACED once another device has
 * logged in, which is how the old device finds out it was signed out.
 */
const refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendError(
                res,
                400,
                "TOKEN_INVALID",
                "Refresh token is required"
            );
        }

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (verifyError) {
            decoded = null;
        }

        if (!decoded || decoded.typ !== "app" || !decoded.appUserId || !decoded.sessionId) {
            return sendError(
                res,
                401,
                "SESSION_EXPIRED",
                "Your session has expired. Please log in again."
            );
        }

        const { user, error } = await checkAppSession(
            decoded.appUserId,
            decoded.sessionId
        );

        if (error) {
            return sendError(res, 401, error.code, error.message);
        }

        await query(
            "UPDATE app_sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_token = $1",
            [decoded.sessionId]
        );

        res.json({
            success: true,
            data: {
                user: toAppUserResponse(user),
                ...issueTokens(user.id, decoded.sessionId),
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Log out the current device
 */
const logout = async (req, res, next) => {
    try {
        await query(
            `UPDATE app_sessions
             SET is_active = false, ended_reason = 'logout'
             WHERE session_token = $1 AND is_active = true`,
            [req.appUser.sessionId]
        );

        res.json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Current app user, including approval status
 */
const getMe = async (req, res) => {
    res.json({
        success: true,
        data: { user: toAppUserResponse(req.appUser) },
    });
};

/**
 * Submit (or, after a rejection, resubmit) the serial number and phone
 * number for approval. Older app builds send no phone; keep any stored one.
 */
const submitSerial = async (req, res, next) => {
    try {
        const { serial_number, phone } = req.body;
        const { id, status } = req.appUser;

        if (status === "pending" || status === "approved") {
            return sendError(
                res,
                409,
                "SERIAL_ALREADY_SUBMITTED",
                status === "approved"
                    ? "Your account is already approved."
                    : "Your serial number is already waiting for approval."
            );
        }

        let result;
        try {
            result = await query(
                `UPDATE app_users
                 SET serial_number = $1,
                     phone = COALESCE($2, phone),
                     status = 'pending',
                     serial_submitted_at = CURRENT_TIMESTAMP,
                     rejection_reason = NULL,
                     reviewed_by = NULL,
                     reviewed_at = NULL
                 WHERE id = $3 AND status IN ('serial_required', 'rejected')
                 RETURNING ${appUserColumns()}`,
                [serial_number, phone ?? null, id]
            );
        } catch (updateError) {
            // idx_app_users_serial_unique: another pending/approved account holds it
            if (updateError.code === "23505") {
                return sendError(
                    res,
                    409,
                    "SERIAL_TAKEN",
                    "This serial number is already registered to another account."
                );
            }
            throw updateError;
        }

        if (result.rows.length === 0) {
            return sendError(
                res,
                409,
                "SERIAL_ALREADY_SUBMITTED",
                "Your serial number is already waiting for approval."
            );
        }

        res.json({
            success: true,
            message: "Serial number submitted for approval",
            data: { user: toAppUserResponse(result.rows[0]) },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Forgot password: email a reset code
 */
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        const result = await query(
            "SELECT full_name FROM app_users WHERE email = $1",
            [email]
        );

        // Signup already reveals whether an email is registered, so say so
        // plainly here too rather than sending the user to wait for nothing.
        if (result.rows.length === 0) {
            return sendError(
                res,
                404,
                "ACCOUNT_NOT_FOUND",
                "No account found with this email."
            );
        }

        return await issueOtp(res, {
            email,
            name: result.rows[0].full_name,
            purpose: "reset_password",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Reset password with the emailed code. Logs out every device.
 */
const resetPassword = async (req, res, next) => {
    try {
        const { challenge_id, otp, password } = req.body;

        const { challenge, error } = await consumeOtp(
            challenge_id,
            "reset_password",
            otp
        );
        if (error) return sendOtpError(res, error);

        const password_hash = await bcrypt.hash(password, 12);

        const result = await query(
            "UPDATE app_users SET password_hash = $1 WHERE email = $2 RETURNING id",
            [password_hash, challenge.email]
        );

        if (result.rows.length === 0) {
            return sendError(
                res,
                404,
                "ACCOUNT_NOT_FOUND",
                "No account found with this email."
            );
        }

        await query(
            `UPDATE app_sessions
             SET is_active = false, ended_reason = 'password_reset'
             WHERE app_user_id = $1 AND is_active = true`,
            [result.rows[0].id]
        );

        res.json({
            success: true,
            message: "Password reset. Please log in with your new password.",
        });
    } catch (error) {
        next(error);
    }
};

// ---------------------------------------------------------------------------
// Admin: App Data tab
// ---------------------------------------------------------------------------

/**
 * List app users by status with per-status counts (Admin only)
 */
const listAppUsers = async (req, res, next) => {
    try {
        const status = String(req.query.status || "pending");
        const search = String(req.query.search || "").trim();

        if (status !== "all" && !APP_USER_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status filter",
            });
        }

        const params = [];
        const conditions = [];

        if (status !== "all") {
            params.push(status);
            conditions.push(`u.status = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            conditions.push(
                `(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.serial_number ILIKE $${params.length} OR u.phone ILIKE $${params.length})`
            );
        }

        // Pending is a queue (oldest first); everything else newest first
        const orderBy =
            status === "pending"
                ? "u.serial_submitted_at ASC"
                : "COALESCE(u.reviewed_at, u.serial_submitted_at, u.created_at) DESC";

        const result = await query(
            `SELECT
                ${appUserColumns("u")},
                u.last_login_at,
                u.created_at,
                reviewer.email AS reviewed_by_email,
                active_session.device_info AS active_device,
                active_session.last_activity AS active_device_last_seen
             FROM app_users u
             LEFT JOIN users reviewer ON reviewer.id = u.reviewed_by
             LEFT JOIN LATERAL (
                SELECT device_info, last_activity
                FROM app_sessions
                WHERE app_user_id = u.id AND is_active = true AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
             ) active_session ON true
             ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
             ORDER BY ${orderBy}
             LIMIT 500`,
            params
        );

        const countsResult = await query(
            "SELECT status, COUNT(*)::int AS count FROM app_users GROUP BY status"
        );

        const counts = Object.fromEntries(
            APP_USER_STATUSES.map((s) => [s, 0])
        );
        for (const row of countsResult.rows) {
            counts[row.status] = row.count;
        }

        res.json({
            success: true,
            data: {
                users: result.rows,
                counts,
            },
        });
    } catch (error) {
        next(error);
    }
};

const findAppUserStatus = async (id) => {
    const result = await query("SELECT status FROM app_users WHERE id = $1", [
        id,
    ]);
    return result.rows[0]?.status;
};

/**
 * Approve an app user's serial number (Admin only).
 * Works on pending requests, and on rejected ones if the admin changes their mind.
 */
const approveAppUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        let result;
        try {
            result = await query(
                `UPDATE app_users
                 SET status = 'approved',
                     rejection_reason = NULL,
                     reviewed_by = $1,
                     reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 AND status IN ('pending', 'rejected')
                 AND serial_number IS NOT NULL
                 RETURNING id, full_name, email, serial_number, status`,
                [req.user.id, id]
            );
        } catch (updateError) {
            // Re-approving a rejected user whose serial someone else has since claimed
            if (updateError.code === "23505") {
                return res.status(409).json({
                    success: false,
                    code: "SERIAL_TAKEN",
                    message:
                        "Another account already holds this serial number. Reject that one first.",
                });
            }
            throw updateError;
        }

        if (result.rows.length === 0) {
            const status = await findAppUserStatus(id);
            return res.status(status ? 409 : 404).json({
                success: false,
                message: status
                    ? `Cannot approve a user whose status is "${status}"`
                    : "App user not found",
            });
        }

        const user = result.rows[0];

        sendAppAccessApprovedEmail(
            user.email,
            user.full_name,
            user.serial_number
        ).catch((err) =>
            console.error("Failed to send app access approved email:", err)
        );

        res.json({
            success: true,
            message: "App user approved",
            data: { user },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Reject a pending request, or revoke an approved user (Admin only).
 * Releases their serial number; they can submit a new one from the app.
 */
const rejectAppUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const reason = req.body.reason?.trim() || null;

        const result = await query(
            `UPDATE app_users
             SET status = 'rejected',
                 rejection_reason = $1,
                 reviewed_by = $2,
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $3
             AND status IN ('pending', 'approved')
             RETURNING id, full_name, email, serial_number, status, rejection_reason`,
            [reason, req.user.id, id]
        );

        if (result.rows.length === 0) {
            const status = await findAppUserStatus(id);
            return res.status(status ? 409 : 404).json({
                success: false,
                message: status
                    ? `Cannot reject a user whose status is "${status}"`
                    : "App user not found",
            });
        }

        const user = result.rows[0];

        sendAppAccessRejectedEmail(
            user.email,
            user.full_name,
            user.serial_number,
            user.rejection_reason
        ).catch((err) =>
            console.error("Failed to send app access rejected email:", err)
        );

        res.json({
            success: true,
            message: "App user rejected",
            data: { user },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    signup,
    verifySignup,
    login,
    refresh,
    logout,
    getMe,
    submitSerial,
    forgotPassword,
    resetPassword,
    listAppUsers,
    approveAppUser,
    rejectAppUser,
};
