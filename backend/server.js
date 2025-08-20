// backend/server.js - Enhanced with database integration
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');
const os = require('os');
const getMetrics = require('./metrics');
const pool = require('./db/config');
const authController = require('./controllers/authController');
// Monitoring and logging
const promClient = require('prom-client');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Prometheus default metrics collection
promClient.collectDefaultMetrics({ prefix: 'cis_ops_' });

const app = express();
const PORT = process.env.PORT || 4000;

// Create some custom metrics
const httpRequestDurationMilliseconds = new promClient.Histogram({
  name: 'cis_ops_http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 200, 300, 500, 1000, 2000]
});

// Middleware to measure request durations (placed after app is created)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    try {
      httpRequestDurationMilliseconds.labels(req.method, req.route ? req.route.path : req.path, res.statusCode).observe(duration);
    } catch (e) {
      // ignore metrics labeling errors
    }
    logger.info({ method: req.method, path: req.path, status: res.statusCode, duration }, 'request_finished');
  });
  next();
});

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

// Database connection now uses centralized config in `db/config.js`

// Initialize database and create tables
const initializeDatabase = async () => {
  try {
    const client = await pool.connect();
    
    // Create users table if it doesn't exist (base schema)
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

    // Apply schema migrations idempotently
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

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

// Ensure users table exists before user operations
const ensureUsersTable = async (client) => {
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
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
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

// Authentication routes (used by frontend authService)
app.post('/api/auth/google', authController.googleLogin);
app.post('/api/auth/logout', authController.logout);
app.get('/api/auth/profile', authController.getProfile);

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
// Keep the JSON metrics API for the app
app.get('/api/metrics', requireAuth, (req, res) => {
  try {
    const metrics = getMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching metrics');
    res.status(500).json({ success: false, message: 'Failed to fetch metrics' });
  }
});

// Prometheus scrape endpoint (no auth to allow Prometheus to scrape)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    const metrics = await promClient.register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error({ err: error }, 'Error serving /metrics');
    res.status(500).end();
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
  const handle = async () => {
    const client = await pool.connect();
    try {
      // Make sure schema exists
      await ensureUsersTable(client);

      // First, ensure current user exists in database
      await client.query(
        `INSERT INTO users (name, email, role, status, last_login)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        [req.user.name || 'Unknown', req.user.email, req.user.role || 'admin', 'active', new Date()]
      );

      // Get all users
      const result = await client.query(
        `SELECT id, name, email, role, status, last_login as "lastLogin", created_at as "createdAt" FROM users ORDER BY created_at DESC`
      );

      res.json({ success: true, users: result.rows });
    } finally {
      client.release();
    }
  };

  try {
    await handle();
  } catch (error) {
    // If table is missing, (re)initialize DB and retry once
    if (error.code === '42P01' /* undefined_table */) {
      console.warn('Users table missing, initializing and retrying...');
      try {
        await initializeDatabase();
        await handle();
        return;
      } catch (err2) {
        console.error('Retry after init failed:', err2);
      }
    }
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Update user endpoint (admin only)
app.put('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name, email, role, status } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required' });
  }

  const handle = async () => {
    const client = await pool.connect();
    try {
      await ensureUsersTable(client);
      const userResult = await client.query('SELECT 1 FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const result = await client.query(
        `UPDATE users SET name = $1, email = $2, role = $3, status = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING id, name, email, role, status, last_login as "lastLogin", created_at as "createdAt"`,
        [name, email, role, status, id]
      );
      res.json({ success: true, message: 'User updated successfully', user: result.rows[0] });
    } finally {
      client.release();
    }
  };

  try {
    await handle();
  } catch (error) {
    if (error.code === '42P01') {
      console.warn('Users table missing, initializing and retrying update...');
      try {
        await initializeDatabase();
        await handle();
        return;
      } catch (err2) {
        console.error('Retry update after init failed:', err2);
      }
    }
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

// Delete user endpoint (admin only)
app.delete('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  const handle = async () => {
    const client = await pool.connect();
    try {
      await ensureUsersTable(client);
      const userResult = await client.query('SELECT 1 FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      await client.query('DELETE FROM users WHERE id = $1', [id]);
      res.json({ success: true, message: 'User deleted successfully' });
    } finally {
      client.release();
    }
  };

  try {
    await handle();
  } catch (error) {
    if (error.code === '42P01') {
      console.warn('Users table missing, initializing and retrying delete...');
      try {
        await initializeDatabase();
        await handle();
        return;
      } catch (err2) {
        console.error('Retry delete after init failed:', err2);
      }
    }
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// Create user endpoint (admin only)
app.post('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
  const { name, email, role, status } = req.body;

  // Validate required fields
  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required' });
  }

  const handle = async () => {
    const client = await pool.connect();
    try {
      // Make sure schema exists
      await ensureUsersTable(client);

      let result;
      try {
        result = await client.query(
          `INSERT INTO users (name, email, role, status, last_login)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (email) DO NOTHING
           RETURNING id, name, email, role, status, last_login as "lastLogin", created_at as "createdAt"`,
          [name, email, role || 'user', status || 'active', null]
        );
      } catch (e) {
        if (e.code === '23505') {
          return res.status(400).json({ success: false, message: 'User with this email already exists' });
        }
        throw e;
      }
      if (result.rows.length === 0) {
        // Conflict occurred (duplicate email)
        return res.status(400).json({ success: false, message: 'User with this email already exists' });
      }
      res.json({ success: true, message: 'User created successfully', user: result.rows[0] });
    } finally {
      client.release();
    }
  };

  try {
    await handle();
  } catch (error) {
    if (error.code === '42P01') {
      console.warn('Users table missing, initializing and retrying create...');
      try {
        await initializeDatabase();
        await handle();
        return;
      } catch (err2) {
        console.error('Retry create after init failed:', err2);
      }
    }
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Failed to create user' });
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
