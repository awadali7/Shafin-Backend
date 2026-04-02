const { query } = require("./src/config/database");

async function addShippingCols() {
    try {
        console.log("Adding shipping columns to products table...");
        const columns = [
            "length DECIMAL(10,2) DEFAULT 0.00",
            "width DECIMAL(10,2) DEFAULT 0.00",
            "height DECIMAL(10,2) DEFAULT 0.00",
            "volumetric_weight DECIMAL(10,2) DEFAULT 0.00",
            "extra_shipping_charge DECIMAL(10,2) DEFAULT 0.00"
        ];

        for (const col of columns) {
            const colName = col.split(' ')[0];
            await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${colName} DECIMAL(10,2) DEFAULT 0.00;`);
        }

        console.log("Successfully added shipping columns!");
        process.exit(0);
    } catch (err) {
        console.error("Error adding columns:", err);
        process.exit(1);
    }
}

addShippingCols();
