const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 🔒 YOUR SECRET ADMIN CODE — CHANGE THIS!
const ADMIN_SECRET_CODE = "FlitryAdmin2026!";

const users = [];
const onlineUsers = [];
const waitingUsers = [];

// ✅ REGISTER — FIXED & CLEAN
app.post('/register', async (req, res) => {
  try {
    const { role, username, email, password, adminCode, fullName, address, city, country, idPhoto, selfie, proofOfResidence } = req.body;

    // 🔒 ADMIN CODE CHECK
    if (role === 'admin') {
      if (!adminCode || adminCode !== ADMIN_SECRET_CODE) {
        return res.json({ success: false, error: '❌ WRONG ADMIN CODE! ONLY OWNER CAN CREATE ADMIN!' });
      }
    }

    // ✅ VALIDATION
    if (!username || !email || !password) {
      return res.json({ success: false, error: '❌ Username, email and password are required' });
    }
    if (password.length < 6) {
      return res.json({ success: false, error: '❌ Password must be at least 6 characters' });
    }
    if (!email.includes('@')) {
      return res.json({ success: false, error: '❌ Enter a valid email address' });
    }

    // ✅ CHECK DUPLICATES
    const existing = users.find(u => 
      u.email.toLowerCase() === email.toLowerCase() || 
      u.username?.toLowerCase() === username.toLowerCase()
    );
    if (existing) {
      return res.json({ success: false, error: '❌ Email or username already registered' });
    }

    // ✅ CREATE USER
    const user = {
      id: Date.now().toString(),
      username,
      email: email.toLowerCase(),
      password,
      role,
      coins: role === 'payer' ? 100 : 0,
      fullName: fullName || null,
      address: address || null,
      city: city || null,
      country: country || null,
      idPhoto: idPhoto || null,
      selfie: selfie || null,
      proofOfResidence: proofOfResidence || null,
      isApproved: (role === 'payer' || role === 'admin') ? true : false,
      isAdmin: role === 'admin',
      createdAt: new Date().toISOString()
    };

    users.push(user);

    res.json({
      success: true,
      token: user.id + ':' + user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      coins: user.coins,
      message: role === 'earner' 
        ? '✅ Registered! Waiting for approval.' 
        : '✅ Account created! You have 100 FREE coins! Please login.'
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.json({ success: false, error: '❌ Server error: ' + err.message });
  }
});

// ✅ LOGIN
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => 
      u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    
    if (!user) return res.json({ success: false, error: '❌ Email or password incorrect' });
    if (!user.isApproved) return res.json({ success: false, error: '⏳ Account not approved yet.' });

    res.json({
      success: true,
      token: user.id + ':' + user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      username: user.username,
      coins: user.coins
    });
  } catch (err) {
    res.json({ success: false, error: '❌ Login error: ' + err.message });
  }
});

// ✅ USER INFO
app.post('/user-info', async (req, res) => {
  try {
    const { email } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false });
    res.json({ success: true, coins: user.coins, username: user.username, role: user.role });
  } catch (err) { res.json({ success: false }); }
});

// ✅ BUY COINS
app.post('/buy-coins', async (req, res) => {
  try {
    const { email, packageId } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, error: 'User not found' });

    const packages = {
      small: { coins: 100, price: 4.99 },
      medium: { coins: 500, price: 19.99 },
      large: { coins: 1500, price: 49.99 },
      mega: { coins: 5000, price: 149.99 }
    };

    const pkg = packages[packageId];
    if (!pkg) return res.json({ success: false, error: 'Invalid package' });

    user.coins += pkg.coins;
    res.json({ success: true, newCoins: user.coins, added: pkg.coins });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ✅ DEDUCT COINS
app.post('/deduct-coins', async (req, res) => {
  try {
    const { email, amount } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, error: 'User not found' });
    if (user.coins < amount) return res.json({ success: false, error: '❌ Not enough coins!' });
    
    user.coins -= amount;
    res.json({ success: true, remainingCoins: user.coins });
  } catch (err) { res.json({ success: false }); }
});

// ✅ SOCKET.IO VIDEO CALL
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-partner', (userData) => {
    socket.data.user = userData;
    const alreadyWaiting = waitingUsers.findIndex(w => w.email === userData.email);
    if (alreadyWaiting > -1) waitingUsers.splice(alreadyWaiting, 1);

    const partner = waitingUsers.find(w => w.role !== userData.role);
    
    if (partner) {
      waitingUsers.splice(waitingUsers.indexOf(partner), 1);
      const room = 'room-' + Date.now();
      socket.join(room);
      io.to(partner.socketId).socketsJoin(room);
      
      socket.partnerId = partner.socketId;
      io.to(partner.socketId).partnerId = socket.id;
      
      io.to(socket.id).emit('partner-found', { room, partner: partner.username, partnerId: partner.socketId });
      io.to(partner.socketId).emit('partner-found', { room, partner: userData.username, partnerId: socket.id });
    } else {
      waitingUsers.push({ ...userData, socketId: socket.id });
      socket.emit('waiting');
    }
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('next-partner', () => {
    if (socket.partnerId) io.to(socket.partnerId).emit('call-ended');
    waitingUsers.splice(waitingUsers.findIndex(w => w.socketId === socket.id), 1);
  });

  socket.on('end-call', () => {
    if (socket.partnerId) io.to(socket.partnerId).emit('call-ended');
  });

  socket.on('disconnect', () => {
    const wIdx = waitingUsers.findIndex(w => w.socketId === socket.id);
    if (wIdx > -1) waitingUsers.splice(wIdx, 1);
    if (socket.partnerId) io.to(socket.partnerId).emit('call-ended');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
