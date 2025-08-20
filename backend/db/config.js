const { Pool } = require('pg');

// Support a single DSN env var (PG_DSN or DATA_SOURCE_NAME) or fall back to individual DB_* vars
const dbUser = process.env.DB_USER || 'cisops';
const dbHost = process.env.DB_HOST || 'postgres-service';
const dbName = process.env.DB_NAME || 'cisops';
const dbPassword = process.env.DB_PASSWORD || 'cisops123';
const dbPort = process.env.DB_PORT || 5432;

const connectionString = process.env.PG_DSN || process.env.DATA_SOURCE_NAME ||
  `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?sslmode=disable`;

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Export the connectionString for consumers that may want to reuse it
process.env.PG_DSN = process.env.PG_DSN || connectionString;

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

module.exports = pool;