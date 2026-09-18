const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { query, getClient } = require("../config/database");
const { generateToken, generateRefreshToken } = require("../config/jwt");
const {
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendMultipleDeviceWarningEmail,
    sendPinoutLoginOtpEmail,
} = require("../config/email");
const { createNotification } = require("./notificationController");

/**
 * Helper function to extract device info from request
 * Improved accuracy with better detection logic
 */
const getDeviceInfo = (req) => {
    const userAgent = req.headers["user-agent"] || "";

    // Get IP address - check multiple sources for accuracy
    let ipAddress = "unknown";
    if (req.ip) {
        ipAddress = req.ip;
    } else if (req.headers["x-forwarded-for"]) {
        // Handle proxy/load balancer
        ipAddress = req.headers["x-forwarded-for"].split(",")[0].trim();
    } else if (req.headers["x-real-ip"]) {
        ipAddress = req.headers["x-real-ip"];
    } else if (req.connection && req.connection.remoteAddress) {
        ipAddress = req.connection.remoteAddress;
    } else if (req.socket && req.socket.remoteAddress) {
        ipAddress = req.socket.remoteAddress;
    }

    // Parse user agent for device info
    let deviceType = "unknown";
    let browser = "unknown";
    let os = "unknown";

    if (userAgent) {
        const ua = userAgent.toLowerCase();

        // Detect device type - check tablet first (more specific)
        if (/ipad/i.test(userAgent)) {
            deviceType = "tablet";
        } else if (/tablet|playbook|silk/i.test(ua)) {
            deviceType = "tablet";
        } else if (
            /mobile|android|iphone|ipod|blackberry|opera mini|opera mobi|skyfire|maemo|windows phone|palm|iemobile|symbian|symbianos|fennec/i.test(
                ua
            )
        ) {
            deviceType = "mobile";
        } else {
            deviceType = "desktop";
        }

        // Detect browser - more comprehensive detection
        if (/edg/i.test(userAgent)) {
            browser = "Edge";
        } else if (/opr|opera/i.test(userAgent)) {
            browser = "Opera";
        } else if (
            /chrome/i.test(userAgent) &&
            !/edg|opr|opera/i.test(userAgent)
        ) {
            browser = "Chrome";
        } else if (/firefox|fxios/i.test(userAgent)) {
            browser = "Firefox";
        } else if (
            /safari/i.test(userAgent) &&
            !/chrome|edg|opr|opera/i.test(userAgent)
        ) {
            browser = "Safari";
        } else if (/msie|trident/i.test(userAgent)) {
            browser = "Internet Explorer";
        } else if (/samsungbrowser/i.test(userAgent)) {
            browser = "Samsung Internet";
        } else if (/ucbrowser/i.test(userAgent)) {
            browser = "UC Browser";
        } else if (/yabrowser/i.test(userAgent)) {
            browser = "Yandex Browser";
        } else if (/brave/i.test(userAgent)) {
            browser = "Brave";
        }

        // Detect OS - more comprehensive detection
        if (/windows phone/i.test(userAgent)) {
            os = "Windows Phone";
        } else if (/windows nt/i.test(userAgent)) {
            // Extract Windows version
            if (/windows nt 10.0/i.test(userAgent)) {
                os = "Windows 10/11";
            } else if (/windows nt 6.3/i.test(userAgent)) {
                os = "Windows 8.1";
            } else if (/windows nt 6.2/i.test(userAgent)) {
                os = "Windows 8";
            } else if (/windows nt 6.1/i.test(userAgent)) {
                os = "Windows 7";
            } else {
                os = "Windows";
            }
        } else if (/macintosh|mac os x/i.test(userAgent)) {
            // Extract macOS version
            if (/mac os x 10[._](\d+)/i.test(userAgent)) {
                const match = userAgent.match(/mac os x 10[._](\d+)/i);
                const version = match ? match[1] : "";
                if (parseInt(version) >= 15) {
                    os = "macOS Big Sur+";
                } else if (parseInt(version) >= 14) {
                    os = "macOS Mojave";
                } else {
                    os = "macOS";
                }
            } else {
                os = "macOS";
            }
        } else if (/android/i.test(userAgent)) {
            // Extract Android version if available
            const androidMatch = userAgent.match(/android ([\d.]+)/i);
            if (androidMatch) {
                os = `Android ${androidMatch[1]}`;
            } else {
                os = "Android";
            }
        } else if (/iphone|ipad|ipod/i.test(userAgent)) {
            // Extract iOS version if available
            const iosMatch = userAgent.match(/os ([\d_]+)/i);
            if (iosMatch) {
                const version = iosMatch[1].replace(/_/g, ".");
                os = `iOS ${version}`;
            } else {
                os = "iOS";
            }
        } else if (/linux/i.test(userAgent)) {
            os = "Linux";
        } else if (/ubuntu/i.test(userAgent)) {
            os = "Ubuntu";
        } else if (/fedora/i.test(userAgent)) {
            os = "Fedora";
        } else if (/debian/i.test(userAgent)) {
            os = "Debian";
        }
    }

    return {
        deviceType,
        browser,
        os,
        userAgent,
    };
};

