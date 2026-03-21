const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PUBLIC CHAT (todos vêem)
let publicMessages = [
  {
    id: 'p1',
    sender: 'Isac Massuque',
    text: '👋 Bem-vindos à sala pública! Falem à vontade sobre Forex, trading e educação financeira.',
    isAdmin: true,
    time: new Date().toISOString()
  }
];

// ── PRIVATE ROOMS  sessionId → { name, messages, unread }
const privateRooms = new Map();

let msgId = 100;
let onlineVisitors = 0;
let adminConnected = false;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', visitors: onlineVisitors, adminOnline: adminConnected, rooms: privateRooms.size });
});

function sendRoomList() {
  const list = [];
  privateRooms.forEach((room, sid) => {
    list.push({
      sessionId: sid,
      name: room.name,
      unread: room.unread,
      lastMsg: room.messages[room.messages.length - 1]
    });
  });
  list.sort((a, b) => (b.lastMsg?.time || '').localeCompare(a.lastMsg?.time || ''));
  io.to('admin-room').emit('room-list', list);
}

io.on('connection', (socket) => {
  const role      = socket.handshake.query.role;
  const sessionId = socket.handshake.query.sessionId;
  const isAdmin   = role === 'admin';

  // ══ ADMIN ══
  if (isAdmin) {
    adminConnected = true;
    socket.join('admin-room');
    io.emit('admin-status', { online: true });
    socket.emit('public-history', publicMessages.slice(-60));
    sendRoomList();
    console.log('✅ Admin connected');

    // Admin abre sala privada de um visitante
    socket.on('admin-join-room', (sid) => {
      socket.join('private-' + sid);
      const room = privateRooms.get(sid);
      if (room) {
        room.unread = 0;
        socket.emit('private-history', { sessionId: sid, messages: room.messages });
        sendRoomList();
      }
    });

    // Admin responde em privado
    socket.on('admin-private-msg', ({ sessionId: sid, text }) => {
      const room = privateRooms.get(sid);
      const msg = { id: msgId++, sender: 'Isac Massuque', text, isAdmin: true, time: new Date().toISOString() };
      if (room) room.messages.push(msg);
      io.to('private-' + sid).emit('private-msg', msg);
      socket.emit('private-msg-echo', { sessionId: sid, msg });
      console.log(`👑 Admin → [${sid}]: ${text}`);
    });

    // Admin envia para sala pública
    socket.on('admin-public-msg', ({ text }) => {
      const msg = { id: msgId++, sender: 'Isac Massuque', text, isAdmin: true, time: new Date().toISOString() };
      publicMessages.push(msg);
      if (publicMessages.length > 300) publicMessages = publicMessages.slice(-150);
      io.emit('public-msg', msg);
      console.log(`👑 Admin → Public: ${text}`);
    });

    socket.on('clear-public', () => { publicMessages = []; io.emit('public-cleared'); });
    socket.on('clear-private', (sid) => {
      const room = privateRooms.get(sid);
      if (room) { room.messages = []; io.to('private-' + sid).emit('private-cleared'); }
    });

    socket.on('disconnect', () => {
      adminConnected = false;
      io.emit('admin-status', { online: false });
      console.log('❌ Admin disconnected');
    });
    return;
  }

  // ══ VISITOR ══
  onlineVisitors++;
  socket.join('private-' + sessionId);

  if (!privateRooms.has(sessionId)) {
    privateRooms.set(sessionId, {
      name: 'Visitante',
      messages: [{
        id: msgId++,
        sender: 'Isac Massuque',
        text: 'Olá! 👋 Esta conversa é privada — só tu e eu a vemos. Tens dúvidas sobre Forex ou educação financeira?',
        isAdmin: true,
        time: new Date().toISOString()
      }],
      unread: 0
    });
  }

  const room = privateRooms.get(sessionId);
  socket.emit('public-history', publicMessages.slice(-40));
  socket.emit('private-history', { sessionId, messages: room.messages });
  io.to('admin-room').emit('visitor-count', onlineVisitors);
  sendRoomList();
  console.log(`👤 [${sessionId}] connected (${onlineVisitors} online)`);

  // Visitante envia para sala pública
  socket.on('public-msg-send', ({ name, text }) => {
    if (name) room.name = name;
    const msg = { id: msgId++, sender: name || 'Visitante', text, isAdmin: false, sessionId, time: new Date().toISOString() };
    publicMessages.push(msg);
    if (publicMessages.length > 300) publicMessages = publicMessages.slice(-150);
    io.emit('public-msg', msg);
    console.log(`💬 Public [${name}]: ${text}`);
  });

  // Visitante envia mensagem privada
  socket.on('private-msg-send', ({ name, text }) => {
    if (name) room.name = name;
    const msg = { id: msgId++, sender: name || 'Visitante', text, isAdmin: false, time: new Date().toISOString() };
    room.messages.push(msg);
    room.unread++;
    socket.emit('private-msg', msg);
    io.to('admin-room').emit('new-private-msg', { sessionId, name: room.name, msg, unread: room.unread });
    sendRoomList();
    console.log(`🔒 Private [${room.name}]: ${text}`);
  });

  socket.on('disconnect', () => {
    onlineVisitors = Math.max(0, onlineVisitors - 1);
    io.to('admin-room').emit('visitor-count', onlineVisitors);
    console.log(`👤 [${sessionId}] disconnected (${onlineVisitors} online)`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Isac Massuque Server · port ${PORT}`);
  console.log(`📡 Public chat + Private rooms ready`);
});
