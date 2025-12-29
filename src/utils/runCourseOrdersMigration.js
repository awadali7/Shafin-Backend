require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
    try {
        console.log("🔄 Starting course_orders table migration...");

        // Read migration SQL file
        const migrationPath = path.join(
            __dirname,
            "../../migrations/add_course_orders_table.sql"
        );
        if (!fs.existsSync(migrationPath)) {
            console.error("❌ Migration file not found:", migrationPath);
            process.exit(1);
        }

        const migrationSql = fs.readFileSync(migrationPath, "utf8");

        // Execute migration
        await pool.query(migrationSql);

        console.log("✅ Migration completed successfully!");
        console.log("   - Created 'course_orders' table");
        console.log("   - Added indexes for better performance");
        console.log("   - Table is ready to track course purchases");

        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        if (error.code === "42P07") {
            console.log("ℹ️  Table may already exist. This is safe to ignore.");
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();

