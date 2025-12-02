const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { query, getClient } = require("../config/database");
const { generateToken, generateRefreshToken } = require("../config/jwt");
const {
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendMultipleDeviceWarningEmail,
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
 * Helper function to create a session
 */
const createSession = async (userId, sessionToken, req) => {
    const deviceInfo = getDeviceInfo(req);
    const ipAddress = req.ip || req.connection.remoteAddress || "unknown";
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry (matching refresh token)

    await query(
        `INSERT INTO user_sessions (user_id, session_token, device_info, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            userId,
            sessionToken,
            JSON.stringify(deviceInfo),
            ipAddress,
            deviceInfo.userAgent,
            expiresAt,
        ]
    );

    return deviceInfo;
};

/**
 * Helper function to get active sessions for a user
 */
const getActiveSessionsForUser = async (userId) => {
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
         AND is_active = true 
         AND expires_at > NOW()
         ORDER BY last_activity DESC`,
        [userId]
    );
    return result.rows;
};

/**
 * Helper function to invalidate all sessions for a user (except current one)
 */
const invalidateOtherSessions = async (userId, currentSessionToken) => {
    const result = await query(
        `UPDATE user_sessions 
         SET is_active = false 
         WHERE user_id = $1 AND session_token != $2 AND is_active = true
         RETURNING 
            device_info,
            ip_address,
            last_activity`,
        [userId, currentSessionToken]
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
             RETURNING id, email, first_name, last_name, role, created_at`,
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
            "SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1",
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

module.exports = {
    register,
    login,
    refreshToken,
    forgotPassword,
    resetPassword,
    logout,
    getActiveSessions,
};
