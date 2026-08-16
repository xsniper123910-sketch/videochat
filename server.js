const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ✅ CORS FIX — ALLOW ALL REQUESTS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_CODE = "FlitryAdmin2026!";
let users = [];

// ✅ REGISTER ENDPOINT
app.post('/register', (req, res) => {
  console.log('📩 REGISTER:', req.body);
  const { role, username, email, password, adminCode } = req.body;

  if (!username || !email || !password) {
    return res.json({ success: false, error: 'Fill all fields' });
  }
  if (!email.includes('@')) {
    return res.json({ success: false, error: 'Enter valid email' });
  }
  if (password.length < 6) {
    return res.json({ success: false, error: 'Password min 6 chars' });
  }
  if (role === 'admin' && adminCode !== ADMIN_CODE) {
    return res.json({ success: false, error: 'Wrong Admin Code' });
  }

  const exists = users.find(u => 
    u.email.toLowerCase() === email.toLowerCase() || 
    u.username.toLowerCase() === username.toLowerCase()
  );
  if (exists) {
    return res.json({ success: false, error: 'Email or Username already exists' });
  }

  let coins = 0, approved = false, isAdmin = false;
  if (role === 'payer') { coins = 100; approved = true; }
  if (role === 'earner') { coins = 0; approved = false; }
  if (role === 'admin') { coins = 9999; approved = true; isAdmin = true; }

  users.push({
    id: Date.now().toString(),
    username: username.trim(),
    email: email.toLowerCase(),
    password,
    role,
    coins,
    isApproved: approved,
    isAdmin
  });

  console.log('✅ CREATED:', username);
  return res.json({ success: true });
});

// ✅ LOGIN ENDPOINT
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => 
    u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) return res.json({ success: false, error: 'Wrong email or password' });
  if (!user.isApproved) return res.json({ success: false, error: 'Account waiting approval' });
  return res.json({ success: true, user: {
    username: user.username,
    email: user.email,
    role: user.role,
    coins: user.coins,
    isAdmin: user.isAdmin
  }});
});

// ✅ COINS ENDPOINTS
app.post('/buy-coins', (req, res) => {
  const { email, pack } = req.body;
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.json({ success: false });
  const prices = { small: [100,0], medium: [500,50], large: [1500,200], mega: [5000,800] };
  const p = prices[pack];
  if (!p) return res.json({ success: false });
  user.coins += p[0] + p[1];
  return res.json({ success: true, coins: user.coins });
});

app.post('/deduct-coins', (req, res) => {
  const { email, amount } = req.body;
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.coins < amount) return res.json({ success: false });
  user.coins -= amount;
  return res.json({ success: true, coins: user.coins });
});

// ✅ SOCKET.IO
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });
let waiting = [];

io.on('connection', socket => {
  socket.on('find', data => {
    waiting = waiting.filter(w => w.email !== data.email);
    const partner = waiting.find(w => w.role !== data.role);
    if (partner) {
      waiting = waiting.filter(w => w.id !== partner.id);
      socket.partner = partner.id;
      io.to(partner.id).partner = socket.id;
      io.to(socket.id).emit('found', { name: partner.username, partnerId: partner.id });
      io.to(partner.id).emit('found', { name: data.username, partnerId: socket.id });
    } else {
      waiting.push({ ...data, id: socket.id });
      socket.emit('wait');
    }
  });
  socket.on('signal', d => { if (d.to) io.to(d.to).emit('signal', { from: socket.id, s: d.s }); });
  socket.on('end', () => { if (socket.partner) io.to(socket.partner).emit('ended'); });
  socket.on('disconnect', () => { waiting = waiting.filter(w => w.id !== socket.id); if (socket.partner) io.to(socket.partner).emit('ended'); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ SERVER RUNNING ON PORT ${PORT}`));
