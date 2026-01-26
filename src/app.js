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
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const paymentRoutes = require("./routes/payments");
const kycRoutes = require("./routes/kyc");
const productKycRoutes = require("./routes/product-kyc");
const termsRoutes = require("./routes/terms");

// Import middleware
const errorHandler = require("./middleware/errorHandler");

// Load Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, "../swagger.yaml"));

const app = express();

// Trust proxy for accurate IP detection (important for production with load balancers/proxies)
app.set("trust proxy", true);

// Security middleware with CSP configured to allow images from frontend
const getFrontendUrls = () => {
    const urls = ["http://localhost:3000", "http://localhost:3001"];

    if (process.env.FRONTEND_URL) {
        // Handle comma-separated list of URLs
        const frontendUrls = process.env.FRONTEND_URL.split(",").map((url) =>
            url.trim()
        );
        urls.push(...frontendUrls);
    }

    // Add common production URLs
    if (process.env.NODE_ENV === "production") {
        urls.push("https://diagtools.in", "https://www.diagtools.in");
    }

    // Remove duplicates
    return [...new Set(urls)];
};

const frontendUrls = getFrontendUrls();

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "blob:", "https:", ...frontendUrls],
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
// Support multiple origins: production frontend + localhost for development
const getAllowedOrigins = () => {
    const origins = ["http://localhost:3000", "http://localhost:3001"];

    if (process.env.FRONTEND_URL) {
        // Handle comma-separated list of URLs
        const frontendUrls = process.env.FRONTEND_URL.split(",").map((url) =>
            url.trim()
        );
        origins.push(...frontendUrls);
    }

    // Add common production URLs
    if (process.env.NODE_ENV === "production") {
        origins.push("https://diagtools.in", "https://www.diagtools.in");
    }

    // Remove duplicates
    return [...new Set(origins)];
};

app.use(
    cors({
        origin: (origin, callback) => {
            const allowedOrigins = getAllowedOrigins();

            // Allow requests with no origin (like mobile apps or Postman)
            if (!origin) {
                return callback(null, true);
            }

            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                // Log for debugging
                console.warn(`CORS blocked origin: ${origin}`);
                console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposedHeaders: ["Content-Range", "X-Content-Range"],
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
app.use("/api/orders", jsonParser, urlencodedParser);
app.use("/api/payments", jsonParser, urlencodedParser);
app.use("/api/terms", jsonParser, urlencodedParser);

// DO NOT apply body parsers to these routes (they use multipart/form-data):
// - /api/courses (POST uses multer for cover_image file uploads)
// - /api/uploads/* (all routes use multer for file uploads)
// - /api/products/admin (uses multer for cover_image/digital_file uploads)
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
app.use("/api/kyc", kycRoutes);
app.use("/api/product-kyc", productKycRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/terms", termsRoutes);

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
