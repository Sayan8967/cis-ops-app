// backend/server.js - Basic backend server with health check and auth routes
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { googleLogin, verifyJWT, logout, getProfile, authenticateToken, healthCheck: authHealthCheck } = require('./controllers/authController');

const app = express();
const PORT = process.env.PORT || 4000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cisops',
  user: process.env.DB_USER || 'cisops',
  password: process.env.DB_PASSWORD || 'cisops123',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test database connection on startup
const testDatabaseConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');
    
    // Create tables if they don't exist
    await initializeDatabase();
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Initialize database tables
const initializeDatabase = async () => {
  try {
    const client = await pool.connect();
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        picture TEXT,
        role VARCHAR(50) DEFAULT 'user',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);
    
    console.log('✅ Database tables initialized');
    client.release();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
};

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:30080',
    'http://mydevopsproject.live:30080',
    'http://mydevopsproject.live',
    /^http:\/\/.*\.live$/,
    /^http:\/\/localhost:\d+$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Health check endpoint - MUST be first
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      database: 'connected',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      database: 'disconnected'
    });
  }
});

// Authentication routes
app.post('/auth/google', googleLogin);
app.get('/auth/verify', verifyJWT);
app.post('/auth/logout', logout);
app.get('/auth/profile', getProfile);
app.get('/auth/health', authHealthCheck);

// API routes (protected)
app.get('/api/health', authenticateToken, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) as user_count FROM users');
    client.release();
    
    res.json({
      status: 'healthy',
      authenticated: true,
      user: req.user,
      database: 'connected',
      userCount: parseInt(result.rows[0].user_count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database error',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/metrics', authenticateToken, (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    activeConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    platform: process.platform,
    nodeVersion: process.version
  };
  
  res.json({
    success: true,
    current: metrics,
    historical: [] // TODO: Implement historical data storage
  });
});

// Users management routes (admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Check if user has moderator or admin role
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Moderator or admin role required.'
      });
    }

    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, name, email, picture, role, status, created_at, updated_at, last_login 
      FROM users 
      ORDER BY created_at DESC
    `);
    client.release();
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// System information endpoint
app.get('/api/system', authenticateToken, (req, res) => {
  res.json({
    success: true,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      hostname: require('os').hostname(),
      loadavg: require('os').loadavg(),
      totalmem: require('os').totalmem(),
      freemem: require('os').freemem(),
      cpus: require('os').cpus().length
    },
    database: {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingCount: pool.waitingCount
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`404: ${req.method} ${req.originalUrl} not found`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health',
      'POST /auth/google',
      'GET /auth/verify',
      'POST /auth/logout',
      'GET /auth/profile',
      'GET /api/health',
      'GET /api/metrics',
      'GET /api/users',
      'GET /api/system'
    ]
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    console.log('🚀 Starting CIS-Ops Backend Server...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Port:', PORT);
    
    // Test database connection
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.warn('⚠️ Starting server without database connection');
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
      console.log('📊 Health check: GET /health');
      console.log('🔐 Auth endpoints: POST /auth/google, GET /auth/verify');
      console.log('📈 API endpoints: GET /api/health, GET /api/metrics');
      console.log('👥 User management: GET /api/users (admin/moderator)');
      
      // Log database status
      if (dbConnected) {
        console.log('💾 Database: Connected to PostgreSQL');
      } else {
        console.log('💾 Database: Not connected (some features disabled)');
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Initialize server
startServer();