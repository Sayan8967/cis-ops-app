// Database Initialization
// backend/db/init.js

const pool = require('./config');

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Initializing database...');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        status VARCHAR(50) DEFAULT 'active',
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create metrics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id SERIAL PRIMARY KEY,
        cpu_usage INTEGER DEFAULT 0,
        memory_usage INTEGER DEFAULT 0,
        disk_usage INTEGER DEFAULT 0,
        network_usage INTEGER DEFAULT 0,
        uptime INTEGER DEFAULT 0,
        platform VARCHAR(50),
        hostname VARCHAR(255),
        total_memory_gb DECIMAL(10,2),
        free_memory_gb DECIMAL(10,2),
        cpu_count INTEGER,
        process_uptime INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create system_info table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_info (
        id SERIAL PRIMARY KEY,
        service_name VARCHAR(255),
        status VARCHAR(50),
        version VARCHAR(50),
        uptime INTEGER,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample users if table is empty
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('📝 Inserting sample users...');
      
      await client.query(`
        INSERT INTO users (name, email, role, status, last_login, created_at) VALUES
        ('John Doe', 'john@example.com', 'admin', 'active', NOW(), NOW() - INTERVAL '30 days'),
        ('Jane Smith', 'jane@example.com', 'user', 'active', NOW() - INTERVAL '1 day', NOW() - INTERVAL '15 days'),
        ('Bob Wilson', 'bob@example.com', 'user', 'inactive', NOW() - INTERVAL '2 days', NOW() - INTERVAL '7 days'),
        ('Alice Johnson', 'alice@example.com', 'moderator', 'active', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '20 days'),
        ('Charlie Brown', 'charlie@example.com', 'user', 'active', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '10 days')
      `);
    }

    // Insert sample system info
    const systemCount = await client.query('SELECT COUNT(*) FROM system_info');
    if (parseInt(systemCount.rows[0].count) === 0) {
      console.log('📊 Inserting sample system info...');
      
      await client.query(`
        INSERT INTO system_info (service_name, status, version, uptime) VALUES
        ('API Server', 'operational', '1.0.0', 86400),
        ('Database', 'operational', '15.0', 172800),
        ('WebSocket', 'operational', '4.5.0', 86400),
        ('Authentication', 'operational', '2.1.0', 259200)
      `);
    }

    console.log('✅ Database initialized successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to insert periodic metrics
async function insertMetrics(metricsData) {
  const client = await pool.connect();
  
  try {
    await client.query(`
      INSERT INTO metrics (
        cpu_usage, memory_usage, disk_usage, network_usage, 
        uptime, platform, hostname, total_memory_gb, 
        free_memory_gb, cpu_count, process_uptime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      metricsData.cpu || 0,
      metricsData.memory || 0,
      metricsData.disk || 0,
      metricsData.network || 0,
      metricsData.uptime || 0,
      metricsData.platform || 'unknown',
      metricsData.hostname || 'unknown',
      metricsData.totalMemory || 0,
      metricsData.freeMemory || 0,
      metricsData.cpuCount || 0,
      metricsData.processUptime || 0
    ]);
  } catch (error) {
    console.error('Error inserting metrics:', error);
  } finally {
    client.release();
  }
}

module.exports = {
  initializeDatabase,
  insertMetrics
};
