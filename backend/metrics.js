module.exports = function getMetrics() {
  return {
    cpu: Math.floor(Math.random() * 50) + 10,
    memory: Math.floor(Math.random() * 60) + 20,
    disk: Math.floor(Math.random() * 80) + 10,
    network: Math.floor(Math.random() * 100) + 20,
    timestamp: new Date().toISOString()
  };
};