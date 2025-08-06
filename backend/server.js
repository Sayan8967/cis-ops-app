// backend/server.js - Dynamic host IP resolution for Kubernetes Kind
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { promisify } = require('util');
const { exec } = require('child_process');
const os = require('os');
const { googleLogin, verifyJWT, logout, getProfile, authenticateToken, healthCheck: authHealthCheck } = require('./controllers/authController');

const app = express();
const PORT = process.env.PORT || 4000;

// Function to get the host IP address dynamically
const getHostIP = async () => {
  try {
    // Method 1: Try to get from Kubernetes environment
    const execPromise = promisify(exec);
    
    // Try to get from route command (most reliable for Kind)
    try {
      const { stdout } = await execPromise("ip route show default | awk '/default/ {print $3}'");
      const hostIP = stdout.trim();
      if (hostIP && hostIP.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        console.log('Got host IP from route command:', hostIP);
        return hostIP;
      }
    } catch (error) {
      console.log('Failed to get IP from route command:', error.message);
    }

    // Method 2: Try to get from hostname resolution
    try {
      const { stdout } = await execPromise("hostname -I | awk '{print $1}'");
      const hostIP = stdout.trim();
      if (hostIP && hostIP.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        console.log('Got host IP from hostname -I:', hostIP);
        return hostIP;
      }
    } catch (error) {
      console.log('Failed to get IP from hostname -I:', error.message);
    }

    // Method 3: Try to get from network interfaces
    const interfaces = os.networkInterfaces();
    
    // Look for common Kind/Docker bridge interfaces first
    const priorityInterfaces = ['eth0', 'en0', 'enp0s3'];
    
    for (const interfaceName of priorityInterfaces) {
      if (interfaces[interfaceName]) {
        for (const iface of interfaces[interfaceName]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`Got host IP from interface ${interfaceName}:`, iface.address);
            return iface.address;
          }
        }
      }
    }

    // Fallback: get any external IPv4 address
    for (const interfaceName in interfaces) {
      for (const iface of interfaces[interfaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`Got host IP from interface ${interfaceName}:`, iface.address);
          return iface.address;
        }
      }
    }

  } catch (error) {
    console.error('Error getting host IP:', error.message);
  }

  return null;
};

// Function to get all possible allowed origins dynamically
const getAllowedOrigins = async () => {
  const origins = [
    'http://localhost:3000',
    'http://localhost:30080',
    'http://mydevopsproject.live:30080',
    'http://mydevopsproject.live'
  ];

  // Try to get the actual host IP
  const hostIP = await getHostIP();
  
  if (hostIP) {
    origins.push(
      `http://${hostIP}:30080`,
      `http://${hostIP}:3000`,
      `http://${hostIP}`
    );
    console.log('Added dynamic host IP origins:', hostIP);
  }

  // Add common Kind cluster IPs
  const commonKindIPs = ['172.18.0.1', '172.17.0.1', '192.168.1.1', '10.0.2.2'];
  for (const ip of commonKindIPs) {
    origins.push(
      `http://${ip}:30080`,
      `http://${ip}:3000`,
      `http://${ip}`
    );
  }

  // Add regex patterns for dynamic IP matching
  origins.push(
    /^http:\/\/.*\.live$/,
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/, // Any IP:PORT combination
    /^http:\/\/\d+\.\d+\.\d+\.\d+$/      // Any IP without port
  );

  return origins;
};

// Database connection - SSL disabled for internal Kubernetes communication
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cisops',
  user: process.env.DB_USER || 'cisops',
  password: process.env.DB_PASSWORD || 'cisops123',
  ssl: false,
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

// Initialize CORS with dynamic origins
let corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:30080',
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
  optionsSuccessStatus: 200
};

// Update CORS options with dynamic origins
const initializeCors = async () => {
  try {
    const allowedOrigins = await getAllowedOrigins();
    corsOptions.origin = allowedOrigins;
    console.log('✅ CORS origins initialized:', allowedOrigins.length, 'origins');
  } catch (error) {
    console.error('❌ Failed to initialize CORS origins:', error.message);
  }
};

// Middleware
app.use(async (req, res, next) => {
  // Dynamic CORS handling
  const origin = req.headers.origin;
  
  if (origin) {
    const allowedOrigins = corsOptions.origin;
    let isAllowed = false;
    
    for (const allowedOrigin of allowedOrigins) {
      if (typeof allowedOrigin === 'string' && allowedOrigin === origin) {
        isAllowed = true;
        break;
      } else if (allowedOrigin instanceof RegExp && allowedOrigin.test(origin)) {
        isAllowed = true;
        break;
      }
    }
    
    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Cache-Control');
    }
  }
  
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip || req.connection.remoteAddress}`);
  next();
});

// Health check endpoint - MUST be first
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    // Get host information
    const hostIP = await getHostIP();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      database: 'connected',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      hostIP: hostIP,
      hostname: os.hostname(),
      platform: os.platform()
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
    
    const hostIP = await getHostIP();
    
    res.json({
      status: 'healthy',
      authenticated: true,
      user: req.user,
      database: 'connected',
      userCount: parseInt(result.rows[0].user_count),
      timestamp: new Date().toISOString(),
      hostIP: hostIP,
      hostname: os.hostname()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database error',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/metrics', authenticateToken, async (req, res) => {
  const hostIP = await getHostIP();
  
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    activeConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    platform: process.platform,
    nodeVersion: process.version,
    hostIP: hostIP,
    hostname: os.hostname()
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
app.get('/api/system', authenticateToken, async (req, res) => {
  const hostIP = await getHostIP();
  
  res.json({
    success: true,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      hostname: os.hostname(),
      loadavg: os.loadavg(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      hostIP: hostIP
    },
    database: {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingCount: pool.waitingCount
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Network information endpoint (for debugging)
app.get('/api/network', authenticateToken, async (req, res) => {
  const hostIP = await getHostIP();
  const interfaces = os.networkInterfaces();
  
  res.json({
    success: true,
    hostIP: hostIP,
    hostname: os.hostname(),
    networkInterfaces: interfaces,
    corsOrigins: corsOptions.origin.length
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
      'GET /api/system',
      'GET /api/network'
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
    
    // Initialize CORS with dynamic origins
    await initializeCors();
    
    // Get and display host IP
    const hostIP = await getHostIP();
    if (hostIP) {
      console.log('🌐 Detected host IP:', hostIP);
    } else {
      console.log('⚠️ Could not detect host IP, using fallback patterns');
    }
    
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
      console.log('🌐 Network info: GET /api/network');
      
      // Log database status
      if (dbConnected) {
        console.log('💾 Database: Connected to PostgreSQL');
      } else {
        console.log('💾 Database: Not connected (some features disabled)');
      }
      
      // Log networking information
      if (hostIP) {
        console.log(`🔗 Frontend should connect to: http://${hostIP}:${PORT}`);
        console.log(`🔗 NodePort service accessible at: http://${hostIP}:30400`);
      }
      
      console.log(`📡 CORS configured for ${corsOptions.origin.length} origin patterns`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Initialize server
startServer();