require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function updateServerDatabase() {
    try {
        console.log("🔄 Starting server database update...");
        console.log("📋 This will add missing tables and columns\n");

        // Read the comprehensive update SQL file
        const migrationPath = path.join(
            __dirname,
            "../../migrations/update_server_database.sql"
        );

        if (!fs.existsSync(migrationPath)) {
            console.error("❌ Migration file not found:", migrationPath);
            console.error("   Please ensure update_server_database.sql exists in migrations folder");
            process.exit(1);
        }

        const migrationSql = fs.readFileSync(migrationPath, "utf8");

        // Execute migration
        console.log("📝 Executing database updates...\n");
        await pool.query(migrationSql);

        console.log("✅ Server database update completed successfully!\n");

        // Verify updates
        console.log("🔍 Verifying updates...\n");

        // Check course_orders table
        const courseOrdersCheck = await pool.query(
            `SELECT COUNT(*) as count 
             FROM information_schema.tables 
             WHERE table_name = 'course_orders'`
        );
        if (courseOrdersCheck.rows[0].count > 0) {
            console.log("  ✅ course_orders table exists");
        } else {
            console.log("  ⚠️  course_orders table not found");
        }

        // Check users table columns
        const usersColumns = await pool.query(
            `SELECT column_name 
             FROM information_schema.columns 
             WHERE table_name = 'users' 
             AND column_name IN ('terms_accepted_at', 'last_login_at', 'last_login_ip', 'last_login_device')
             ORDER BY column_name`
        );
        const expectedUserColumns = ['terms_accepted_at', 'last_login_at', 'last_login_ip', 'last_login_device'];
        const foundUserColumns = usersColumns.rows.map(r => r.column_name);
        expectedUserColumns.forEach(col => {
            if (foundUserColumns.includes(col)) {
                console.log(`  ✅ users.${col} exists`);
            } else {
                console.log(`  ⚠️  users.${col} missing`);
            }
        });

        // Check products table columns
        const productsColumns = await pool.query(
            `SELECT column_name 
             FROM information_schema.columns 
             WHERE table_name = 'products' 
             AND column_name IN ('images', 'videos')
             ORDER BY column_name`
        );
        const expectedProductColumns = ['images', 'videos'];
        const foundProductColumns = productsColumns.rows.map(r => r.column_name);
        expectedProductColumns.forEach(col => {
            if (foundProductColumns.includes(col)) {
                console.log(`  ✅ products.${col} exists`);
            } else {
                console.log(`  ⚠️  products.${col} missing`);
            }
        });

        // Check kyc_verifications table and column
        const kycTableCheck = await pool.query(
            `SELECT COUNT(*) as count 
             FROM information_schema.tables 
             WHERE table_name = 'kyc_verifications'`
        );
        if (kycTableCheck.rows[0].count > 0) {
            const kycColumnCheck = await pool.query(
                `SELECT column_name 
                 FROM information_schema.columns 
                 WHERE table_name = 'kyc_verifications' 
                 AND column_name = 'id_proof_urls'`
            );
            if (kycColumnCheck.rows.length > 0) {
                console.log(`  ✅ kyc_verifications.id_proof_urls exists`);
            } else {
                console.log(`  ⚠️  kyc_verifications.id_proof_urls missing`);
            }
        } else {
            console.log(`  ℹ️  kyc_verifications table doesn't exist (skipped)`);
        }

        console.log("\n✅ Database update verification complete!");
        console.log("\n💡 Next steps:");
        console.log("   1. Restart your backend server");
        console.log("   2. Test the new functionality");
        console.log("   3. Monitor application logs for any issues\n");

        process.exit(0);
    } catch (error) {
        console.error("\n❌ Database update failed:", error.message);
        console.error("\nFull error:", error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

updateServerDatabase();




