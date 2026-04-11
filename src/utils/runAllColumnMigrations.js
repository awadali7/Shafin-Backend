require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

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
        file: "add_kyc_table.sql",
    },
    {
        name: "Add product extra info tables and columns",
        file: "add_product_extra_infos.sql",
    },
    {
        name: "Add product shipping and origin columns",
        file: "add_product_shipping_columns.sql",
    },
    {
        name: "Add product price visibility flag for KYC products",
        file: "add_product_price_visibility_for_kyc.sql",
    },
];

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
        columns: [
            "images",
            "videos",
            "product_extra_info_id",
            "origin_city",
            "origin_state",
            "origin_pincode",
            "show_price_before_kyc",
        ],
    },
    {
        table: "kyc_verifications",
        columns: ["id_proof_urls"],
    },
    {
        table: "product_extra_infos",
        columns: ["id", "title", "slug", "zip_file_path"],
    },
    {
        table: "product_extra_info_access",
        columns: ["user_id", "product_extra_info_id", "source"],
    },
];

async function runAllColumnMigrations(pool) {
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
            if (
                error.code === "42701" ||
                error.message.includes("already exists") ||
                error.message.includes("duplicate")
            ) {
                console.log(
                    `ℹ️  ${migration.name} - Column(s) already exist (skipped)\n`
                );
            } else {
                console.error(`❌ ${migration.name} - Failed:`, error.message);
            }
        }
    }

    console.log("✅ All column migrations completed!");
    console.log("\n📊 Verifying columns...");

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
}

async function runMigrationsCli() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await runAllColumnMigrations(pool);
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    runMigrationsCli();
}

module.exports = {
    runAllColumnMigrations,
};


