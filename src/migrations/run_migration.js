const { query } = require('../config/database');

async function migrate() {
  try {
    // Add columns
    await query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS origin_city VARCHAR(255),
      ADD COLUMN IF NOT EXISTS origin_state VARCHAR(255),
      ADD COLUMN IF NOT EXISTS origin_pincode VARCHAR(20)
    `);
    
    console.log('Migration successful: Added origin fields to products table.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

migrate();
