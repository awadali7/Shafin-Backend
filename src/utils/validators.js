const { body, param } = require("express-validator");

/**
 * Validation rules for user registration
 */
const registerValidation = [
    body("email")
        .isEmail()
        .withMessage("Please provide a valid email address")
        .normalizeEmail(),
    body("password")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters long")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage(
            "Password must contain at least one uppercase letter, one lowercase letter, and one number"
        ),
    body("first_name")
        .trim()
        .notEmpty()
        .withMessage("First name is required")
        .isLength({ min: 2, max: 100 })
        .withMessage("First name must be between 2 and 100 characters"),
    body("last_name")
        .trim()
        .notEmpty()
        .withMessage("Last name is required")
        .isLength({ min: 2, max: 100 })
        .withMessage("Last name must be between 2 and 100 characters"),
];

/**
 * Validation rules for user login
 */
const loginValidation = [
    body("email")
        .isEmail()
        .withMessage("Please provide a valid email address")
        .normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
];

/**
 * Validation rules for course creation
 */
const createCourseValidation = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("Course name is required")
        .isLength({ min: 3, max: 255 })
        .withMessage("Course name must be between 3 and 255 characters"),
    body("slug")
        .trim()
        .notEmpty()
        .withMessage("Course slug is required")
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .withMessage("Slug must be lowercase alphanumeric with hyphens"),
    body("price")
        .isFloat({ min: 0 })
        .withMessage("Price must be a positive number"),
    body("description")
        .optional()
        .isString()
        .withMessage("Description must be a string"),
];

/**
 * Validation rules for video creation
 * Supports both YouTube and Vimeo URLs
 */
const createVideoValidation = [
    body("title")
        .trim()
        .notEmpty()
        .withMessage("Video title is required")
        .isLength({ min: 3, max: 255 })
        .withMessage("Video title must be between 3 and 255 characters"),
    body("video_url")
        .isURL()
        .withMessage("Video URL must be a valid URL")
        .matches(/youtube\.com|youtu\.be|vimeo\.com/)
        .withMessage("Video URL must be a YouTube or Vimeo URL"),
    body("order_index")
        .isInt({ min: 0 })
        .withMessage("Order index must be a non-negative integer"),
    body("description")
        .optional()
        .isString()
        .withMessage("Description must be a string"),
];

/**
 * Validation rules for video update - all fields optional (partial update),
 * but validated the same way as creation when present. Without this, editing
 * a video accepted any truthy video_url with no format/domain check at all.
 */
const updateVideoValidation = [
    body("title")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Video title cannot be empty")
        .isLength({ min: 3, max: 255 })
        .withMessage("Video title must be between 3 and 255 characters"),
    body("video_url")
        .optional()
        .isURL()
        .withMessage("Video URL must be a valid URL")
        .matches(/youtube\.com|youtu\.be|vimeo\.com/)
        .withMessage("Video URL must be a YouTube or Vimeo URL"),
    body("order_index")
        .optional()
        .isInt({ min: 0 })
        .withMessage("Order index must be a non-negative integer"),
    body("description")
        .optional()
        .isString()
        .withMessage("Description must be a string"),
];

/**
 * Validation rules for course request
 */
const createRequestValidation = [
    body("course_id").isUUID().withMessage("Course ID must be a valid UUID"),
    body("request_message")
        .optional()
        .isString()
        .isLength({ max: 1000 })
        .withMessage("Request message must be less than 1000 characters"),
];

/**
 * Validation rules for approving course request
 */
const approveRequestValidation = [
    body("access_start")
        .isISO8601()
        .withMessage("Access start must be a valid ISO 8601 date"),
    body("access_end")
        .isISO8601()
        .withMessage("Access end must be a valid ISO 8601 date")
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.access_start)) {
                throw new Error("Access end must be after access start");
            }
            return true;
        }),
];

// ---------------------------------------------------------------------------
// Pinout app accounts (separate from website users)
// ---------------------------------------------------------------------------

const appEmailRule = () =>
    body("email")
        .isString()
        .withMessage("Please provide a valid email address")
        .bail()
        .trim()
        .isEmail()
        .withMessage("Please provide a valid email address")
        .bail()
        .toLowerCase();

const appPasswordRule = () =>
    body("password")
        .isString()
        .withMessage("Password is required")
        .bail()
        .isLength({ min: 6, max: 128 })
        .withMessage("Password must be at least 6 characters long")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage(
            "Password must contain at least one uppercase letter, one lowercase letter, and one number"
        );

const appOtpRules = () => [
    body("challenge_id").isUUID().withMessage("Invalid verification request"),
    body("otp")
        .matches(/^\d{6}$/)
        .withMessage("Enter the 6-digit code from your email"),
];

/**
 * Validation rules for the Pinout app device fields
 */
const appDeviceValidation = [
    body("device_id")
        .isString()
        .withMessage("A valid device ID is required")
        .bail()
        .trim()
        .isLength({ min: 8, max: 128 })
        .withMessage("A valid device ID is required"),
    body("device_name").optional().isString().trim().isLength({ max: 100 }),
    body("device_platform").optional().isString().trim().isLength({ max: 30 }),
];

/**
 * Validation rules for Pinout app signup (step 1: email a code)
 */
const appSignupValidation = [
    body("full_name")
        .isString()
        .withMessage("Full name is required")
        .bail()
        .trim()
        .isLength({ min: 2, max: 150 })
        .withMessage("Full name must be between 2 and 150 characters"),
    appEmailRule(),
    appPasswordRule(),
];

/**
 * Validation rules for Pinout app signup (step 2: verify the code)
 */
const appVerifySignupValidation = [...appOtpRules(), ...appDeviceValidation];

/**
 * Validation rules for Pinout app login
 */
const appLoginValidation = [
    appEmailRule(),
    body("password").notEmpty().withMessage("Password is required"),
    ...appDeviceValidation,
];

/**
 * Validation rules for Pinout app forgot password
 */
const appForgotPasswordValidation = [appEmailRule()];

/**
 * Validation rules for Pinout app password reset
 */
const appResetPasswordValidation = [...appOtpRules(), appPasswordRule()];

/**
 * Validation rules for the Pinout app serial number.
 * Stored normalized (no spaces, uppercase) so "ab 123" and "AB123" count as
 * the same serial for the uniqueness check.
 */
const appSerialValidation = [
    body("serial_number")
        .isString()
        .withMessage("Serial number is required")
        .bail()
        .customSanitizer((value) => value.replace(/\s+/g, "").toUpperCase())
        .matches(/^[A-Z0-9\-/_.]{3,50}$/)
        .withMessage(
            "Enter a valid serial number (3-50 letters, numbers, - / _ .)"
        ),
];

/**
 * Validation rules for admin approve/reject of an app user
 */
const appUserIdValidation = [param("id").isUUID().withMessage("Invalid app user")];

const appRejectValidation = [
    ...appUserIdValidation,
    body("reason")
        .optional({ values: "null" })
        .isString()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Reason must be 500 characters or less"),
];

module.exports = {
    registerValidation,
    loginValidation,
    appSignupValidation,
    appVerifySignupValidation,
    appLoginValidation,
    appForgotPasswordValidation,
    appResetPasswordValidation,
    appSerialValidation,
    appUserIdValidation,
    appRejectValidation,
    createCourseValidation,
    createVideoValidation,
    updateVideoValidation,
    createRequestValidation,
    approveRequestValidation,
};
