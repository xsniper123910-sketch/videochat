const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ CONFIG
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const ADMIN_SECRET_CODE = "FlitryAdmin2026!"; // 🔒 CHANGE THIS IF YOU WANT

// ✅ SIMPLE DATA STORAGE
let users = [];
let waitingUsers = [];

// ✅ REGISTER — ZERO ERRORS VERSION
app.post('/register', (req, res) => {
  try {
    const { role, username, email, password, adminCode, fullName, address, city, country, idPhoto, selfie, proofOfResidence } = req.body;

    // 🔒 ADMIN CODE CHECK
    if (role === 'admin') {
      if (!adminCode || adminCode !== ADMIN_SECRET_CODE) {
        return res.json({ success: false, error: '❌ Wrong admin code!' });
      }
    }

    // ✅ SIMPLE VALIDATION
    if (!username || !email || !password) {
      return res.json({ success: false, error: '❌ Username, email and password required' });
    }
    if (password.length < 6) {
      return res.json({ success: false, error: '❌ Password must be 6+ characters' });
    }
    if (!email.includes('@')) {
      return res.json({ success: false, error: '❌ Enter a valid email' });
    }

    // ✅ CHECK EXISTING
    const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      return res.json({ success: false, error: '❌ Email or username already registered' });
    }

    // ✅ CREATE USER
    const newUser = {
      id: Date.now().toString(),
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      role: role || 'payer',
      coins: role === 'payer' || role === 'admin' ? 100 : 0,
      fullName: fullName || null,
      address: address || null,
      city: city || null,
      country: country || null,
      idPhoto: idPhoto || null,
      selfie: selfie || null,
      proofOfResidence: proofOfResidence || null,
      isApproved: role !== 'earner',
      isAdmin: role === 'admin',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    console.log('✅ User registered:', newUser.username);

    return res.json({
      success: true,
      token: newUser.id + ':' + newUser.email,
      role: newUser.role,
      isAdmin: newUser.isAdmin,
      coins: newUser.coins,
      message: newUser.role === 'earner' ? '✅ Registered! Waiting for approval.' : '✅ Account created! Please login.'
    });

  } catch (err) {
    console.error('❌ REGISTER ERROR:', err.message);
    return res.json({ success: false, error: '❌ Server error: ' + err.message });
  }
});

// ✅ LOGIN
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (!user) return res.json({ success: false, error: '❌ Email or password wrong' });
    if (!user.isApproved) return res.json({ success: false, error: '⏳ Account not approved yet' });

    return res.json({
      success: true,
      token: user.id + ':' + user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      username: user.username,
      coins: user.coins
    });
  } catch (err) {
    console.error('❌ LOGIN ERROR:', err.message);
    return res.json({ success: false, error: '❌ Login error' });
  }
});

// ✅ GET USER INFO
app.post('/user-info', (req, res) => {
  try {
    const { email } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false });
    return res.json({ success: true, coins: user.coins, username: user.username, role: user.role });
  } catch (err) { return res.json({ success: false }); }
});

// ✅ BUY COINS
app.post('/buy-coins', (req, res) => {
  try {
    const { email, packageId } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, error: 'User not found' });

    const packages = {
      small: 100,
      medium: 500,
      large: 1500,
      mega: 5000
    };

    const amount = packages[packageId];
    if (!amount) return res.json({ success: false, error: 'Invalid package' });

    user.coins += amount;
    return res.json({ success: true, newCoins: user.coins, added: amount });
  } catch (err) { return res.json({ success: false, error: err.message }); }
});

// ✅ DEDUCT COINS
app.post('/deduct-coins', (req, res) => {
  try {
    const { email, amount } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, error: 'User not found' });
    if (user.coins < amount) return res.json({ success: false, error: '❌ Not enough coins!' });

    user.coins -= amount;
    return res.json({ success: true, remainingCoins: user.coins });
  } catch (err) { return res.json({ success: false }); }
});

// ✅ SOCKET.IO VIDEO CALL
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('find-partner', (userData) => {
    // Remove if already waiting
    waitingUsers = waitingUsers.filter(w => w.email !== userData.email);

    // Find partner
    const partner = waitingUsers.find(w => w.role !== userData.role);
    
    if (partner) {
      waitingUsers = waitingUsers.filter(w => w.email !== partner.email);
      socket.partnerId = partner.socketId;
      io.to(partner.socketId).partnerId = socket.id;
      
      io.to(socket.id).emit('partner-found', { 
        partner: partner.username, 
        partnerId: partner.socketId 
      });
      io.to(partner.socketId).emit('partner-found', { 
        partner: userData.username, 
        partnerId: socket.id 
      });
    } else {
      waitingUsers.push({ ...userData, socketId: socket.id });
      socket.emit('waiting');
    }
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('end-call', () => {
    if (socket.partnerId) io.to(socket.partnerId).emit('call-ended');
  });

  socket.on('disconnect', () => {
    waitingUsers = waitingUsers.filter(w => w.socketId !== socket.id);
    if (socket.partnerId) io.to(socket.partnerId).emit('call-ended');
  });
});

// ✅ START SERVER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ SERVER RUNNING ON PORT ${PORT}`));
