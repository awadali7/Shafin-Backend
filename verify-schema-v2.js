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
        // 1. Check Tables
        const tablesRes = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('product_kyc_verifications', 'site_settings');
    `);
        const foundTables = tablesRes.rows.map(r => r.table_name);
        console.log(`Found tables: ${foundTables.join(', ')}`);

        if (!foundTables.includes('product_kyc_verifications')) console.error("❌ 'product_kyc_verifications' table MISSING");
        else console.log("✅ 'product_kyc_verifications' table EXISTS");

        if (!foundTables.includes('site_settings')) console.error("❌ 'site_settings' table MISSING");
        else console.log("✅ 'site_settings' table EXISTS");

        // 2. Check Products Columns
        const prodColsRes = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'products';
    `);
        const prodCols = prodColsRes.rows.map(r => r.column_name);
        const reqProdCols = ['categories', 'tiered_pricing', 'requires_kyc', 'is_featured'];
        const missingProdCols = reqProdCols.filter(c => !prodCols.includes(c));

        if (missingProdCols.length > 0) console.error(`❌ Missing columns in 'products': ${missingProdCols.join(', ')}`);
        else console.log("✅ 'products' table has all required columns");

        // 3. Check Courses Columns
        const courseColsRes = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'courses';
    `);
        const courseCols = courseColsRes.rows.map(r => r.column_name);
        if (!courseCols.includes('is_featured')) console.error("❌ 'courses' table missing 'is_featured'");
        else console.log("✅ 'courses' table has 'is_featured'");

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

verifySchema();
