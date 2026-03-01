const { query } = require('../src/config/database');

async function run() {
    const sql = `
    CREATE TABLE IF NOT EXISTS gallery (
      id SERIAL PRIMARY KEY,
      image_url VARCHAR(255) NOT NULL,
      heading VARCHAR(255),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
    try {
        await query(sql);
        console.log('Gallery table created successfully.');
    } catch (error) {
        console.error('Error creating gallery table:', error);
    } finally {
        process.exit(0);
    }
}

run();
