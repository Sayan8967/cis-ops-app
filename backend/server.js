const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const getMetrics = require('./metrics');

const app = express();
app.use(cors());
app.get('/api/metrics', (req, res) => res.json(getMetrics()));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', socket => {
  const interval = setInterval(() => socket.emit('metrics', getMetrics()), 3000);
  socket.on('disconnect', () => clearInterval(interval));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));