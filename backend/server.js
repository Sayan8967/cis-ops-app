// backend/server.js - Enhanced with database integration
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');
const os = require('os');
const { getMetrics } = require('./metrics');

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
app.use(express.json());

// Database connection
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

// Initialize database and create tables
const initializeDatabase = async () => {
  try {
    const client = await pool.connect();
    
    // Create users table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check if admin user exists, if not create default admin
    const adminResult = await client.query('SELECT * FROM users WHERE email = $1', ['sayan.ban1998@gmail.com']);
    if (adminResult.rows.length === 0) {
      await client.query(`
        INSERT INTO users (name, email, role, status, last_login)
        VALUES ($1, $2, $3, $4, $5)
      `, ['Admin User', 'sayan.ban1998@gmail.com', 'admin', 'active', new Date()]);
    }

    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection and initialization successful');
    return true;
  } catch (error) {
    console.warn('⚠️ Database connection failed, continuing without DB:', error.message);
    return false;
  }
};

// Helper function to determine user role
const determineUserRole = (email) => {
  if (email.includes('admin') || email.endsWith('@cisops.com')) {
    return 'admin';
  } else if (email.includes('mod') || email.includes('moderator')) {
    return 'moderator';
  }
  return 'admin'; // Default to admin for demo purposes
};

// Auth middleware
const requireAuth = (req, res, next) => {
  const userEmail = req.headers['x-user-email'];
  if (!userEmail) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  req.user = {
    email: userEmail,
    role: determineUserRole(userEmail)
  };
  
  next();
};

// Role-based access control middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

// Get current user info
app.get('/api/auth/user', (req, res) => {
  const userEmail = req.headers['x-user-email'];
  if (!userEmail) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const role = determineUserRole(userEmail);
  res.json({
    success: true,
    user: {
      email: userEmail,
      role: role
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    hostname: os.hostname()
  });
});

// Metrics endpoint
app.get('/api/metrics', requireAuth, (req, res) => {
  try {
    const metrics = getMetrics();
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch metrics'
    });
  }
});

// System info endpoint
app.get('/api/system', requireAuth, (req, res) => {
  try {
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      nodeVersion: process.version,
      containerized: process.env.KUBERNETES_SERVICE_HOST ? true : false
    };

    res.json({
      success: true,
      system: systemInfo
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system info'
    });
  }
});

// Users endpoint with role-based access
app.get('/api/users', requireAuth, requireRole(['moderator', 'admin']), async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      // First, ensure current user exists in database
      const currentUserResult = await client.query('SELECT * FROM users WHERE email = $1', [req.user.email]);
      if (currentUserResult.rows.length === 0) {
        await client.query(`
          INSERT INTO users (name, email, role, status, last_login)
          VALUES ($1, $2, $3, $4, $5)
        `, [req.user.name || 'Unknown', req.user.email, req.user.role || 'admin', 'active', new Date()]);
      }

      // Get all users
      const result = await client.query(`
        SELECT 
          id,
          name,
          email,
          role,
          status,
          last_login as "lastLogin",
          created_at as "createdAt"
        FROM users
        ORDER BY created_at DESC
      `);

      res.json({
        success: true,
        users: result.rows
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Update user endpoint (admin only)
app.put('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    const client = await pool.connect();
    try {
      // Check if user exists
      const userResult = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update user
      const result = await client.query(`
        UPDATE users 
        SET name = $1, email = $2, role = $3, status = $4
        WHERE id = $5
        RETURNING id, name, email, role, status, last_login as "lastLogin", created_at as "createdAt"
      `, [name, email, role, status, id]);

      res.json({
        success: true,
        message: 'User updated successfully',
        user: result.rows[0]
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Delete user endpoint (admin only)
app.delete('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    try {
      // Check if user exists
      const userResult = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Delete user
      await client.query('DELETE FROM users WHERE id = $1', [id]);

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Create user endpoint (admin only)
app.post('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { name, email, role, status } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    const client = await pool.connect();
    try {
      // Check if user already exists in database
      const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Insert new user into database
      const result = await client.query(`
        INSERT INTO users (name, email, role, status, last_login)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, email, role, status, last_login as "lastLogin", created_at as "createdAt"
      `, [name, email, role || 'user', status || 'active', null]);

      const newUser = result.rows[0];

      res.json({
        success: true,
        message: 'User created successfully',
        user: newUser
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// Start server
const startServer = async () => {
  try {
    // Initialize database and tables
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
