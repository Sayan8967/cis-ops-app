// backend/server.js - Simplified version serving React static files (No JWT)
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 4000;

// Database connection (simplified - optional)
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cisops',
  user: process.env.DB_USER || 'cisops',
  password: process.env.DB_PASSWORD || 'cisops123',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test database connection (optional)
const testDatabaseConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.warn('⚠️ Database connection failed, continuing without DB:', error.message);
    return false;
  }
};

// Mock user storage (since no database required)
let currentUser = null;

// Mock metrics data
const getSimpleMetrics = () => {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      cpu: Math.floor(Math.random() * 50) + 10,
      memory: Math.round((usedMem / totalMem) * 100),
      disk: Math.floor(Math.random() * 30) + 20,
      network: Math.floor(Math.random() * 100) + 50,
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      totalMemoryGB: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
      freeMemoryGB: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
      cpuCount: cpus.length,
      processUptime: Math.round(process.uptime())
    };
  } catch (error) {
    console.error('Error getting metrics:', error);
    return {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: 0,
      uptime: 0,
      platform: 'unknown',
      hostname: 'unknown',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
};

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Serve React static files from the build directory
// Use environment variable for build path if set, else default to Docker production path
const buildPath = process.env.REACT_BUILD_PATH || path.join(__dirname, 'frontend/build');
const indexHtmlPath = path.join(buildPath, 'index.html');
const fs = require('fs');

if (fs.existsSync(indexHtmlPath)) {
  console.log('✅ Serving React static files from:', buildPath);
  app.use(express.static(buildPath));
} else {
  console.warn('⚠️ React build output not found at:', indexHtmlPath);
}

// ======= API ROUTES =======

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
    user: currentUser ? { name: currentUser.name, email: currentUser.email } : null
  });
});

// Google OAuth login - Simplified
app.post('/api/auth/google', async (req, res) => {
  try {
    const { token, userInfo } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Google access token is required'
      });
    }
    
    console.log('Processing Google login...');
    
    let googleUserData;
    
    // Try to use provided userInfo first, then fetch from Google
    if (userInfo && userInfo.email) {
      googleUserData = userInfo;
      console.log('Using provided user info:', userInfo.email);
    } else {
      try {
        console.log('Fetching user info from Google API...');
        const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 10000
        });
        
        googleUserData = response.data;
        console.log('Fetched user info from Google:', googleUserData.email);
        
      } catch (googleError) {
        console.error('Failed to fetch user info from Google:', googleError.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid Google token or failed to fetch user information'
        });
      }
    }
    
    // Validate required Google user data
    if (!googleUserData.email || !googleUserData.name) {
      return res.status(400).json({
        success: false,
        message: 'Incomplete user information from Google'
      });
    }
    
    // Store user data (simplified - just in memory)
    currentUser = {
      id: Date.now(), // Simple ID
      name: googleUserData.name,
      email: googleUserData.email,
      picture: googleUserData.picture,
      role: 'user',
      status: 'active',
      loginTime: new Date().toISOString()
    };
    
    console.log('Login successful for user:', currentUser.email);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        picture: currentUser.picture,
        role: currentUser.role,
        status: currentUser.status
      }
    });
    
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
});

// Check current user
app.get('/api/auth/user', (req, res) => {
  if (currentUser) {
    res.json({
      success: true,
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        picture: currentUser.picture,
        role: currentUser.role,
        status: currentUser.status
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  if (currentUser) {
    console.log('User logged out:', currentUser.email);
  }
  currentUser = null;
  
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = getSimpleMetrics();
    res.json({
      success: true,
      current: metrics,
      user: currentUser ? { name: currentUser.name, email: currentUser.email } : null
    });
  } catch (error) {
    console.error('Error in /api/metrics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch metrics', 
      message: error.message 
    });
  }
});

// Users endpoint (simplified)
app.get('/api/users', (req, res) => {
  const users = currentUser ? [currentUser] : [];
  res.json({
    success: true,
    users: users,
    count: users.length
  });
});

// System info endpoint
app.get('/api/system', (req, res) => {
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
      cpus: os.cpus().length
    },
    environment: process.env.NODE_ENV || 'development',
    user: currentUser ? { name: currentUser.name, email: currentUser.email } : null
  });
});

// Catch-all handler - serve React app for any unmatched routes
app.get('*', (req, res) => {
  // Don't serve React app for API routes
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ 
      success: false,
      error: 'API route not found', 
      path: req.originalUrl 
    });
    return;
  }
  // Serve React app for all other routes (client-side routing)
  if (fs.existsSync(indexHtmlPath)) {
    res.sendFile(indexHtmlPath);
  } else {
    res.status(500).send('React build output not found. Please run "npm run build" in frontend and rebuild the backend image.');
  }
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (pool) await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  if (pool) await pool.end();
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Simplified CIS-Ops Backend...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Port:', PORT);
    
    // Test database connection (optional)
    await testDatabaseConnection();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('=====================================');
      console.log('🚀 CIS Operations Server Started');
      console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
      console.log('📊 Health check: GET /api/health');
      console.log('🔐 Auth endpoints:');
      console.log('  POST /api/auth/google');
      console.log('  GET  /api/auth/user');
      console.log('  POST /api/auth/logout');
      console.log('📈 API endpoints:');
      console.log('  GET  /api/metrics');
      console.log('  GET  /api/users');
      console.log('  GET  /api/system');
      console.log('🌐 React App: All other routes serve React static files');
      console.log(`🏠 Hostname: ${os.hostname()}`);
      console.log(`🌍 Platform: ${os.platform()}`);
      console.log('=====================================');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Initialize server
startServer();