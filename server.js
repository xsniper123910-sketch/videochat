const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_CODE = "FlitryAdmin2026!";
let users = [];
let waiting = [];

// REGISTER
app.post('/register', (req, res) => {
  try {
    let { role, username, email, password, adminCode } = req.body;

    if (role === 'admin' && adminCode !== ADMIN_CODE) {
      return res.json({ success: false, error: '❌ Wrong admin code' });
    }

    if (!username || !email || !password) return res.json({ success: false, error: '❌ Fill all fields' });
    if (password.length < 6) return res.json({ success: false, error: '❌ Password 6+ characters' });
    if (!email.includes('@')) return res.json({ success: false, error: '❌ Invalid email' });

    const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
    if (exists) return res.json({ success: false, error: '❌ Email or username exists' });

    const newUser = {
      id: Date.now().toString(),
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role || 'payer',
      coins: role === 'payer' || role === 'admin' ? 100 : 0,
      isApproved: role !== 'earner',
      isAdmin: role === 'admin'
    };

    users.push(newUser);
    return res.json({ success: true, message: '✅ Created! Please login.' });
  } catch (e) {
    return res.json({ success: false, error: '❌ Server error' });
  }
});

// LOGIN
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) return res.json({ success: false, error: '❌ Wrong email or password' });
    if (!user.isApproved) return res.json({ success: false, error: '⏳ Waiting approval' });
    return res.json({ success: true, user: { username: user.username, email: user.email, role: user.role, coins: user.coins, isAdmin: user.isAdmin } });
  } catch (e) {
    return res.json({ success: false, error: '❌ Login error' });
  }
});

// USER INFO
app.post('/user-info', (req, res) => {
  const user = users.find(u => u.email.toLowerCase() === req.body.email.toLowerCase());
  return user ? res.json({ success: true, coins: user.coins, username: user.username }) : res.json({ success: false });
});

// BUY COINS
app.post('/buy-coins', (req, res) => {
  const user = users.find(u => u.email.toLowerCase() === req.body.email.toLowerCase());
  if (!user) return res.json({ success: false });
  const packs = { small: 100, medium: 500, large: 1500, mega: 5000 };
  user.coins += packs[req.body.pack];
  return res.json({ success: true, coins: user.coins });
});

// DEDUCT COINS
app.post('/deduct-coins', (req, res) => {
  const user = users.find(u => u.email.toLowerCase() === req.body.email.toLowerCase());
  if (!user || user.coins < 10) return res.json({ success: false });
  user.coins -= 10;
  return res.json({ success: true, coins: user.coins });
});

// SOCKET VIDEO CALL
io.on('connection', socket => {
  socket.on('find', user => {
    waiting = waiting.filter(w => w.email !== user.email);
    const partner = waiting.find(w => w.role !== user.role);
    
    if (partner) {
      waiting = waiting.filter(w => w.email !== partner.email);
      socket.partner = partner.id;
      io.to(partner.id).partner = socket.id;
      io.to(socket.id).emit('found', { name: partner.username, partnerId: partner.id });
      io.to(partner.id).emit('found', { name: user.username, partnerId: socket.id });
    } else {
      waiting.push({ ...user, id: socket.id });
      socket.emit('wait');
    }
  });

  socket.on('signal', d => io.to(d.to).emit('signal', { from: socket.id, s: d.s }));
  socket.on('end', () => socket.partner && io.to(socket.partner).emit('ended'));
  socket.on('disconnect', () => {
    waiting = waiting.filter(w => w.id !== socket.id);
    socket.partner && io.to(socket.partner).emit('ended');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ LIVE on port ${PORT}`));
