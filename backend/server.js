// backend/server.js - Enhanced server with better health checks and error handling
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const os = require('os');
const fs = require('fs');
const https = require('https');

const app = express();

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow any origin in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, allow specific origins
    const allowedOrigins = [
      process.env.CORS_ORIGIN,
      'http://localhost:3000',
      'http://localhost:30080',
      /^http:\/\/.*:30080$/,
      /^http:\/\/.*:3000$/,
    ].filter(Boolean);
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      return allowedOrigin.test(origin);
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Kubernetes API configuration
const K8S_API_HOST = process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
const K8S_API_PORT = process.env.KUBERNETES_SERVICE_PORT || '443';
const K8S_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const K8S_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const NAMESPACE = process.env.NAMESPACE || 'cis-ops';

// Read Kubernetes service account token
function getK8sToken() {
  try {
    return fs.readFileSync(K8S_TOKEN_PATH, 'utf8').trim();
  } catch (err) {
    console.log('Running outside Kubernetes cluster, using local metrics only');
    return null;
  }
}

// Read Kubernetes CA certificate
function getK8sCA() {
  try {
    return fs.readFileSync(K8S_CA_PATH);
  } catch (err) {
    return null;
  }
}

// Make Kubernetes API call with improved error handling
function makeK8sAPICall(path) {
  return new Promise((resolve, reject) => {
    const token = getK8sToken();
    const ca = getK8sCA();
    
    if (!token) {
      reject(new Error('No Kubernetes token available'));
      return;
    }

    const options = {
      hostname: K8S_API_HOST,
      port: K8S_API_PORT,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      ca: ca,
      rejectUnauthorized: !!ca
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const result = JSON.parse(data);
            resolve(result);
          } else {
            reject(new Error(`Kubernetes API returned ${res.statusCode}: ${data}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse Kubernetes API response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Kubernetes API request failed: ${err.message}`));
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Kubernetes API request timeout'));
    });
    
    req.end();
  });
}

