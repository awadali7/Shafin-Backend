require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function migrateKyc() {
    try {
        console.log("🔄 Starting KYC table migration...");

        // Read migration SQL file
        const migrationPath = path.join(
            __dirname,
            "../../migrations/add_kyc_table.sql"
        );
        if (!fs.existsSync(migrationPath)) {
            console.error("❌ add_kyc_table.sql file not found!");
            process.exit(1);
        }

        const migrationSQL = fs.readFileSync(migrationPath, "utf8");

        // Execute migration
        await pool.query(migrationSQL);

        console.log("✅ KYC table migration completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        console.error(error);
        process.exit(1);
    }
}

migrateKyc();
