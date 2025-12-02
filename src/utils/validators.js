const { body } = require("express-validator");

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
        .matches(/youtube\.com|youtu\.be/)
        .withMessage("Video URL must be a YouTube URL"),
    body("order_index")
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

module.exports = {
    registerValidation,
    loginValidation,
    createCourseValidation,
    createVideoValidation,
    createRequestValidation,
    approveRequestValidation,
};
