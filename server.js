require("dotenv").config();
const app = require("./src/app");
const { ensureRequiredSchema } = require("./src/config/database");

const PORT = process.env.PORT || 3000;

async function startServer() {
    await ensureRequiredSchema();

    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`🌐 API: http://localhost:${PORT}/api`);
    });
}

startServer().catch((error) => {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
});
