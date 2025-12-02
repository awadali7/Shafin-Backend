/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error("Error:", err);

    // Default error
    let error = { ...err };
    error.message = err.message;

    // PostgreSQL errors
    if (err.code) {
        switch (err.code) {
            case "23505": // Unique violation
                error.message = "Duplicate entry. This record already exists.";
                error.statusCode = 409;
                break;
            case "23503": // Foreign key violation
                error.message = "Referenced record does not exist.";
                error.statusCode = 400;
                break;
            case "23502": // Not null violation
                error.message = "Required field is missing.";
                error.statusCode = 400;
                break;
            case "42P01": // Undefined table
                error.message = "Database table does not exist.";
                error.statusCode = 500;
                break;
            default:
                error.message = "Database error occurred.";
                error.statusCode = 500;
        }
    }

    // JWT errors
    if (err.name === "JsonWebTokenError") {
        error.message = "Invalid token";
        error.statusCode = 401;
    }

    if (err.name === "TokenExpiredError") {
        error.message = "Token expired";
        error.statusCode = 401;
    }

    // Validation errors
    if (err.name === "ValidationError") {
        error.message = Object.values(err.errors)
            .map((e) => e.message)
            .join(", ");
        error.statusCode = 400;
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Server Error",
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};

module.exports = errorHandler;
