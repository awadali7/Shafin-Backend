const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    password: '123456',
    host: 'localhost',
    port: 5432,
    database: 'elearning_db',
});

async function verifySchema() {
    try {
        console.log("--- Verifying Tables ---");
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

        const tables = res.rows.map(r => r.table_name);
        console.log("Tables found:", tables.join(", "));

        const missingTables = ['product_kyc_verifications', 'site_settings'].filter(t => !tables.includes(t));
        if (missingTables.length > 0) {
            console.error("❌ Misisng tables:", missingTables);
        } else {
            console.log("✅ All new tables present.");
        }

        console.log("\n--- Verifying Columns ---");

        // Check products columns
        const prodCols = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'products';
    `);
        const pCols = prodCols.rows.map(r => r.column_name);
        const expectedPCols = ['is_featured', 'categories', 'requires_kyc'];
        const missingPCols = expectedPCols.filter(c => !pCols.includes(c));
        if (missingPCols.length > 0) console.error("❌ Missing columns in 'products':", missingPCols);
        else console.log("✅ 'products' columns ok.");

        // Check courses columns
        const courseCols = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'courses';
    `);
        const cCols = courseCols.rows.map(r => r.column_name);
        if (!cCols.includes('is_featured')) console.error("❌ Missing 'is_featured' in 'courses'");
        else console.log("✅ 'courses' columns ok.");

        // Check kyc_verifications columns
        const kycCols = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'kyc_verifications';
    `);
        const kCols = kycCols.rows.map(r => r.column_name);
        const expectedKCols = ['id_proof_urls', 'business_id'];
        const missingKCols = expectedKCols.filter(c => !kCols.includes(c));
        if (missingKCols.length > 0) console.error("❌ Missing columns in 'kyc_verifications':", missingKCols);
        else console.log("✅ 'kyc_verifications' columns ok.");


    } catch (err) {
        console.error('Error verifying schema:', err);
    } finally {
        await pool.end();
    }
}

verifySchema();
