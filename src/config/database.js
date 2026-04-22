const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
        process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
    max: parseInt(process.env.DB_POOL_MAX || "10"),
    min: parseInt(process.env.DB_POOL_MIN || "2"),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on("connect", () => {
    console.log("✅ Database connected successfully");
});

pool.on("error", (err) => {
    console.error("❌ Unexpected error on idle client", err);
    process.exit(-1);
});

// Helper function to execute queries
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        if (process.env.NODE_ENV !== "production") {
            console.log("Executed query", {
                text,
                duration,
                rows: res.rowCount,
            });
        }
        return res;
    } catch (error) {
        console.error("Database query error:", error);
        throw error;
    }
};

let schemaReadyPromise = null;

const ensureRequiredSchema = async () => {
    if (!schemaReadyPromise) {
        schemaReadyPromise = (async () => {
            await pool.query(`
                ALTER TABLE products
                ADD COLUMN IF NOT EXISTS show_price_before_kyc BOOLEAN DEFAULT false
            `);
            await pool.query(`
                ALTER TABLE products
                ADD COLUMN IF NOT EXISTS requires_kyc_multiple BOOLEAN DEFAULT false
            `);
        })().catch((error) => {
            schemaReadyPromise = null;
            throw error;
        });
    }

    return schemaReadyPromise;
};

// Helper function to get a client for transactions
const getClient = async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);

    // Set a timeout of 5 seconds
    const timeout = setTimeout(() => {
        console.error("A client has been checked out for more than 5 seconds!");
    }, 5000);

    client.release = () => {
        clearTimeout(timeout);
        return release();
    };

    return client;
};

module.exports = {
    pool,
    query,
    getClient,
    ensureRequiredSchema,
};
