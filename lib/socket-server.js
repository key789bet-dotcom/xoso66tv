/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🚀 SOCKET.IO REALTIME — Mục 10                                   ║
 * ║                                                                    ║
 * ║ Replace chat polling (3s) with WebSocket persistent connection.  ║
 * ║                                                                    ║
 * ║ Events (client → server):                                          ║
 * ║   - join { roomId }       — join room channel                     ║
 * ║   - leave { roomId }      — leave room                             ║
 * ║   - ping                  — keepalive                              ║
 * ║                                                                    ║
 * ║ Events (server → client):                                          ║
 * ║   - chat:msg { roomId, msg }   — new message broadcast            ║
 * ║   - chat:bulk { roomId, msgs } — initial history khi join         ║
 * ║   - pong                                                           ║
 * ║                                                                    ║
 * ║ Cluster mode: dùng Redis adapter để PM2 cluster workers           ║
 * ║   share broadcast state (otherwise message từ worker A không       ║
 * ║   reach client connected vào worker B).                            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

let ioInstance = null;
const ROOMS = new Map();

function attach(httpServer) {
  let Server;
  try { Server = require('socket.io').Server; }
  catch (e) {
    console.warn('[SOCKET] socket.io chưa cài → fallback polling. Run: npm install socket.io @socket.io/redis-adapter');
    return null;
  }

  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,                  // không cần serve client JS (em load qua CDN)
    pingInterval: 25000,
    pingTimeout: 60000,
    cors: { origin: false },             // same-origin only
    transports: ['websocket', 'polling'] // fallback polling nếu WS bị block
  });

  // Redis adapter cho cluster mode
  try {
    const redis = require('./redis');
    if (redis.isReady && redis.isReady()) {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pub = require('ioredis').default ? new (require('ioredis'))() : null;
      const sub = pub ? pub.duplicate() : null;
      if (pub && sub) {
        io.adapter(createAdapter(pub, sub));
        console.log('[SOCKET] ✅ Redis adapter (cluster-safe)');
      }
    } else {
      console.log('[SOCKET] ℹ️  No Redis → in-memory only (works for single worker)');
    }
  } catch (e) {
    console.warn('[SOCKET] ⚠️  Redis adapter not loaded:', e.message);
  }

  // ─── Connection handling ───
  let wsCount = 0;
  let metrics = null;
  try { metrics = require('./metrics'); } catch (_) {}

  io.on('connection', function(socket) {
    let currentRoom = null;
    wsCount++;
    if (metrics) metrics.setWsConnections(wsCount);

    socket.on('disconnect', function() {
      currentRoom = null;
      wsCount = Math.max(0, wsCount - 1);
      if (metrics) metrics.setWsConnections(wsCount);
    });

    socket.on('join', function(data) {
      try {
        const roomId = (data && data.roomId) ? String(data.roomId).slice(0, 64) : '';
        if (!roomId) return;
        if (currentRoom) socket.leave(currentRoom);
        socket.join(roomId);
        currentRoom = roomId;
        // Send initial history
        try {
          const roomChat = require('./room-chat');
          const msgs = roomChat.getMessages(roomId);
          socket.emit('chat:bulk', { roomId, msgs });
        } catch (_) {}
      } catch (e) {
        console.warn('[SOCKET] join err:', e.message);
      }
    });

    socket.on('leave', function(data) {
      try {
        const roomId = data && data.roomId;
        if (roomId) socket.leave(roomId);
        if (currentRoom === roomId) currentRoom = null;
      } catch (_) {}
    });

    socket.on('ping', function() { socket.emit('pong'); });
  });

  // ─── Subscribe room-chat events → broadcast tới WS clients ───
  try {
    const roomChat = require('./room-chat');
    roomChat.onMessage('*', function(roomId, msg) {
      io.to(roomId).emit('chat:msg', { roomId: roomId, msg: msg });
    });
    console.log('[SOCKET] ✅ Subscribed to room-chat events');
  } catch (e) {
    console.warn('[SOCKET] onMessage hook fail:', e.message);
  }

  ioInstance = io;
  console.log('[SOCKET] ✅ Socket.io attached');
  return io;
}

function getIO() { return ioInstance; }

module.exports = { attach, getIO };
