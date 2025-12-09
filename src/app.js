const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const courseRoutes = require("./routes/courses");
const videoRoutes = require("./routes/videos");
const requestRoutes = require("./routes/requests");
const progressRoutes = require("./routes/progress");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notifications");
const blogRoutes = require("./routes/blogs");
const uploadRoutes = require("./routes/uploads");

// Import middleware
const errorHandler = require("./middleware/errorHandler");

// Load Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, "../swagger.yaml"));

const app = express();

// Trust proxy for accurate IP detection (important for production with load balancers/proxies)
app.set("trust proxy", true);

// Security middleware with CSP configured to allow images from frontend
const frontendUrls = process.env.FRONTEND_URL
    ? Array.isArray(process.env.FRONTEND_URL)
        ? process.env.FRONTEND_URL
        : [process.env.FRONTEND_URL]
    : ["http://localhost:3000", "http://localhost:3001"];

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "blob:", ...frontendUrls, "https:"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https:"],
                fontSrc: ["'self'", "https:", "data:"],
                connectSrc: ["'self'", ...frontendUrls],
            },
        },
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);

// CORS configuration
app.use(
    cors({
        origin: process.env.FRONTEND_URL || [
            "http://localhost:3000",
            "http://localhost:3001",
        ],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

// Body parsing middleware
// CRITICAL: Do NOT apply body parsers globally - they interfere with multipart/form-data
// Apply body parsers only to routes that need JSON/URL-encoded parsing
// Routes with file uploads (courses POST, uploads) use multer instead

const jsonParser = express.json({ limit: "50mb" });
const urlencodedParser = express.urlencoded({ extended: true, limit: "50mb" });

// Apply body parsers ONLY to routes that don't use multipart
app.use("/api/auth", jsonParser, urlencodedParser);
app.use("/api/users", jsonParser, urlencodedParser);
app.use("/api/admin", jsonParser, urlencodedParser);
app.use("/api/course-requests", jsonParser, urlencodedParser);
app.use("/api/progress", jsonParser, urlencodedParser);
app.use("/api/notifications", jsonParser, urlencodedParser);
app.use("/api/blogs", jsonParser, urlencodedParser);

// DO NOT apply body parsers to these routes (they use multipart/form-data):
// - /api/courses (POST uses multer for cover_image file uploads)
// - /api/uploads/* (all routes use multer for file uploads)
// - Video routes under /api/courses/:courseId/videos use JSON (no file uploads in route definition)

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Logging middleware
if (process.env.NODE_ENV !== "production") {
    app.use(morgan("dev"));
} else {
    app.use(morgan("combined"));
}

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        message: "Server is running",
        timestamp: new Date().toISOString(),
    });
});

// Swagger API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/courses", videoRoutes);
app.use("/api/course-requests", requestRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/uploads", uploadRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
