const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'cisops',
  host: process.env.DB_HOST || 'postgres-service',
  database: process.env.DB_NAME || 'cisops',
  password: process.env.DB_PASSWORD || 'cisops123',
  port: process.env.DB_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

module.exports = pool;