// Temporary script to accept terms for all verified KYC users
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://awadali@localhost:5432/elearning_db',
    ssl: false,
});

async function acceptTermsForAll() {
    try {
        console.log('🔧 Accepting terms for all verified KYC users...\n');
        
        const result = await pool.query(`
            UPDATE users 
            SET terms_accepted_at = CURRENT_TIMESTAMP 
            WHERE id IN (
                SELECT user_id 
                FROM kyc_verifications 
                WHERE status = 'verified'
            )
            RETURNING id, email, first_name, last_name, terms_accepted_at
        `);
        
        console.log(`✅ Updated ${result.rows.length} user(s):\n`);
        result.rows.forEach(user => {
            console.log(`   ✓ ${user.first_name} ${user.last_name} (${user.email})`);
            console.log(`     Terms accepted at: ${user.terms_accepted_at}\n`);
        });
        
        await pool.end();
        console.log('✅ Done! You can now purchase courses.\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        await pool.end();
        process.exit(1);
    }
}

acceptTermsForAll();

