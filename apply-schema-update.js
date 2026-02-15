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
        // Get filename from command line argument
        const filename = process.argv[2] || 'schema_update.sql';
        const sqlPath = path.join(__dirname, filename);

        if (!fs.existsSync(sqlPath)) {
            console.error(`❌ Error: File ${filename} not found`);
            process.exit(1);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`Applying schema updates from ${filename}...`);

        await pool.query(sql);

        console.log("✅ Schema updates applied successfully!");
    } catch (err) {
        console.error('❌ Error updating schema:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
