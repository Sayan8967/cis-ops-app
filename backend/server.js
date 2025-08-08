// backend/server.js - Enhanced with session-based authentication
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration for Kubernetes
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:30080', 'http://mydevopsproject.live:30080', '*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-User-Email'],
  credentials: false,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Database connection (optional)
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

// Test database connection
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

// In-memory user sessions (for demo - in production use Redis or database)
const userSessions = new Map();

// Mock users database
const mockUsers = [
  {
    id: 1,
    name: 'Admin User',
    email: 'admin@cisops.com',
    role: 'admin',
    status: 'active',
    lastLogin: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Moderator User',
    email: 'mod@cisops.com',
    role: 'moderator',
    status: 'active',
    lastLogin: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 3,
    name: 'Regular User',
    email: 'user@cisops.com',
    role: 'user',
    status: 'active',
    lastLogin: new Date(Date.now() - 172800000).toISOString()
  }
];

// Helper function to determine user role
const determineUserRole = (email) => {
  // Assign roles based on email patterns for demo
  if (email.includes('admin') || email.endsWith('@cisops.com')) {
    return 'admin';
  } else if (email.includes('mod') || email.includes('moderator')) {
    return 'moderator';
  }
  return 'admin'; // Default to admin for demo purposes
};

// Helper function to get user from session
const getUserFromSession = (req) => {
  const userEmail = req.headers['x-user-email'] || req.headers['authorization']?.replace('Bearer ', '');
  if (userEmail && userSessions.has(userEmail)) {
    return userSessions.get(userEmail);
  }
  return null;
};

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  const user = getUserFromSession(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  req.user = user;
  next();
};

// Middleware to check roles
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const roleHierarchy = {
      'user': 1,
      'moderator': 2,
      'admin': 3
    };

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = Math.min(...roles.map(role => roleHierarchy[role] || 0));

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${roles.join(' or ')}. Current: ${req.user.role}`
      });
    }

    next();
  };
};

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

// Handle preflight OPTIONS requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-User-Email');
  res.sendStatus(200);
});

// ======= API ROUTES =======

// Health check endpoint
app.get('/api/health', (req, res) => {
  const user = getUserFromSession(req);
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: '2.0.0',
    activeSessions: userSessions.size,
    user: user ? { name: user.name, email: user.email, role: user.role } : null
  });
});

// Google OAuth login with role assignment
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
    
    // Determine user role
    const userRole = determineUserRole(googleUserData.email);
    
    // Store user session
    const userData = {
      id: Date.now(),
      name: googleUserData.name,
      email: googleUserData.email,
      picture: googleUserData.picture,
      role: userRole,
      status: 'active',
      loginTime: new Date().toISOString()
    };
    
    userSessions.set(googleUserData.email, userData);
    
    console.log('Login successful for user:', userData.email, 'with role:', userData.role);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        picture: userData.picture,
        role: userData.role,
        status: userData.status
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
  const user = getUserFromSession(req);
  
  if (user) {
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role,
        status: user.status
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
  const user = getUserFromSession(req);
  
  if (user) {
    console.log('User logged out:', user.email);
    userSessions.delete(user.email);
  }
  
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = getSimpleMetrics();
    const user = getUserFromSession(req);
    
    res.json({
      success: true,
      current: metrics,
      user: user ? { name: user.name, email: user.email, role: user.role } : null
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

// Users endpoint with role-based access
app.get('/api/users', requireAuth, requireRole(['moderator', 'admin']), (req, res) => {
  try {
    // Add current user to mock users if not already present
    const allUsers = [...mockUsers];
    
    // Add current user if not in mock data
    if (!allUsers.find(u => u.email === req.user.email)) {
      allUsers.unshift({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        status: req.user.status,
        lastLogin: req.user.loginTime
      });
    }

    res.json({
      success: true,
      users: allUsers,
      count: allUsers.length,
      currentUserRole: req.user.role
    });
    
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Create user endpoint (admin only)
app.post('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const { name, email, role, status } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Check if user already exists
    if (mockUsers.find(u => u.email === email)) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const newUser = {
      id: Date.now(),
      name,
      email,
      role: role || 'user',
      status: status || 'active',
      lastLogin: null,
      createdAt: new Date().toISOString()
    };

    mockUsers.push(newUser);

    res.json({
      success: true,
      message: 'User created successfully',
      user: newUser
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// Update user endpoint (admin only)
app.put('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, role, status } = req.body;

    const userIndex = mockUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user
    mockUsers[userIndex] = {
      ...mockUsers[userIndex],
      name: name || mockUsers[userIndex].name,
      email: email || mockUsers[userIndex].email,
      role: role || mockUsers[userIndex].role,
      status: status || mockUsers[userIndex].status,
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'User updated successfully',
      user: mockUsers[userIndex]
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Delete user endpoint (admin only)
app.delete('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Prevent deleting current user
    if (req.user.id === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const userIndex = mockUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const deletedUser = mockUsers.splice(userIndex, 1)[0];

    res.json({
      success: true,
      message: 'User deleted successfully',
      user: deletedUser
    });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// System info endpoint
app.get('/api/system', (req, res) => {
  const user = getUserFromSession(req);
  
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
    user: user ? { name: user.name, email: user.email, role: user.role } : null
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

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path
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
    console.log('🚀 Starting Enhanced CIS-Ops Backend...');
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
      console.log('  GET  /api/users (requires moderator+)');
      console.log('  POST /api/users (requires admin)');
      console.log('  PUT  /api/users/:id (requires admin)');
      console.log('  DELETE /api/users/:id (requires admin)');
      console.log('  GET  /api/system');
      console.log('🔒 CORS enabled for Kubernetes');
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