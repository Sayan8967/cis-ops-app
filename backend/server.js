// Updated Backend Server with JWT Authentication
// backend/server.js
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const os = require('os');
const pool = require('./db/config');
const { initializeDatabase, insertMetrics } = require('./db/init');
const { verifyToken, requireRole, refreshTokenIfNeeded } = require('./middleware/auth');
const { googleLogin, verifyJWT, logout, getProfile } = require('./controllers/authController');

const app = express();

// CORS setup
app.use(cors({
  origin: "*",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Initialize database on startup
initializeDatabase().catch(console.error);

// Enhanced metrics function with database logging (SERVER-SIDE ONLY)
function getSystemMetrics() {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    const metrics = {
      cpu: Math.floor(Math.random() * 50) + 20, // Mock CPU usage
      memory: Math.round((usedMem / totalMem) * 100),
      disk: Math.floor(Math.random() * 30) + 30, // Mock disk usage
      network: Math.floor(Math.random() * 100) + 100, // Mock network usage
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      totalMemory: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
      freeMemory: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
      cpuCount: cpus.length,
      processUptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      loadAverage: os.loadavg()
    };
    
    // Periodically log metrics to database (every 30 seconds)
    if (!getSystemMetrics.lastLog || Date.now() - getSystemMetrics.lastLog > 30000) {
      insertMetrics(metrics).catch(console.error);
      getSystemMetrics.lastLog = Date.now();
    }
    
    return metrics;
  } catch (error) {
    console.error('Error getting metrics:', error);
    return {
      cpu: 0, memory: 0, disk: 0, network: 0,
      uptime: 0, platform: 'unknown', hostname: 'unknown',
      timestamp: new Date().toISOString(), error: error.message
    };
  }
}

// ======================================
// PUBLIC ROUTES (No Authentication Required)
// ======================================

// Basic health check (public)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0',
    database: 'connected'
  });
});

// ======================================
// AUTHENTICATION ROUTES
// ======================================

// Google OAuth login
app.post('/auth/google', googleLogin);

// Verify JWT token
app.get('/auth/verify', verifyToken, verifyJWT);

// Logout
app.post('/auth/logout', verifyToken, logout);

// Get user profile
app.get('/auth/profile', verifyToken, getProfile);

// ======================================
// PROTECTED API ROUTES
// ======================================

// Apply JWT verification and token refresh to all /api routes
app.use('/api', verifyToken, refreshTokenIfNeeded);

// Enhanced health check with user context
app.get('/api/health', async (req, res) => {
  let dbStatus = 'connected';
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    dbStatus = 'error';
  }
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    user: req.user.email,
    services: {
      api: 'operational',
      websocket: 'active',
      database: dbStatus,
      authentication: 'active'
    }
  });
});

// Metrics endpoint (PROTECTED)
app.get('/api/metrics', async (req, res) => {
  try {
    const currentMetrics = getSystemMetrics();
    
    // Get latest stored metrics from database
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM metrics ORDER BY created_at DESC LIMIT 10');
    client.release();
    
    res.json({
      current: currentMetrics,
      history: result.rows,
      timestamp: new Date().toISOString(),
      requestedBy: req.user.email
    });
  } catch (error) {
    console.error('Error in /api/metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics', 
      message: error.message 
    });
  }
});

// User management endpoints (PROTECTED)
app.get('/api/users', requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT id, name, email, role, status, last_login, created_at FROM users ORDER BY created_at DESC');
    client.release();
    
    console.log(`GET /api/users - returning ${result.rows.length} users to ${req.user.email}`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error in GET /api/users:', error);
    res.status(500).json({ error: 'Failed to fetch users', message: error.message });
  }
});

app.post('/api/users', requireRole(['admin']), async (req, res) => {
  try {
    const { name, email, role = 'user', status = 'active' } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const client = await pool.connect();
    
    // Check if email exists
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      client.release();
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Insert new user
    const result = await client.query(`
      INSERT INTO users (name, email, role, status, last_login, created_at) 
      VALUES ($1, $2, $3, $4, NOW(), NOW()) 
      RETURNING id, name, email, role, status, last_login, created_at
    `, [name, email, role, status]);
    
    client.release();
    
    console.log('User created by', req.user.email, ':', result.rows[0].name);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error in POST /api/users:', error);
    res.status(500).json({ error: 'Failed to create user', message: error.message });
  }
});

