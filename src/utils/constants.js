/**
 * Application constants
 */

// User roles
const ROLES = {
    USER: "user",
    ADMIN: "admin",
};

// Course request statuses
const REQUEST_STATUS = {
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
};

// Email types
const EMAIL_TYPES = {
    WELCOME: "welcome",
    COURSE_APPROVED: "course_approved",
    COURSE_REJECTED: "course_rejected",
    PASSWORD_RESET: "password_reset",
};

// Default pagination
const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
};

module.exports = {
    ROLES,
    REQUEST_STATUS,
    EMAIL_TYPES,
    PAGINATION,
};
