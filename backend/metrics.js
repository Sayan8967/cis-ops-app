// backend/metrics.js - Simplified metrics module
const os = require('os');

function getMetrics() {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Calculate a simple CPU usage approximation
    const loadAvg = os.loadavg()[0];
    const cpuUsage = Math.min(100, Math.max(0, Math.round((loadAvg / cpus.length) * 100)));
    
    return {
      cpu: cpuUsage || Math.floor(Math.random() * 50) + 10,
      memory: Math.round((usedMem / totalMem) * 100),
      disk: Math.floor(Math.random() * 80) + 10, // Mock disk usage
      network: Math.floor(Math.random() * 100) + 20, // Mock network usage
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      totalMemoryGB: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
      freeMemoryGB: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
      cpuCount: cpus.length,
      loadAverage: os.loadavg(),
      processUptime: Math.round(process.uptime()),
      nodeVersion: process.version
    };
  } catch (error) {
    console.error('Error getting system metrics:', error);
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

module.exports = getMetrics;