const { Pool } = require('pg');

async function testConnection(user, password) {
    console.log(`Testing connection for user: ${user} with password: '${password}'...`);
    const pool = new Pool({
        user: user,
        password: password,
        host: 'localhost',
        port: 5432,
        database: 'postgres', // Connect to default database first
    });

    try {
        const client = await pool.connect();
        console.log(`✅ SUCCESS: Connected as ${user}!`);
        console.log(`PASSWORD_FOUND: ${password}`); // Signal for the agent

        // Check if elearning_db exists
        const dbRes = await client.query("SELECT 1 FROM pg_database WHERE datname = 'elearning_db'");
        if (dbRes.rows.length > 0) {
            console.log("ℹ️  Database 'elearning_db' already exists.");
        } else {
            console.log("ℹ️  Database 'elearning_db' does NOT exist.");
        }

        client.release();
        await pool.end();
        return true;
    } catch (err) {
        console.log(`❌ Failed for ${user}: ${err.message}`);
        await pool.end();
        return false;
    }
}

async function main() {
    // Try '2' (user input)
    if (await testConnection('postgres', '2')) return;
    if (await testConnection('awadali', '2')) return;

    // Try common defaults just in case
    if (await testConnection('postgres', 'postgres')) return;
    if (await testConnection('postgres', 'password')) return;
    if (await testConnection('postgres', 'admin')) return;
    if (await testConnection('postgres', '123456')) return;
}

main();
