const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: 'postgres',
    password: '123456',
    host: 'localhost',
    port: 5432,
    database: 'elearning_db',
});

async function runMigration() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'schema_update_2.sql'), 'utf8');
        console.log("Applying schema update 2...");

        await pool.query(sql);

        console.log("✅ Schema update 2 applied successfully!");
    } catch (err) {
        console.error('❌ Error updating schema:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
