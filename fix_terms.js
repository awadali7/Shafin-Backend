const { query } = require('./src/config/database');

async function fixTermsAcceptance() {
    try {
        console.log('🔧 Fixing terms acceptance for verified KYC users...');
        
        // Update all users with verified KYC to have terms accepted
        const result = await query(
            `UPDATE users 
             SET terms_accepted_at = CURRENT_TIMESTAMP 
             WHERE id IN (
                 SELECT user_id FROM kyc_verifications WHERE status = 'verified'
             )
             AND terms_accepted_at IS NULL
             RETURNING id, email, first_name, last_name, terms_accepted_at`
        );
        
        console.log(`✅ Updated ${result.rows.length} user(s):`);
        result.rows.forEach(user => {
            console.log(`   - ${user.first_name} ${user.last_name} (${user.email})`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixTermsAcceptance();