// Fetch Kubernetes cluster metrics with improved error handling
async function getK8sMetrics() {
  try {
    const [podsResponse, nodesResponse, servicesResponse, deploymentsResponse] = await Promise.allSettled([
      makeK8sAPICall(`/api/v1/namespaces/${NAMESPACE}/pods`),
      makeK8sAPICall('/api/v1/nodes'),
      makeK8sAPICall(`/api/v1/namespaces/${NAMESPACE}/services`),
      makeK8sAPICall(`/apis/apps/v1/namespaces/${NAMESPACE}/deployments`)
    ]);

    const pods = podsResponse.status === 'fulfilled' ? podsResponse.value.items || [] : [];
    const nodes = nodesResponse.status === 'fulfilled' ? nodesResponse.value.items || [] : [];
    const services = servicesResponse.status === 'fulfilled' ? servicesResponse.value.items || [] : [];
    const deployments = deploymentsResponse.status === 'fulfilled' ? deploymentsResponse.value.items || [] : [];

    // Calculate pod statistics
    const podStats = {
      total: pods.length,
      running: pods.filter(pod => pod.status.phase === 'Running').length,
      pending: pods.filter(pod => pod.status.phase === 'Pending').length,
      failed: pods.filter(pod => pod.status.phase === 'Failed').length,
      succeeded: pods.filter(pod => pod.status.phase === 'Succeeded').length
    };

    // Calculate node statistics
    const nodeStats = {
      total: nodes.length,
      ready: nodes.filter(node => 
        node.status.conditions.find(c => c.type === 'Ready' && c.status === 'True')
      ).length,
      notReady: nodes.filter(node => 
        !node.status.conditions.find(c => c.type === 'Ready' && c.status === 'True')
      ).length
    };

    // Calculate deployment statistics
    const deploymentStats = {
      total: deployments.length,
      available: deployments.filter(dep => dep.status.availableReplicas > 0).length,
      unavailable: deployments.filter(dep => !dep.status.availableReplicas).length
    };

    // Calculate resource usage from pods
    let totalCpuRequests = 0;
    let totalMemoryRequests = 0;
    
    pods.forEach(pod => {
      if (pod.spec.containers) {
        pod.spec.containers.forEach(container => {
          if (container.resources && container.resources.requests) {
            if (container.resources.requests.cpu) {
              const cpu = container.resources.requests.cpu;
              if (cpu.endsWith('m')) {
                totalCpuRequests += parseInt(cpu.slice(0, -1)) / 1000;
              } else {
                totalCpuRequests += parseFloat(cpu);
              }
            }
            if (container.resources.requests.memory) {
              const memory = container.resources.requests.memory;
              if (memory.endsWith('Mi')) {
                totalMemoryRequests += parseInt(memory.slice(0, -2));
              } else if (memory.endsWith('Gi')) {
                totalMemoryRequests += parseInt(memory.slice(0, -2)) * 1024;
              }
            }
          }
        });
      }
    });

    return {
      cluster: {
        namespace: NAMESPACE,
        timestamp: new Date().toISOString(),
        pods: podStats,
        nodes: nodeStats,
        services: services.length,
        deployments: deploymentStats,
        resourceUsage: {
          cpuRequests: Math.round(totalCpuRequests * 100) / 100,
          memoryRequestsMB: totalMemoryRequests
        },
        errors: {
          pods: podsResponse.status === 'rejected' ? podsResponse.reason.message : null,
          nodes: nodesResponse.status === 'rejected' ? nodesResponse.reason.message : null,
          services: servicesResponse.status === 'rejected' ? servicesResponse.reason.message : null,
          deployments: deploymentsResponse.status === 'rejected' ? deploymentsResponse.reason.message : null
        }
      },
      pods: pods.slice(0, 50).map(pod => ({ // Limit to 50 pods to avoid large responses
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: pod.status.phase,
        restarts: pod.status.containerStatuses ? 
          pod.status.containerStatuses.reduce((sum, c) => sum + c.restartCount, 0) : 0,
        createdAt: pod.metadata.creationTimestamp,
        node: pod.spec.nodeName,
        ready: pod.status.containerStatuses ? 
          pod.status.containerStatuses.every(c => c.ready) : false
      })),
      services: services.map(svc => ({
        name: svc.metadata.name,
        type: svc.spec.type,
        ports: svc.spec.ports,
        clusterIP: svc.spec.clusterIP
      }))
    };
    
  } catch (error) {
    console.error('Error fetching Kubernetes metrics:', error.message);
    throw error;
  }
}

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    system: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`,
      freeMemory: `${Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100}GB`,
      loadAverage: os.loadavg(),
      nodeVersion: process.version
    },
    features: {
      kubernetes: !!getK8sToken(),
      websocket: true,
      cors: true
    }
  };
  
  res.status(200).json(healthCheck);
});

// Comprehensive API health check
app.get('/api/health', async (req, res) => {
  const checks = {
    memory: os.freemem() > (os.totalmem() * 0.1),
    cpu: os.loadavg()[0] < os.cpus().length * 2,
    uptime: process.uptime() > 0,
    k8sAccess: !!getK8sToken()
  };

  // Test Kubernetes connectivity if available
  if (checks.k8sAccess) {
    try {
      await makeK8sAPICall('/api/v1/namespaces');
      checks.k8sConnectivity = true;
    } catch (error) {
      checks.k8sConnectivity = false;
      checks.k8sError = error.message;
    }
  }

  const allChecksPass = Object.entries(checks)
    .filter(([key]) => !key.includes('Error'))
    .every(([, value]) => value === true);

  const healthCheck = {
    status: allChecksPass ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'connected', // Mock - replace with real DB check
      websocket: 'active',
      api: 'operational',
      kubernetes: checks.k8sAccess ? (checks.k8sConnectivity ? 'connected' : 'available-but-unreachable') : 'not-available'
    },
    checks,
    system: {
      memoryUsage: `${Math.round((1 - os.freemem() / os.totalmem()) * 100)}%`,
      cpuLoad: os.loadavg()[0].toFixed(2),
      uptime: Math.round(process.uptime()),
      pid: process.pid
    }
  };
  
  const statusCode = allChecksPass ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// Enhanced metrics function with better error handling
async function getEnhancedMetrics() {
  // Get local container metrics with error handling
  let localMetrics;
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    localMetrics = {
      cpu: Math.max(0, Math.min(100, Math.round(usage) || Math.floor(Math.random() * 50) + 10)),
      memory: Math.max(0, Math.min(100, Math.round((usedMem / totalMem) * 100))),
      disk: Math.round(Math.random() * 30 + 20), // Mock disk usage
      network: Math.round(Math.random() * 100 + 50), // Mock network usage
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      totalMemory: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
      freeMemory: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
      cpuCount: cpus.length,
      loadAverage: os.loadavg(),
      processUptime: Math.round(process.uptime())
    };
  } catch (error) {
    console.error('Error getting local metrics:', error);
    localMetrics = {
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

  // Try to get Kubernetes metrics
  try {
    const k8sMetrics = await getK8sMetrics();
    return {
      ...localMetrics,
      kubernetes: k8sMetrics,
      source: 'kubernetes-integrated'
    };
  } catch (error) {
    console.log('Kubernetes metrics unavailable, using local metrics only:', error.message);
    return {
      ...localMetrics,
      kubernetes: null,
      source: 'local-only',
      k8sError: error.message
    };
  }
}

// Mock user data with better structure
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

// Enhanced API Routes with better error handling
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await getEnhancedMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error in /api/metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/users', (req, res) => {
  try {
    console.log('GET /api/users - returning', users.length, 'users');
    res.json(users);
  } catch (error) {
    console.error('Error in GET /api/users:', error);
    res.status(500).json({ error: 'Failed to fetch users', message: error.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    console.log('POST /api/users - creating user:', req.body);
    
    // Validate required fields
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email already exists
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const newUser = {
      id: Math.max(...users.map(u => u.id), 0) + 1,
      ...req.body,
      lastLogin: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    console.log('User created successfully:', newUser);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error in POST /api/users:', error);
    res.status(500).json({ error: 'Failed to create user', message: error.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    console.log('PUT /api/users/' + userId, '- updating user:', req.body);
    
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate email uniqueness if email is being changed
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
    
    console.log('User updated successfully:', users[userIndex]);
    res.json(users[userIndex]);
  } catch (error) {
    console.error('Error in PUT /api/users/:id:', error);
    res.status(500).json({ error: 'Failed to update user', message: error.message });
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
    
    console.log('User deleted successfully:', deletedUser.name);
    res.json({ message: 'User deleted successfully', user: deletedUser });
  } catch (error) {
    console.error('Error in DELETE /api/users/:id:', error);
    res.status(500).json({ error: 'Failed to delete user', message: error.message });
  }
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /health',
      'GET /api/health', 
      'GET /api/metrics',
      'GET /api/users',
      'POST /api/users',
      'PUT /api/users/:id',
      'DELETE /api/users/:id'
    ]
  });
});

// Enhanced WebSocket setup with better error handling
const server = http.createServer(app);
const io = new Server(server, { 
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

const activeConnections = new Set();

io.on('connection', (socket) => {
  const clientId = socket.id;
  activeConnections.add(clientId);
  console.log(`Client connected: ${clientId} (Total: ${activeConnections.size})`);
  
  // Send initial metrics
  getEnhancedMetrics()
    .then(metrics => {
      socket.emit('metrics', metrics);
      console.log('Initial metrics sent to client:', clientId);
    })
    .catch(err => {
      console.error('Error sending initial metrics to client:', clientId, err.message);
      socket.emit('error', { message: 'Failed to fetch initial metrics' });
    });
  
  // Send metrics every 5 seconds
  const interval = setInterval(async () => {
    try {
      const metrics = await getEnhancedMetrics();
      socket.emit('metrics', metrics);
    } catch (error) {
      console.error('Error in metrics interval for client:', clientId, error.message);
      socket.emit('error', { message: 'Failed to fetch metrics update' });
    }
  }, 5000);
  
  socket.on('disconnect', (reason) => {
    activeConnections.delete(clientId);
    console.log(`Client disconnected: ${clientId} (Reason: ${reason}, Remaining: ${activeConnections.size})`);
    clearInterval(interval);
  });

  socket.on('error', (error) => {
    console.error('Socket error for client:', clientId, error);
  });

  // Handle client ping
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

io.on('error', (error) => {
  console.error('Socket.IO server error:', error);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log('🚀 CIS Operations Backend Server Started');
  console.log('=====================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API health check: http://localhost:${PORT}/api/health`);
  console.log(`Kubernetes integration: ${getK8sToken() ? 'ENABLED' : 'DISABLED (local mode)'}`);
  console.log(`CORS origin: ${process.env.CORS_ORIGIN || 'any'}`);
  console.log(`System: ${os.platform()} ${os.arch()}`);
  console.log(`CPU Cores: ${os.cpus().length}`);
  console.log(`Total Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`);
  console.log(`Node.js Version: ${process.version}`);
  console.log('=====================================');
});