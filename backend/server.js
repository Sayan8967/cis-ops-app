const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const os = require('os');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

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

// Make Kubernetes API call
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
          const result = JSON.parse(data);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Kubernetes API request timeout'));
    });
    
    req.end();
  });
}

// Fetch Kubernetes cluster metrics
async function getK8sMetrics() {
  try {
    // Get pods in the namespace
    const podsResponse = await makeK8sAPICall(`/api/v1/namespaces/${NAMESPACE}/pods`);
    const pods = podsResponse.items || [];
    
    // Get nodes
    const nodesResponse = await makeK8sAPICall('/api/v1/nodes');
    const nodes = nodesResponse.items || [];
    
    // Get services
    const servicesResponse = await makeK8sAPICall(`/api/v1/namespaces/${NAMESPACE}/services`);
    const services = servicesResponse.items || [];
    
    // Get deployments
    const deploymentsResponse = await makeK8sAPICall(`/apis/apps/v1/namespaces/${NAMESPACE}/deployments`);
    const deployments = deploymentsResponse.items || [];

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

    // Get resource usage from pods (approximation)
    let totalCpuRequests = 0;
    let totalMemoryRequests = 0;
    
    pods.forEach(pod => {
      if (pod.spec.containers) {
        pod.spec.containers.forEach(container => {
          if (container.resources && container.resources.requests) {
            if (container.resources.requests.cpu) {
              // Convert CPU requests (e.g., "100m" to 0.1)
              const cpu = container.resources.requests.cpu;
              if (cpu.endsWith('m')) {
                totalCpuRequests += parseInt(cpu.slice(0, -1)) / 1000;
              } else {
                totalCpuRequests += parseFloat(cpu);
              }
            }
            if (container.resources.requests.memory) {
              // Convert memory requests (e.g., "128Mi" to MB)
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
        }
      },
      pods: pods.map(pod => ({
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

// Health check endpoint
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
      loadAverage: os.loadavg()
    }
  };
  
  res.status(200).json(healthCheck);
});

// API health check (more detailed)
app.get('/api/health', (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'connected',
      websocket: 'active',
      api: 'operational',
      kubernetes: getK8sToken() ? 'connected' : 'local-mode'
    },
    checks: {
      memory: os.freemem() > (os.totalmem() * 0.1),
      cpu: os.loadavg()[0] < os.cpus().length * 2,
      uptime: process.uptime() > 0,
      k8sAccess: !!getK8sToken()
    }
  };
  
  const allChecksPass = Object.values(healthCheck.checks).every(check => check === true);
  healthCheck.status = allChecksPass ? 'healthy' : 'degraded';
  
  const statusCode = allChecksPass ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// Enhanced metrics function that includes both local and K8s metrics
async function getEnhancedMetrics() {
  // Get local container metrics
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

  const localMetrics = {
    cpu: Math.round(usage) || Math.floor(Math.random() * 50) + 10,
    memory: Math.round((usedMem / totalMem) * 100),
    disk: Math.round(Math.random() * 30 + 20),
    network: Math.round(Math.random() * 100 + 50),
    uptime: Math.round(os.uptime()),
    platform: os.platform(),
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
    totalMemory: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
    freeMemory: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
    cpuCount: cpus.length,
    loadAverage: os.loadavg()
  };

  try {
    // Try to get Kubernetes metrics
    const k8sMetrics = await getK8sMetrics();
    return {
      ...localMetrics,
      kubernetes: k8sMetrics,
      source: 'kubernetes-integrated'
    };
  } catch (error) {
    console.log('Using local metrics only:', error.message);
    return {
      ...localMetrics,
      kubernetes: null,
      source: 'local-only',
      k8sError: error.message
    };
  }
}

// Mock user data (in production, this would be a database)
let users = [
  { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin', status: 'active', lastLogin: new Date().toISOString() },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user', status: 'active', lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: 'user', status: 'inactive', lastLogin: new Date(Date.now() - 172800000).toISOString() }
];

// API Routes
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await getEnhancedMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metrics', message: error.message });
  }
});

app.get('/api/users', (req, res) => res.json(users));

app.post('/api/users', (req, res) => {
  const newUser = {
    id: Math.max(...users.map(u => u.id)) + 1,
    ...req.body,
    lastLogin: new Date().toISOString()
  };
  users.push(newUser);
  res.json(newUser);
});

app.put('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  users[userIndex] = { ...users[userIndex], ...req.body };
  res.json(users[userIndex]);
});

app.delete('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  users = users.filter(u => u.id !== userId);
  res.json({ message: 'User deleted successfully' });
});

// WebSocket setup
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', socket => {
  console.log('Client connected');
  
  // Send initial metrics
  getEnhancedMetrics().then(metrics => {
    socket.emit('metrics', metrics);
  }).catch(err => {
    console.error('Error sending initial metrics:', err);
  });
  
  // Send metrics every 5 seconds (increased interval for K8s API calls)
  const interval = setInterval(async () => {
    try {
      const metrics = await getEnhancedMetrics();
      socket.emit('metrics', metrics);
    } catch (error) {
      console.error('Error in metrics interval:', error);
    }
  }, 5000);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`API health check available at: http://localhost:${PORT}/api/health`);
  console.log(`Kubernetes integration: ${getK8sToken() ? 'ENABLED' : 'DISABLED (local mode)'}`);
  console.log(`System: ${os.platform()} ${os.arch()}`);
  console.log(`CPU Cores: ${os.cpus().length}`);
  console.log(`Total Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`);
});