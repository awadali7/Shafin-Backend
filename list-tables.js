const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    password: '123456',
    host: 'localhost',
    port: 5432,
    database: 'elearning_db',
});

async function listTables() {
    try {
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

        console.log("Current Tables in 'public' schema:");
        if (res.rows.length === 0) {
            console.log("No tables found.");
        } else {
            res.rows.forEach(row => console.log(`- ${row.table_name}`));
        }

        // Also count them
        console.log(`Total: ${res.rows.length} tables.`);

    } catch (err) {
        console.error('Error querying tables:', err);
    } finally {
        await pool.end();
    }
}

listTables();
