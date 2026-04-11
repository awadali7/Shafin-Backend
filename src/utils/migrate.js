require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { runAllColumnMigrations } = require("./runAllColumnMigrations");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        console.log("🔄 Starting database migration...");

        // Read SQL schema file
        const schemaPath = path.join(__dirname, "../../schema.sql");
        if (!fs.existsSync(schemaPath)) {
            console.error("❌ schema.sql file not found!");
            process.exit(1);
        }

        const schema = fs.readFileSync(schemaPath, "utf8");

        // Execute schema
        await pool.query(schema);

        console.log("✅ Database migration completed successfully!");

        await runAllColumnMigrations(pool);

        // Create admin user if specified in env
        if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
            const bcrypt = require("bcryptjs");
            const password_hash = await bcrypt.hash(
                process.env.ADMIN_PASSWORD,
                12
            );

            // Check if admin already exists
            const existingAdmin = await pool.query(
                "SELECT id FROM users WHERE email = $1",
                [process.env.ADMIN_EMAIL]
            );

            if (existingAdmin.rows.length === 0) {
                await pool.query(
                    `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        process.env.ADMIN_EMAIL,
                        password_hash,
                        "Admin",
                        "User",
                        "admin",
                        true,
                    ]
                );
                console.log("✅ Admin user created successfully!");
            } else {
                console.log("ℹ️  Admin user already exists");
            }
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    migrate();
}

module.exports = {
    migrate,
};
