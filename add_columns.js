const { query } = require("./src/config/database");

async function addColumns() {
    try {
        console.log("Adding columns to products table...");
        await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_detail_pdf VARCHAR(500);`);
        await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS weight DECIMAL(10,2) DEFAULT 0.00;`);
        console.log("Successfully added columns!");
        process.exit(0);
    } catch (err) {
        console.error("Error adding columns:", err);
        process.exit(1);
    }
}

addColumns();
