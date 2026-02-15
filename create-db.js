const { Client } = require('pg');

async function createDatabase() {
    const client = new Client({
        user: 'postgres',
        password: process.env.DB_PASSWORD || '123456', // Hardcoded fallback for script
        host: 'localhost',
        port: 5432,
        database: 'postgres', // Connect to default DB
    });

    try {
        await client.connect();

        // Check if database exists
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'elearning_db'");
        if (res.rows.length === 0) {
            console.log("Creating database 'elearning_db'...");
            await client.query('CREATE DATABASE elearning_db'); // CREATE DATABASE cannot be in transaction block
            console.log("✅ Database created successfully!");
        } else {
            console.log("ℹ️  Database already exists.");
        }

    } catch (err) {
        console.error('❌ Error creating database:', err.message);
    } finally {
        await client.end();
    }
}

createDatabase();
