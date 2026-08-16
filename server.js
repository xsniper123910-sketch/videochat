const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_SECRET_CODE = "FlitryAdmin2026!";
let users = [];
let waitingUsers = [];

// ✅ REGISTER
app.post('/register', (req, res) => {
  try {
    const { role, username, email, password, adminCode, fullName, address, city, country, idPhoto, selfie, proofOfResidence } = req.body;

    if (role === 'admin' && (!adminCode || adminCode !== ADMIN_SECRET_CODE)) {
      return res.json({ success: false, error: '❌ Wrong admin code!' });
    }

    if (!username || !email || !password) return res.json({ success: false, error: '❌ All fields required' });
    if (password.length < 6) return res.json({ success: false, error: '❌ Password 6+ chars' });
    if (!email.includes('@')) return res.json({ success: false, error: '❌ Invalid email' });

    const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
    if (exists) return res.json({ success: false, error: '❌ Email or username exists' });

    const newUser = {
      id: Date.now().toString(),
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role || 'payer',
      coins: (role === 'payer' || role === 'admin') ? 100 : 0,
      fullName, address, city, country, idPhoto, selfie, proofOfResidence,
      isApproved: role !== 'earner',
      isAdmin: role === 'admin',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    return res.json({ success: true, token: newUser.id + ':' + newUser.email, role: newUser.role, isAdmin: newUser.isAdmin, coins: newUser.coins, message: newUser.role === 'earner' ? '✅ Registered! Wait approval.' : '✅ Created! Go Login.' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, error: '❌ Server error: ' + err.message });
  }
});

// ✅ LOGIN
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) return res.json({ success: false, error: '❌ Wrong email/pass' });
    if (!user.isApproved) return res.json({ success: false, error: '⏳ Not approved yet' });
    return res.json({ success: true, token: user.id + ':' + user.email, role: user.role, isAdmin: user.isAdmin, username: user.username, coins: user.coins });
  } catch (err) { return res.json({ success: false, error: '❌ Login error' }); }
});

// ✅ USER INFO
app.post('/user-info', (req, res) => {
  try {
    const { email } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user ? res.json({ success: true, coins: user.coins, username: user.username, role: user.role }) : res.json({ success: false });
  } catch { return res.json({ success: false }); }
});

// ✅ BUY COINS
app.post('/buy-coins', (req, res) => {
  try {
    const { email, packageId } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, error: 'Not found' });
    const pkgs = { small: 100, medium: 500, large: 1500, mega: 5000 };
    if (!pkgs[packageId]) return res.json({ success: false, error: 'Bad package' });
    user.coins += pkgs[packageId];
    return res.json({ success: true, newCoins: user.coins, added: pkgs[packageId] });
  } catch (err) { return res.json({ success: false, error: err.message }); }
});

// ✅ DEDUCT COINS
app.post('/deduct-coins', (req, res) => {
  try {
    const { email, amount } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, error: 'Not found' });
    if (user.coins < amount) return res.json({ success: false, error: '❌ Need more coins' });
    user.coins -= amount;
    return res.json({ success: true, remainingCoins: user.coins });
  } catch { return res.json({ success: false }); }
});

// ✅ SOCKET.IO
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('find-partner', (userData) => {
    waitingUsers = waitingUsers.filter(w => w.email !== userData.email);
    const partner = waitingUsers.find(w => w.role !== userData.role);
    
    if (partner) {
      waitingUsers = waitingUsers.filter(w => w.email !== partner.email);
      socket.partnerId = partner.socketId;
      io.to(partner.socketId).partnerId = socket.id;
      io.to(socket.id).emit('partner-found', { partner: partner.username, partnerId: partner.socketId });
      io.to(partner.socketId).emit('partner-found', { partner: userData.username, partnerId: socket.id });
    } else {
      waitingUsers.push({ ...userData, socketId: socket.id });
      socket.emit('waiting');
    }
  });

  socket.on('signal', (data) => io.to(data.to).emit('signal', { from: socket.id, signal: data.signal }));
  socket.on('end-call', () => { if (socket.partnerId) io.to(socket.partnerId).emit('call-ended'); });
  socket.on('disconnect', () => { waitingUsers = waitingUsers.filter(w => w.socketId !== socket.id); if (socket.partnerId) io.to(socket.partnerId).emit('call-ended'); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ RUNNING PORT ${PORT}`));
