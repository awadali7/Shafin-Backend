const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    password: '123456',
    host: 'localhost',
    port: 5432,
    database: 'elearning_db',
});

async function verifySpecific() {
    try {
        const res = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'is_featured';
    `);

        if (res.rows.length === 0) {
            console.error("❌ 'products' table STILL MISSING 'is_featured'");
        } else {
            console.log("✅ 'products' table HAS 'is_featured' column");
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

verifySpecific();