app.put('/api/users/:id', requireRole(['admin']), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, role, status } = req.body;
    
    const client = await pool.connect();
    
    // Check if user exists
    const existingUser = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is taken by another user
    if (email && email !== existingUser.rows[0].email) {
      const emailCheck = await client.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (emailCheck.rows.length > 0) {
        client.release();
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Update user
    const result = await client.query(`
      UPDATE users 
      SET name = COALESCE($1, name), email = COALESCE($2, email), 
          role = COALESCE($3, role), status = COALESCE($4, status),
          updated_at = NOW()
      WHERE id = $5 
      RETURNING id, name, email, role, status, last_login, created_at, updated_at
    `, [name, email, role, status, userId]);
    
    client.release();
    
    console.log('User updated by', req.user.email, ':', result.rows[0].name);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in PUT /api/users/:id:', error);
    res.status(500).json({ error: 'Failed to update user', message: error.message });
  }
});

app.delete('/api/users/:id', requireRole(['admin']), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    const client = await pool.connect();
    
    // Get user before deletion
    const existingUser = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-deletion
    if (existingUser.rows[0].email === req.user.email) {
      client.release();
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    client.release();
    
    console.log('User deleted by', req.user.email, ':', existingUser.rows[0].name);
    res.json({ message: 'User deleted successfully', user: existingUser.rows[0] });
  } catch (error) {
    console.error('Error in DELETE /api/users/:id:', error);
    res.status(500).json({ error: 'Failed to delete user', message: error.message });
  }
});

// System info endpoint (PROTECTED)
app.get('/api/system', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM system_info ORDER BY service_name');
    client.release();
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error in GET /api/system:', error);
    res.status(500).json({ error: 'Failed to fetch system info', message: error.message });
  }
});

// Database stats endpoint (PROTECTED)
app.get('/api/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const userStats = await client.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE status = 'active') as active_users,
        COUNT(*) FILTER (WHERE role = 'admin') as admin_users,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_users_week
      FROM users
    `);
    
    const metricsStats = await client.query(`
      SELECT 
        COUNT(*) as total_metrics,
        AVG(cpu_usage) as avg_cpu,
        AVG(memory_usage) as avg_memory,
        MAX(created_at) as last_metric
      FROM metrics
    `);
    
    client.release();
    
    res.json({
      users: userStats.rows[0],
      metrics: metricsStats.rows[0],
      timestamp: new Date().toISOString(),
      requestedBy: req.user.email
    });
  } catch (error) {
    console.error('Error in GET /api/stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.originalUrl
  });
});

// Enhanced WebSocket setup with JWT authentication
const server = http.createServer(app);
const io = new Server(server, { 
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// WebSocket Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      throw new Error('No token provided');
    }

    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('./middleware/auth');
    const decoded = jwt.verify(token, JWT_SECRET);
    
    socket.user = decoded;
    console.log('WebSocket authenticated for:', decoded.email);
    next();
  } catch (error) {
    console.error('WebSocket authentication failed:', error.message);
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  console.log('Authenticated client connected:', socket.user.email);
  
  // Send initial metrics
  const initialMetrics = getSystemMetrics();
  socket.emit('metrics', initialMetrics);
  
  // Send metrics every 5 seconds
  const interval = setInterval(async () => {
    const currentMetrics = getSystemMetrics();
    socket.emit('metrics', currentMetrics);
    
    // Also emit user count updates
    try {
      const client = await pool.connect();
      const userCount = await client.query('SELECT COUNT(*) FROM users');
      client.release();
      
      socket.emit('userCount', parseInt(userCount.rows[0].count));
    } catch (error) {
      console.error('Error getting user count:', error);
    }
  }, 5000);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.user.email);
    clearInterval(interval);
  });
});

// Start server
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';
server.listen(PORT, () => {
  console.log('=====================================');
  console.log('🚀 CIS Operations Backend v2.0 Started');
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  console.log(`Database: PostgreSQL`);
  console.log(`Authentication: JWT + Google OAuth`);
  console.log(`Protected API endpoints:`);
  console.log(`  POST /auth/google (login)`);
  console.log(`  GET  /auth/verify (verify token)`);
  console.log(`  GET  /api/metrics (protected)`);
  console.log(`  GET  /api/users (admin/moderator)`);
  console.log(`  POST /api/users (admin only)`);
  console.log(`  PUT  /api/users/:id (admin only)`);
  console.log(`  DELETE /api/users/:id (admin only)`);
  console.log(`  GET  /api/system (protected)`);
  console.log(`  GET  /api/stats (protected)`);
  console.log('=====================================');
});