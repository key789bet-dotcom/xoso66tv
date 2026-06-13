/* ╔══════════════════════════════════════════════════════════════════╗
   ║ 🚀 CHAT REALTIME — Mục 10                                         ║
   ║                                                                    ║
   ║ Wrapper Socket.io với fallback POLLING khi:                       ║
   ║   - Socket.io chưa load (CDN block)                                ║
   ║   - Browser/network không support WebSocket                        ║
   ║   - Disconnect > 30s                                               ║
   ║                                                                    ║
   ║ Global API:                                                        ║
   ║   x66ChatRT.join(roomId)                                          ║
   ║   x66ChatRT.leave(roomId)                                         ║
   ║   x66ChatRT.onMessage(cb)                                         ║
   ║   x66ChatRT.isConnected() → boolean                               ║
   ║                                                                    ║
   ║ Tự động fallback nếu socket fail → POLLING /api/chat/poll mỗi 3s ║
   ╚══════════════════════════════════════════════════════════════════*/
(function(){
  var socket = null;
  var connected = false;
  var currentRoom = null;
  var listeners = [];
  var lastSeenId = 0;
  var pollTimer = null;
  var POLL_MS = 3000;

  function _emit(roomId, msg) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](roomId, msg); } catch(_){}
    }
  }

  function _initSocket() {
    if (typeof io !== 'function') {
      console.log('[chat-rt] socket.io không load được → polling mode');
      _startPolling();
      return;
    }
    try {
      socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 8000
      });
      socket.on('connect', function() {
        connected = true;
        console.log('[chat-rt] ✅ WebSocket connected', socket.id);
        if (currentRoom) socket.emit('join', { roomId: currentRoom });
        _stopPolling();
      });
      socket.on('disconnect', function(reason) {
        connected = false;
        console.log('[chat-rt] disconnect:', reason);
        // Fallback polling khi disconnect quá lâu
        setTimeout(function(){
          if (!connected) _startPolling();
        }, 5000);
      });
      socket.on('chat:msg', function(data) {
        if (!data) return;
        if (data.msg && data.msg.id) lastSeenId = Math.max(lastSeenId, data.msg.id);
        _emit(data.roomId, data.msg);
      });
      socket.on('chat:bulk', function(data) {
        if (!data || !Array.isArray(data.msgs)) return;
        data.msgs.forEach(function(m){
          if (m && m.id) lastSeenId = Math.max(lastSeenId, m.id);
          _emit(data.roomId, m);
        });
      });
      socket.on('connect_error', function(e) {
        console.log('[chat-rt] connect_error:', e.message);
        _startPolling();
      });
    } catch (e) {
      console.warn('[chat-rt] init err:', e.message);
      _startPolling();
    }
  }

  function _startPolling() {
    if (pollTimer) return;
    if (!currentRoom) return;
    console.log('[chat-rt] 🔄 Starting POLLING fallback (' + POLL_MS + 'ms)');
    pollTimer = setInterval(_poll, POLL_MS);
    _poll();
  }
  function _stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      console.log('[chat-rt] ⏹ Polling stopped (socket OK)');
    }
  }
  function _poll() {
    if (!currentRoom) return;
    // Endpoint thật: /api/chat/:roomId/recent?since=<lastMsgId>
    fetch('/api/chat/' + encodeURIComponent(currentRoom) + '/recent?since=' + lastSeenId,
          { credentials: 'same-origin' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        var msgs = (d && (d.msgs || d.messages)) || [];
        msgs.forEach(function(m){
          if (m && m.id) lastSeenId = Math.max(lastSeenId, m.id);
          _emit(currentRoom, m);
        });
      }).catch(function(){});
  }

  // ─── Public API ───
  window.x66ChatRT = {
    join: function(roomId) {
      currentRoom = roomId;
      if (socket && connected) {
        socket.emit('join', { roomId: roomId });
      } else if (!socket) {
        _initSocket();
      } else {
        _startPolling();
      }
    },
    leave: function(roomId) {
      if (socket && connected) socket.emit('leave', { roomId: roomId });
      _stopPolling();
      currentRoom = null;
    },
    onMessage: function(cb) {
      listeners.push(cb);
      return function unsubscribe() {
        var idx = listeners.indexOf(cb);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    isConnected: function() { return connected; },
    getMode: function() { return connected ? 'websocket' : (pollTimer ? 'polling' : 'idle'); }
  };

  // Auto-init socket khi page load (defer connection cho đến khi có join)
  // Không tự connect ngay để không tốn resource trên trang không có chat.
})();
