const { query } = require("../config/database");

async function migrate() {
    try {
        await query(`
            ALTER TABLE products
            ADD COLUMN IF NOT EXISTS origin_city VARCHAR(255),
            ADD COLUMN IF NOT EXISTS origin_state VARCHAR(255),
            ADD COLUMN IF NOT EXISTS origin_pincode VARCHAR(20)
        `);

        console.log("Migration successful: added origin fields to products.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
