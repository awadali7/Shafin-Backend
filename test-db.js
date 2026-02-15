const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkDb() {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to database successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Database time:', res.rows[0].now);

        // Check if tables exist
        const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `);

        console.log('Tables found:', tables.rows.map(r => r.table_name).join(', ') || 'None');

        client.release();
        process.exit(0);
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

checkDb();
