const fs = require('fs');
const path = require('path');
const { query } = require('./src/config/database');

async function runMigration() {
    try {
        console.log('========================================');
        console.log('Multilingual Descriptions Migration');
        console.log('========================================\n');
        
        const migrationPath = path.join(__dirname, 'migrations', 'add_multilingual_descriptions.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Running migration...\n');
        
        await query(sql);
        
        console.log('✅ Migration completed successfully!\n');
        console.log('The products table now has three language-specific description fields:');
        console.log('  - english_description');
        console.log('  - malayalam_description');
        console.log('  - hindi_description\n');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();

