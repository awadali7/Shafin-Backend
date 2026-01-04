require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
    const migrations = [
        {
            name: "Add terms acceptance to users",
            file: "add_terms_acceptance_to_users.sql",
        },
        {
            name: "Add last login fields to users",
            file: "add_last_login_fields.sql",
        },
        {
            name: "Add images and videos to products",
            file: "add_product_images_videos.sql",
        },
        {
            name: "Add id_proof_urls to kyc_verifications",
            file: "update_kyc_id_proof_multiple.sql",
        },
        {
            name: "Update notifications type constraint",
            file: "add_kyc_table.sql", // This file also updates notifications
        },
    ];

    try {
        console.log("🔄 Starting column migrations...\n");

        for (const migration of migrations) {
            const migrationPath = path.join(
                __dirname,
                "../../migrations",
                migration.file
            );

            if (!fs.existsSync(migrationPath)) {
                console.log(`⚠️  Migration file not found: ${migration.file}`);
                continue;
            }

            try {
                console.log(`📝 Running: ${migration.name}...`);
                const migrationSql = fs.readFileSync(migrationPath, "utf8");
                await pool.query(migrationSql);
                console.log(`✅ ${migration.name} - Completed\n`);
            } catch (error) {
                // Check if it's a "column already exists" type error (safe to ignore)
                if (
                    error.code === "42701" || // duplicate column
                    error.message.includes("already exists") ||
                    error.message.includes("duplicate")
                ) {
                    console.log(`ℹ️  ${migration.name} - Column(s) already exist (skipped)\n`);
                } else {
                    console.error(`❌ ${migration.name} - Failed:`, error.message);
                    // Continue with other migrations even if one fails
                }
            }
        }

        console.log("✅ All column migrations completed!");

        // Verify columns
        console.log("\n📊 Verifying columns...");
        const verifyQueries = [
            {
                table: "users",
                columns: [
                    "terms_accepted_at",
                    "last_login_at",
                    "last_login_ip",
                    "last_login_device",
                ],
            },
            {
                table: "products",
                columns: ["images", "videos"],
            },
            {
                table: "kyc_verifications",
                columns: ["id_proof_urls"],
            },
        ];

        for (const verify of verifyQueries) {
            for (const column of verify.columns) {
                const result = await pool.query(
                    `SELECT column_name 
                     FROM information_schema.columns 
                     WHERE table_name = $1 AND column_name = $2`,
                    [verify.table, column]
                );
                if (result.rows.length > 0) {
                    console.log(`  ✅ ${verify.table}.${column} exists`);
                } else {
                    console.log(`  ⚠️  ${verify.table}.${column} missing`);
                }
            }
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();


