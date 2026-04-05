const nodemailer = require("nodemailer");
require("dotenv").config();

// Create reusable transporter object
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465", // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Verify connection configuration (only if email is configured)
if (
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_USER !== "your-email@gmail.com"
) {
    transporter.verify((error, success) => {
        if (error) {
            console.warn(
                "⚠️  Email service configuration error (emails will not be sent):",
                error.message
            );
        } else {
            console.log("✅ Email service is ready to send messages");
        }
    });
} else {
    console.log(
        "ℹ️  Email service not configured (using placeholder credentials)"
    );
}

/**
 * Send email
 */
const sendEmail = async (to, subject, html, text = "") => {
    // Skip email sending if email is not properly configured
    if (
        !process.env.EMAIL_USER ||
        !process.env.EMAIL_PASS ||
        process.env.EMAIL_USER === "your-email@gmail.com"
    ) {
        console.warn(
            `⚠️  Email not sent (service not configured): ${subject} to ${to}`
        );
        return { success: false, message: "Email service not configured" };
    }

    try {
        const info = await transporter.sendMail({
            from: `"E-Learning Platform" <${process.env.EMAIL_FROM}>`,
            to,
            subject,
            text,
            html,
        });

        console.log("✅ Email sent:", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("❌ Error sending email:", error.message);
        // Don't throw error, just log it so the app doesn't crash
        return { success: false, error: error.message };
    }
};

/**
 * Send welcome email
 */
const sendWelcomeEmail = async (userEmail, userName) => {
    const subject = "Welcome to E-Learning Platform!";
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B00000;">Welcome to E-Learning Platform!</h2>
            <p>Hi ${userName},</p>
            <p>Thank you for registering with us. You can now explore our courses and start learning!</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send course access approved email
 */
const sendCourseAccessApprovedEmail = async (
    userEmail,
    userName,
    courseName,
    accessStart,
    accessEnd
) => {
    const subject = `Course Access Approved: ${courseName}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B00000;">Course Access Approved!</h2>
            <p>Hi ${userName},</p>
            <p>Great news! Your request for <strong>${courseName}</strong> has been approved.</p>
            <p><strong>Access Period:</strong></p>
            <ul>
                <li>Start: ${new Date(accessStart).toLocaleString()}</li>
                <li>End: ${new Date(accessEnd).toLocaleString()}</li>
            </ul>
            <p>You can now access all course content. Happy learning!</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send course access rejected email
 */
const sendCourseAccessRejectedEmail = async (
    userEmail,
    userName,
    courseName,
    reason = ""
) => {
    const subject = `Course Access Request: ${courseName}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B00000;">Course Access Request Update</h2>
            <p>Hi ${userName},</p>
            <p>Unfortunately, your request for <strong>${courseName}</strong> has been rejected.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (userEmail, userName, resetToken) => {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const subject = "Password Reset Request";
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B00000;">Password Reset Request</h2>
            <p>Hi ${userName},</p>
            <p>You requested to reset your password. Click the link below to reset it:</p>
            <p><a href="${resetUrl}" style="background-color: #B00000; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send multiple device login warning email
 */
const sendMultipleDeviceWarningEmail = async (
    userEmail,
    userName,
    currentDevice,
    previousDevices
) => {
    const subject = "⚠️ New Device Login Detected";
    const deviceList = previousDevices
        .map(
            (device) => `
        <li>
            <strong>${device.deviceInfo.deviceType}</strong> - ${
                device.deviceInfo.browser
            } on ${device.deviceInfo.os}<br>
            <small>IP: ${device.ipAddress} | Last active: ${new Date(
                device.last_activity
            ).toLocaleString()}</small>
        </li>
    `
        )
        .join("");

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B00000;">⚠️ New Device Login Detected</h2>
            <p>Hi ${userName},</p>
            <p>We detected a login from a new device. Your previous session has been logged out for security.</p>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #856404;">New Login Details:</h3>
                <p>
                    <strong>Device:</strong> ${currentDevice.deviceType} - ${
        currentDevice.browser
    } on ${currentDevice.os}<br>
                    <strong>Time:</strong> ${new Date().toLocaleString()}
                </p>
            </div>

            ${
                previousDevices.length > 0
                    ? `
            <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0;">
                <h3 style="margin-top: 0;">Previous Active Sessions (now logged out):</h3>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    ${deviceList}
                </ul>
            </div>
            `
                    : ""
            }

            <p><strong>If this wasn't you:</strong></p>
            <ul>
                <li>Change your password immediately</li>
                <li>Review your account security settings</li>
                <li>Contact support if you notice any suspicious activity</li>
            </ul>

            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send KYC approved email
 */
const sendKYCApprovedEmail = async (userEmail, userName, kycType = "Student KYC") => {
    const subject = `${kycType} Verification Approved!`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">✅ ${kycType} Verification Approved!</h2>
            <p>Hi ${userName},</p>
            <p>Great news! Your ${kycType} verification has been approved.</p>
            
            ${kycType === "Student KYC" ? `
            <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>You can now:</strong></p>
                <ul style="margin: 10px 0;">
                    <li>Purchase courses directly</li>
                    <li>Buy regular products</li>
                    <li>Upgrade to Business Owner to purchase KYC-required products</li>
                </ul>
            </div>
            ` : `
            <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>You can now:</strong></p>
                <ul style="margin: 10px 0;">
                    <li>Purchase courses</li>
                    <li>Buy all products including KYC-required items</li>
                    <li>Place bulk orders</li>
                </ul>
            </div>
            `}
            
            <p>Start exploring our platform and make your first purchase!</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send KYC rejected email
 */
const sendKYCRejectedEmail = async (userEmail, userName, reason, kycType = "Student KYC") => {
    const subject = `${kycType} Verification Needs Review`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc3545;">⚠️ ${kycType} Verification Needs Review</h2>
            <p>Hi ${userName},</p>
            <p>We've reviewed your ${kycType} submission and unfortunately we need some clarification.</p>
            
            <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Reason:</strong></p>
                <p style="margin: 10px 0;">${reason}</p>
            </div>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>What's next?</strong></p>
                <ul style="margin: 10px 0;">
                    <li>Review the reason above</li>
                    <li>Prepare the required documents</li>
                    <li>Resubmit your ${kycType} information</li>
                </ul>
            </div>
            
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send KYC pending email (when submitted)
 */
const sendKYCPendingEmail = async (userEmail, userName, kycType = "Student KYC") => {
    const subject = `${kycType} Submitted Successfully`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B00000;">📋 ${kycType} Submitted!</h2>
            <p>Hi ${userName},</p>
            <p>Thank you for submitting your ${kycType} information.</p>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>What happens next?</strong></p>
                <p style="margin: 10px 0;">Our team will review your submission during business hours (9 AM - 6 PM, business days). You'll receive an email notification once your verification is approved.</p>
            </div>
            
            <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Review Time:</strong></p>
                <p style="margin: 10px 0;">Usually within 1-2 business days</p>
            </div>
            
            <p>Thank you for your patience!</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

/**
 * Send Product Extra Information Email
 */
const sendProductExtraInfoEmail = async (userEmail, userName, productName, extraInfoTitle, accessUrl) => {
    const subject = `You got access to ${extraInfoTitle || productName || 'your product information'}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B00000;">Product Extra Information Access</h2>
            <p>Hi ${userName},</p>
            <p>You got access to <strong>${extraInfoTitle || productName || 'this product information'}</strong>.</p>
            <p>You can now view the title, content, images, and PDF files on the protected page.</p>

            ${accessUrl
                ? `<div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; text-align: center;">
                <a href="${accessUrl}" style="background-color: #B00000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Open ${extraInfoTitle || 'Extra Information'}</a>
            </div>
            <p>Please log in to your account first if access requires authentication.</p>`
                : `<p>The shared package includes rich text, images, and PDF files. Please contact support if you need help accessing it.</p>`}

            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>E-Learning Platform Team</p>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
};

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendCourseAccessApprovedEmail,
    sendCourseAccessRejectedEmail,
    sendPasswordResetEmail,
    sendMultipleDeviceWarningEmail,
    sendKYCApprovedEmail,
    sendKYCRejectedEmail,
    sendKYCPendingEmail,
    sendProductExtraInfoEmail,
};
