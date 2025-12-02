require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function askQuestion(query) {
    return new Promise((resolve) => rl.question(query, resolve));
}

async function createAdmin() {
    try {
        console.log("🔐 Create Admin User\n");

        // Get user input
        const email = await askQuestion("Email: ");
        if (!email) {
            console.error("❌ Email is required!");
            process.exit(1);
        }

        const password = await askQuestion("Password: ");
        if (!password || password.length < 6) {
            console.error(
                "❌ Password is required and must be at least 6 characters!"
            );
            process.exit(1);
        }

        const first_name =
            (await askQuestion("First Name (optional, default: Admin): ")) ||
            "Admin";
        const last_name =
            (await askQuestion("Last Name (optional, default: User): ")) ||
            "User";

        // Check if user already exists
        const existingUser = await pool.query(
            "SELECT id, role FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            const user = existingUser.rows[0];
            console.log(`\n⚠️  User with email ${email} already exists!`);

            if (user.role === "admin") {
                console.log("✅ User is already an admin.");
                const update = await askQuestion(
                    "\nDo you want to update their password? (y/n): "
                );
                if (update.toLowerCase() === "y") {
                    const password_hash = await bcrypt.hash(password, 12);
                    await pool.query(
                        "UPDATE users SET password_hash = $1 WHERE email = $2",
                        [password_hash, email]
                    );
                    console.log("✅ Password updated successfully!");
                }
            } else {
                const promote = await askQuestion(
                    "\nDo you want to promote this user to admin? (y/n): "
                );
                if (promote.toLowerCase() === "y") {
                    const password_hash = await bcrypt.hash(password, 12);
                    await pool.query(
                        "UPDATE users SET role = 'admin', password_hash = $1 WHERE email = $2",
                        [password_hash, email]
                    );
                    console.log("✅ User promoted to admin successfully!");
                }
            }
        } else {
            // Hash password
            const password_hash = await bcrypt.hash(password, 12);

            // Create admin user
            const result = await pool.query(
                `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, email, first_name, last_name, role`,
                [email, password_hash, first_name, last_name, "admin", true]
            );

            console.log("\n✅ Admin user created successfully!");
            console.log(`   Email: ${result.rows[0].email}`);
            console.log(
                `   Name: ${result.rows[0].first_name} ${result.rows[0].last_name}`
            );
            console.log(`   Role: ${result.rows[0].role}`);
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Error creating admin user:", error.message);
        process.exit(1);
    } finally {
        rl.close();
        await pool.end();
    }
}

createAdmin();
