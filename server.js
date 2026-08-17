const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const users = {};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.post('/register', (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (users[email]) return res.json({ success: false, error: 'Email exists' });
    users[email] = { username, email, password, role, coins: role === 'payer' ? 100 : 0, online: false };
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const u = users[email];
    if (!u || u.password !== password) return res.json({ success: false, error: 'Wrong login' });
    u.online = true;
    res.json({ success: true, user: { username: u.username, email: u.email, role: u.role, coins: u.coins } });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/buy-coins', (req, res) => {
  try {
    const { email, pack } = req.body;
    const u = users[email];
    if (!u) return res.json({ success: false, error: 'User not found' });
    const packs = {
      small: 100, medium: 550, large: 1700, mega: 5800
    };
    u.coins += packs[pack] || 0;
    res.json({ success: true, newCoinCount: u.coins });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

io.on('connection', (socket) => {
  console.log('🔌 User connected');
  socket.on('login-online', (d) => {
    socket.email = d.email;
    socket.username = d.username;
    if (users[d.email]) users[d.email].online = true;
    console.log('✅', d.username, 'online');
  });
  socket.on('disconnect', () => {
    if (socket.email && users[socket.email]) users[socket.email].online = false;
  });
});

server.listen(PORT, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