/**
 * Helper function to create a session.
 * `client` is "web" or "pinout" — single-session enforcement is scoped per client,
 * so a web login never logs out the Pinout app and vice versa.
 */
const createSession = async (
    userId,
    sessionToken,
    req,
    client = "web",
    deviceInfo = getDeviceInfo(req)
) => {
    const ipAddress = req.ip || req.connection.remoteAddress || "unknown";
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry (matching refresh token)

    await query(
        `INSERT INTO user_sessions (user_id, session_token, device_info, ip_address, user_agent, expires_at, client)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            userId,
            sessionToken,
            JSON.stringify(deviceInfo),
            ipAddress,
            deviceInfo.userAgent,
            expiresAt,
            client,
        ]
    );

    return deviceInfo;
};

/**
 * Helper function to get active sessions for a user on one client
 */
const getActiveSessionsForUser = async (userId, client = "web") => {
    const result = await query(
        `SELECT
            id,
            session_token,
            device_info,
            ip_address,
            user_agent,
            last_activity,
            created_at
         FROM user_sessions
         WHERE user_id = $1
         AND client = $2
         AND is_active = true
         AND expires_at > NOW()
         ORDER BY last_activity DESC`,
        [userId, client]
    );
    return result.rows;
};

/**
 * Helper function to invalidate all sessions for a user on one client (except current one)
 */
const invalidateOtherSessions = async (
    userId,
    currentSessionToken,
    client = "web"
) => {
    const result = await query(
        `UPDATE user_sessions
         SET is_active = false
         WHERE user_id = $1 AND session_token != $2 AND client = $3 AND is_active = true
         RETURNING
            device_info,
            ip_address,
            last_activity`,
        [userId, currentSessionToken, client]
    );
    return result.rows;
};

/**
 * Register a new user
 */
const register = async (req, res, next) => {
    try {
        const { email, password, first_name, last_name } = req.body;

        // Check if user already exists
        const existingUser = await query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists",
            });
        }

        // Hash password
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await query(
            `INSERT INTO users (email, password_hash, first_name, last_name)
             VALUES ($1, $2, $3, $4)
             RETURNING id, email, first_name, last_name, role, created_at, user_type`,
            [email, password_hash, first_name, last_name]
        );

        const user = result.rows[0];

        // Generate session token
        const sessionToken = uuidv4();

        // Get device info and IP
        const deviceInfo = getDeviceInfo(req);
        const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

        // Create session
        await createSession(user.id, sessionToken, req);

        // Invalidate any existing sessions (single device login)
        await invalidateOtherSessions(user.id, sessionToken);

        // Update last login information in users table
        await query(
            `UPDATE users 
             SET last_login_at = CURRENT_TIMESTAMP,
                 last_login_ip = $1,
                 last_login_device = $2
             WHERE id = $3`,
            [ipAddress, JSON.stringify(deviceInfo), user.id]
        );

        // Generate tokens with session_id
        const token = generateToken({
            userId: user.id,
            email: user.email,
            sessionId: sessionToken,
        });
        const refreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: sessionToken,
        });

        // Send welcome email (async, don't wait)
        sendWelcomeEmail(
            user.email,
            `${user.first_name} ${user.last_name}`
        ).catch((err) => console.error("Failed to send welcome email:", err));

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    role: user.role,
                    user_type: user.user_type,
                },
                token,
                refreshToken,
                deviceInfo,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Login user
 */
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Find user
        const result = await query(
            "SELECT id, email, password_hash, first_name, last_name, role, is_active, user_type FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const user = result.rows[0];

        // Check if account is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: "Account is deactivated",
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        // Check for existing active sessions before creating new one
        const existingSessions = await getActiveSessionsForUser(user.id);
        const hasMultipleDevices = existingSessions.length > 0;

        // Generate session token
        const sessionToken = uuidv4();

        // Get device info and IP
        const deviceInfo = getDeviceInfo(req);
        const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

        // Create session
        await createSession(user.id, sessionToken, req);

        // Invalidate any existing sessions (single device login)
        const invalidatedSessions = await invalidateOtherSessions(
            user.id,
            sessionToken
        );

        // Update last login information in users table
        await query(
            `UPDATE users 
             SET last_login_at = CURRENT_TIMESTAMP,
                 last_login_ip = $1,
                 last_login_device = $2
             WHERE id = $3`,
            [ipAddress, JSON.stringify(deviceInfo), user.id]
        );

        // Send warning email if logging in from multiple devices
        if (hasMultipleDevices && invalidatedSessions.length > 0) {
            sendMultipleDeviceWarningEmail(
                user.email,
                `${user.first_name} ${user.last_name}`,
                deviceInfo,
                invalidatedSessions
            ).catch((err) =>
                console.error("Failed to send multiple device warning:", err)
            );

            // Create push notification for multiple device login
            const previousDevicesText = invalidatedSessions
                .map(
                    (s) =>
                        `${s.device_info?.deviceType || "Device"} - ${
                            s.device_info?.browser || "Unknown"
                        } on ${s.device_info?.os || "Unknown OS"}`
                )
                .join(", ");

            createNotification(
                user.id,
                "multiple_device_login",
                "⚠️ New Device Login Detected",
                `You logged in from a new device. Your previous session${
                    invalidatedSessions.length > 1 ? "s" : ""
                } has been logged out for security. Previous device${
                    invalidatedSessions.length > 1 ? "s" : ""
                }: ${previousDevicesText}`,
                {
                    current_device: deviceInfo,
                    previous_devices: invalidatedSessions,
                    login_time: new Date().toISOString(),
                }
            ).catch((err) =>
                console.error(
                    "Failed to create device login notification:",
                    err
                )
            );
        }

        // Generate tokens with session_id
        const token = generateToken({
            userId: user.id,
            email: user.email,
            sessionId: sessionToken,
        });
        const refreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: sessionToken,
        });

        res.json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    role: user.role,
                    user_type: user.user_type,
                },
                token,
                refreshToken,
                deviceInfo,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Refresh access token
 */
const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: "Refresh token is required",
            });
        }

        const { verifyRefreshToken } = require("../config/jwt");
        const decoded = verifyRefreshToken(refreshToken);

        // Get user
        const result = await query(
            "SELECT id, email, is_active FROM users WHERE id = $1",
            [decoded.userId]
        );

        if (result.rows.length === 0 || !result.rows[0].is_active) {
            return res.status(401).json({
                success: false,
                message: "Invalid refresh token",
            });
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
            );
        }

        // Generate new tokens with same sessionId
        const newToken = generateToken({
            userId: user.id,
            email: user.email,
            sessionId: decoded.sessionId,
        });
        const newRefreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: decoded.sessionId,
        });

        res.json({
            success: true,
            data: {
                token: newToken,
                refreshToken: newRefreshToken,
            },
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired refresh token",
        });
    }
};

/**
 * Request password reset
 */
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        // Find user
        const result = await query(
            "SELECT id, email, first_name, last_name FROM users WHERE email = $1",
            [email]
        );

        // Don't reveal if user exists or not (security best practice)
        if (result.rows.length === 0) {
            return res.json({
                success: true,
                message:
                    "If an account exists with this email, a password reset link has been sent",
            });
        }

        const user = result.rows[0];

        // Generate reset token
        const resetToken = uuidv4();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

        // Delete old reset tokens for this user
        await query("DELETE FROM password_resets WHERE user_id = $1", [
            user.id,
        ]);

        // Create new reset token
        await query(
            `INSERT INTO password_resets (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, resetToken, expiresAt]
        );

        // Send reset email
        await sendPasswordResetEmail(
            user.email,
            `${user.first_name} ${user.last_name}`,
            resetToken
        );

        res.json({
            success: true,
            message:
                "If an account exists with this email, a password reset link has been sent",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Reset password with token
 */
const resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Token and password are required",
            });
        }

        // Find valid reset token
        const resetResult = await query(
            `SELECT pr.user_id, u.email, u.first_name, u.last_name
             FROM password_resets pr
             JOIN users u ON pr.user_id = u.id
             WHERE pr.token = $1 AND pr.expires_at > NOW() AND pr.used = false`,
            [token]
        );

        if (resetResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset token",
            });
        }

        const { user_id } = resetResult.rows[0];

        // Hash new password
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Update password
        await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
            password_hash,
            user_id,
        ]);

        // Mark token as used
        await query("UPDATE password_resets SET used = true WHERE token = $1", [
            token,
        ]);

        res.json({
            success: true,
            message: "Password reset successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Logout user (invalidate session)
 */
const logout = async (req, res, next) => {
    try {
        const sessionId = req.user?.sessionId || req.body?.sessionId;

        if (sessionId) {
            // Invalidate the session
            await query(
                `UPDATE user_sessions 
                 SET is_active = false 
                 WHERE session_token = $1`,
                [sessionId]
            );
        }

        res.json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get active sessions for current user
 */
const getActiveSessions = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT 
                id,
                session_token,
                device_info,
                ip_address,
                user_agent,
                last_activity,
                created_at,
                expires_at
             FROM user_sessions 
             WHERE user_id = $1 
             AND is_active = true 
             AND expires_at > NOW()
             ORDER BY last_activity DESC`,
            [userId]
        );

        const sessions = result.rows.map((row) => ({
            id: row.id,
            sessionToken: row.session_token,
            deviceInfo:
                typeof row.device_info === "string"
                    ? JSON.parse(row.device_info)
                    : row.device_info,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            lastActivity: row.last_activity,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            isCurrent: row.session_token === req.user.sessionId,
        }));

        res.json({
            success: true,
            data: {
                sessions,
                count: sessions.length,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ---------------------------------------------------------------------------
// Pinout app login: email + password → email OTP → tokens.
// Each account is locked to one device (users.pinout_device_id); only an admin
// can release it (DELETE /api/admin/users/:id/pinout-device).
// ---------------------------------------------------------------------------

const PINOUT_OTP_TTL_MINUTES = 10;
const PINOUT_OTP_RESEND_COOLDOWN_SECONDS = 60;
const PINOUT_OTP_MAX_ATTEMPTS = 5;

const DEVICE_MISMATCH_MESSAGE =
    "This account is registered to another device. Contact support to reset it.";

const sendDeviceMismatch = (res) =>
    res.status(403).json({
        success: false,
        code: "DEVICE_MISMATCH",
        message: DEVICE_MISMATCH_MESSAGE,
    });

/**
 * Pinout app login step 1: verify credentials + device, then email an OTP
 */
const appLogin = async (req, res, next) => {
    try {
        const { email, password, device_id } = req.body;

        const result = await query(
            "SELECT id, email, password_hash, first_name, last_name, is_active, pinout_device_id FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                code: "ACCOUNT_DEACTIVATED",
                message: "Account is deactivated",
            });
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            });
        }

        if (user.pinout_device_id && user.pinout_device_id !== device_id) {
            return sendDeviceMismatch(res);
        }

        // Resend cooldown
        const recentOtp = await query(
            `SELECT CEIL(EXTRACT(EPOCH FROM (created_at + INTERVAL '${PINOUT_OTP_RESEND_COOLDOWN_SECONDS} seconds' - NOW())))::int AS retry_after
             FROM pinout_login_otps
             WHERE user_id = $1
             AND used = false
             AND created_at > NOW() - INTERVAL '${PINOUT_OTP_RESEND_COOLDOWN_SECONDS} seconds'
             ORDER BY created_at DESC
             LIMIT 1`,
            [user.id]
        );

        if (recentOtp.rows.length > 0) {
            const retryAfterSeconds = Math.max(recentOtp.rows[0].retry_after, 1);
            return res.status(429).json({
                success: false,
                code: "OTP_COOLDOWN",
                message: `Please wait ${retryAfterSeconds}s before requesting a new code`,
                data: { retryAfterSeconds },
            });
        }

        // Only one pending code per user
        await query(
            "DELETE FROM pinout_login_otps WHERE user_id = $1 AND used = false",
            [user.id]
        );

        const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
        const otpHash = await bcrypt.hash(otp, 10);

        const otpResult = await query(
            `INSERT INTO pinout_login_otps (user_id, device_id, otp_hash, expires_at)
             VALUES ($1, $2, $3, NOW() + INTERVAL '${PINOUT_OTP_TTL_MINUTES} minutes')
             RETURNING id`,
            [user.id, device_id, otpHash]
        );
        const challengeId = otpResult.rows[0].id;

        if (process.env.NODE_ENV !== "production") {
            console.log(`🔐 Pinout login OTP for ${user.email}: ${otp}`);
        }

        const emailResult = await sendPinoutLoginOtpEmail(
            user.email,
            `${user.first_name} ${user.last_name}`,
            otp,
            PINOUT_OTP_TTL_MINUTES
        );

        if (!emailResult.success && process.env.NODE_ENV === "production") {
            // Drop the undeliverable code so the user isn't stuck behind the cooldown
            await query("DELETE FROM pinout_login_otps WHERE id = $1", [
                challengeId,
            ]);
            return res.status(503).json({
                success: false,
                code: "OTP_SEND_FAILED",
                message: "Could not send the verification code. Please try again.",
            });
        }

        res.json({
            success: true,
            message: "Verification code sent to your email",
            data: {
                challengeId,
                expiresInSeconds: PINOUT_OTP_TTL_MINUTES * 60,
                resendAfterSeconds: PINOUT_OTP_RESEND_COOLDOWN_SECONDS,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Pinout app login step 2: verify the OTP, lock the account to this device, issue tokens
 */
const appVerifyOtp = async (req, res, next) => {
    try {
        const { challenge_id, otp, device_id, device_name, device_platform } =
            req.body;

        // Consume one attempt atomically before checking the code
        const attemptResult = await query(
            `UPDATE pinout_login_otps
             SET attempts = attempts + 1
             WHERE id = $1
             AND device_id = $2
             AND used = false
             AND expires_at > NOW()
             AND attempts < $3
             RETURNING user_id, otp_hash, attempts`,
            [challenge_id, device_id, PINOUT_OTP_MAX_ATTEMPTS]
        );

        if (attemptResult.rows.length === 0) {
            const lockedResult = await query(
                `SELECT id FROM pinout_login_otps
                 WHERE id = $1 AND device_id = $2 AND used = false AND expires_at > NOW()`,
                [challenge_id, device_id]
            );

            if (lockedResult.rows.length > 0) {
                await query(
                    "UPDATE pinout_login_otps SET used = true WHERE id = $1",
                    [challenge_id]
                );
                return res.status(429).json({
                    success: false,
                    code: "OTP_TOO_MANY_ATTEMPTS",
                    message: "Too many incorrect attempts. Please log in again.",
                });
            }

            return res.status(400).json({
                success: false,
                code: "OTP_EXPIRED",
                message: "This code has expired. Please log in again.",
            });
        }

        const challenge = attemptResult.rows[0];
        const isOtpValid = await bcrypt.compare(otp, challenge.otp_hash);

        if (!isOtpValid) {
            const attemptsRemaining =
                PINOUT_OTP_MAX_ATTEMPTS - challenge.attempts;

            if (attemptsRemaining <= 0) {
                await query(
                    "UPDATE pinout_login_otps SET used = true WHERE id = $1",
                    [challenge_id]
                );
                return res.status(429).json({
                    success: false,
                    code: "OTP_TOO_MANY_ATTEMPTS",
                    message: "Too many incorrect attempts. Please log in again.",
                });
            }

            return res.status(400).json({
                success: false,
                code: "OTP_INVALID",
                message: `Incorrect code. ${attemptsRemaining} attempt${
                    attemptsRemaining === 1 ? "" : "s"
                } left.`,
                data: { attemptsRemaining },
            });
        }

        // Single use: only one request can claim the code
        const claimResult = await query(
            "UPDATE pinout_login_otps SET used = true WHERE id = $1 AND used = false RETURNING id",
            [challenge_id]
        );

        if (claimResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                code: "OTP_EXPIRED",
                message: "This code has expired. Please log in again.",
            });
        }

        const userResult = await query(
            "SELECT id, email, first_name, last_name, role, user_type, is_active FROM users WHERE id = $1",
            [challenge.user_id]
        );

        if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
            return res.status(401).json({
                success: false,
                code: "ACCOUNT_DEACTIVATED",
                message: "Account is deactivated",
            });
        }

        const user = userResult.rows[0];

        const deviceInfo = {
            deviceType: "mobile",
            browser: "Pinout app",
            os: device_platform || "unknown",
            deviceName: device_name || "Unknown device",
            userAgent: req.headers["user-agent"] || "",
        };

        // Lock the account to this device. The WHERE clause makes this race-safe:
        // if another device bound first, zero rows update.
        const bindResult = await query(
            `UPDATE users
             SET pinout_device_id = $1,
                 pinout_device_info = $2,
                 pinout_device_bound_at = COALESCE(pinout_device_bound_at, CURRENT_TIMESTAMP)
             WHERE id = $3
             AND (pinout_device_id IS NULL OR pinout_device_id = $1)
             RETURNING id`,
            [device_id, JSON.stringify(deviceInfo), user.id]
        );

        if (bindResult.rows.length === 0) {
            return sendDeviceMismatch(res);
        }

        const sessionToken = uuidv4();
        await createSession(user.id, sessionToken, req, "pinout", deviceInfo);
        await invalidateOtherSessions(user.id, sessionToken, "pinout");

        const token = generateToken({
            userId: user.id,
            email: user.email,
            sessionId: sessionToken,
        });
        const refreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: sessionToken,
        });

        res.json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    role: user.role,
                    user_type: user.user_type,
                },
                token,
                refreshToken,
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    login,
    refreshToken,
    forgotPassword,
    resetPassword,
    logout,
    getActiveSessions,
    appLogin,
    appVerifyOtp,
};
