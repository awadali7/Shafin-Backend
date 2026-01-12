require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
    try {
        console.log("🔄 Starting product images/videos migration...");

        // Read migration SQL file
        const migrationPath = path.join(
            __dirname,
            "../../migrations/add_product_images_videos.sql"
        );
        if (!fs.existsSync(migrationPath)) {
            console.error("❌ Migration file not found!");
            process.exit(1);
        }

        const migrationSql = fs.readFileSync(migrationPath, "utf8");

        // Execute migration
        await pool.query(migrationSql);

        console.log("✅ Migration completed successfully!");
        console.log("   - Added 'images' JSONB column to products table");
        console.log("   - Added 'videos' JSONB column to products table");
        console.log("   - Migrated existing cover_image to images array");
        console.log("   - Created indexes for better performance");

        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        if (error.code === "42701") {
            console.log("ℹ️  Columns may already exist. This is safe to ignore.");
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();



