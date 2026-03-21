const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ── CORS (Netlify frontend + admin)
const allowedOrigins = [
  'https://isac-massuque.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  '*'
];

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory message store (últimas 50 msgs)
let messages = [
  {
    id: 1,
    sender: 'Isac Massuque',
    text: 'Olá! 👋 Bem-vindo ao meu portfólio. Sou o Isac, trader Forex. Tens alguma dúvida sobre o mercado ou educação financeira?',
    isAdmin: true,
    time: new Date().toISOString()
  },
  {
    id: 2,
    sender: 'Isac Massuque',
    text: '💡 "Se a tua mente não comporta a visão de 6 dígitos, a tua conta bancária jamais refletirá esse património." — Mindset resilient 📍',
    isAdmin: true,
    time: new Date().toISOString()
  }
];
let msgId = 3;

// Track online visitors and admin
let onlineVisitors = 0;
let adminConnected = false;

// ── REST: get message history
app.get('/api/messages', (req, res) => {
  res.json(messages.slice(-50));
});

// ── REST: health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', visitors: onlineVisitors, adminOnline: adminConnected });
});

// ── Socket.io
io.on('connection', (socket) => {
  const isAdmin = socket.handshake.query.role === 'admin';

  if (isAdmin) {
    adminConnected = true;
    console.log('✅ Admin connected');
    socket.join('admin');
    // Send full history to admin
    socket.emit('history', messages);
    io.emit('admin-status', { online: true });
  } else {
    onlineVisitors++;
    console.log(`👤 Visitor connected (${onlineVisitors} online)`);
    // Send last 30 messages to new visitor
    socket.emit('history', messages.slice(-30));
    // Notify admin of visitor count
    io.to('admin').emit('visitor-count', onlineVisitors);
  }

  // ── Visitor sends message
  socket.on('visitor-msg', (data) => {
    const msg = {
      id: msgId++,
      sender: data.name || 'Visitante',
      text: data.text,
      isAdmin: false,
      time: new Date().toISOString()
    };
    messages.push(msg);
    if (messages.length > 200) messages = messages.slice(-100);

    // Broadcast to everyone (all visitors + admin)
    io.emit('new-msg', msg);
    console.log(`💬 [${msg.sender}]: ${msg.text}`);
  });

  // ── Admin replies
  socket.on('admin-msg', (data) => {
    if (socket.handshake.query.role !== 'admin') return;
    const msg = {
      id: msgId++,
      sender: 'Isac Massuque',
      text: data.text,
      isAdmin: true,
      time: new Date().toISOString()
    };
    messages.push(msg);
    if (messages.length > 200) messages = messages.slice(-100);

    // Broadcast to everyone
    io.emit('new-msg', msg);
    console.log(`👑 [Admin Isac]: ${msg.text}`);
  });

  // ── Admin clears chat
  socket.on('clear-chat', () => {
    if (socket.handshake.query.role !== 'admin') return;
    messages = [];
    io.emit('chat-cleared');
  });

  socket.on('disconnect', () => {
    if (isAdmin) {
      adminConnected = false;
      io.emit('admin-status', { online: false });
      console.log('❌ Admin disconnected');
    } else {
      onlineVisitors = Math.max(0, onlineVisitors - 1);
      io.to('admin').emit('visitor-count', onlineVisitors);
      console.log(`👤 Visitor disconnected (${onlineVisitors} online)`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Isac Massuque Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for real-time chat`);
});
