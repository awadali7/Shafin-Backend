const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    password: '123456',
    host: 'localhost',
    port: 5432,
    database: 'elearning_db',
});

async function verifyFinal() {
    try {
        // 1. Check kyc_verifications columns
        const kycColsRes = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'kyc_verifications';
    `);
        const kycCols = kycColsRes.rows.map(r => r.column_name);
        const reqKycCols = ['id_proof_urls', 'business_id', 'business_location_link', 'upgraded_to_business'];
        const missingKycCols = reqKycCols.filter(c => !kycCols.includes(c));

        if (missingKycCols.length > 0) console.error(`❌ Missing columns in 'kyc_verifications': ${missingKycCols.join(', ')}`);
        else console.log("✅ 'kyc_verifications' has all required columns");

        // 2. Check site_settings data
        const settingsRes = await pool.query(`SELECT * FROM site_settings`);
        if (settingsRes.rows.length === 0) console.error("❌ 'site_settings' table is EMPTY");
        else {
            console.log(`✅ 'site_settings' has ${settingsRes.rows.length} rows.`);
            settingsRes.rows.forEach(r => console.log(` - ${r.setting_key}: ${r.setting_value}`));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

verifyFinal();
