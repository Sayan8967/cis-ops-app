// backend/server.js - Simplified version focusing on core functionality
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const os = require('os');

const app = express();

// Simple CORS setup
app.use(cors({
  origin: "*",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Simple metrics function
function getSimpleMetrics() {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      cpu: Math.floor(Math.random() * 50) + 10, // Mock CPU usage
      memory: Math.round((usedMem / totalMem) * 100),
      disk: Math.floor(Math.random() * 30) + 20, // Mock disk usage
      network: Math.floor(Math.random() * 100) + 50, // Mock network usage
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      totalMemory: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
      freeMemory: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
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
}

// Mock user data
let users = [
  { 
    id: 1, 
    name: 'John Doe', 
    email: 'john@example.com', 
    role: 'admin', 
    status: 'active', 
    lastLogin: new Date().toISOString(),
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  { 
    id: 2, 
    name: 'Jane Smith', 
    email: 'jane@example.com', 
    role: 'user', 
    status: 'active', 
    lastLogin: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  { 
    id: 3, 
    name: 'Bob Wilson', 
    email: 'bob@example.com', 
    role: 'user', 
    status: 'inactive', 
    lastLogin: new Date(Date.now() - 172800000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// API health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'operational',
      websocket: 'active',
      database: 'connected'
    }
  });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = getSimpleMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error in /api/metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics', 
      message: error.message 
    });
  }
});

// User management endpoints
app.get('/api/users', (req, res) => {
  try {
    console.log('GET /api/users - returning', users.length, 'users');
    res.json(users);
  } catch (error) {
    console.error('Error in GET /api/users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', (req, res) => {
  try {
    console.log('POST /api/users - creating user:', req.body);
    
    const { name, email, role = 'user', status = 'active' } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const newUser = {
      id: Math.max(...users.map(u => u.id), 0) + 1,
      name,
      email,
      role,
      status,
      lastLogin: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    console.log('User created:', newUser.name);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error in POST /api/users:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    console.log('PUT /api/users/' + userId);
    
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { email } = req.body;
    if (email && email !== users[userIndex].email) {
      if (users.find(u => u.email === email && u.id !== userId)) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    users[userIndex] = { 
      ...users[userIndex], 
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    
    console.log('User updated:', users[userIndex].name);
    res.json(users[userIndex]);
  } catch (error) {
    console.error('Error in PUT /api/users/:id:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    console.log('DELETE /api/users/' + userId);
    
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletedUser = users[userIndex];
    users = users.filter(u => u.id !== userId);
    
    console.log('User deleted:', deletedUser.name);
    res.json({ message: 'User deleted successfully', user: deletedUser });
  } catch (error) {
    console.error('Error in DELETE /api/users/:id:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.originalUrl
  });
});

// Simple WebSocket setup
const server = http.createServer(app);
const io = new Server(server, { 
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send initial metrics
  socket.emit('metrics', getSimpleMetrics());
  
  // Send metrics every 5 seconds
  const interval = setInterval(() => {
    socket.emit('metrics', getSimpleMetrics());
  }, 5000);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    clearInterval(interval);
  });
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log('=====================================');
  console.log('🚀 CIS Operations Backend Started');
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API endpoints available:`);
  console.log(`  GET  /api/metrics`);
  console.log(`  GET  /api/users`);
  console.log(`  POST /api/users`);
  console.log(`  PUT  /api/users/:id`);
  console.log(`  DELETE /api/users/:id`);
  console.log('=====================================');
});