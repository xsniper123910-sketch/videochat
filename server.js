const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_CODE = "FlitryAdmin2026!";
let users = [];
let waiting = [];

// ✅ REGISTER ENDPOINT — PERFECTLY MATCHED
app.post('/register', (req, res) => {
  console.log('📩 Register received:', req.body);
  
  const { role, username, email, password, adminCode } = req.body;

  // Validate
  if (!username || !email || !password) {
    return res.json({ success: false, error: 'Please fill all fields' });
  }
  if (!email.includes('@') || !email.includes('.')) {
    return res.json({ success: false, error: 'Please enter a valid email address' });
  }
  if (password.length < 6) {
    return res.json({ success: false, error: 'Password must be at least 6 characters' });
  }

  // Check exists
  const exists = users.find(u => 
    u.email.toLowerCase() === email.toLowerCase() || 
    u.username.toLowerCase() === username.toLowerCase()
  );
  if (exists) {
    return res.json({ success: false, error: 'Email or Username already registered' });
  }

  // Admin check
  if (role === 'admin' && adminCode !== ADMIN_CODE) {
    return res.json({ success: false, error: 'Incorrect Admin Code' });
  }

  // Set permissions
  let coins = 0, isApproved = false, isAdmin = false;
  
  if (role === 'payer') {
    coins = 100;
    isApproved = true;
  } else if (role === 'earner') {
    coins = 0;
    isApproved = false; // needs manual approval
  } else if (role === 'admin') {
    coins = 9999;
    isApproved = true;
    isAdmin = true;
  }

  // Create user
  const newUser = {
    id: Date.now().toString(),
    username: username.trim(),
    email: email.toLowerCase().trim(),
    password: password,
    role,
    coins,
    isApproved,
    isAdmin
  };

  users.push(newUser);
  console.log('✅ User created:', username, 'Role:', role);
  return res.json({ success: true, message: 'Account created successfully!' });
});

// ✅ LOGIN
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => 
    u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) return res.json({ success: false, error: 'Email or Password incorrect' });
  if (!user.isApproved) return res.json({ success: false, error: 'Account waiting for approval' });
  
  return res.json({ success: true, user: {
    username: user.username,
    email: user.email,
    role: user.role,
    coins: user.coins,
    isAdmin: user.isAdmin
  }});
});

// ✅ BUY COINS
app.post('/buy-coins', (req, res) => {
  const { email, pack } = req.body;
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.json({ success: false });
  
  const packs = {
    small: { coins: 100, bonus: 0 },
    medium: { coins: 500, bonus: 50 },
    large: { coins: 1500, bonus: 200 },
    mega: { coins: 5000, bonus: 800 }
  };
  const p = packs[pack];
  if (!p) return res.json({ success: false });
  
  user.coins += p.coins + p.bonus;
  return res.json({ success: true, coins: user.coins, added: p.coins + p.bonus });
});

// ✅ DEDUCT COINS
app.post('/deduct-coins', (req, res) => {
  const { email, amount } = req.body;
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.coins < amount) return res.json({ success: false });
  user.coins -= amount;
  return res.json({ success: true, coins: user.coins });
});

// ✅ SOCKET.IO
io.on('connection', socket => {
  socket.on('find', userData => {
    waiting = waiting.filter(w => w.id !== socket.id);
    const partner = waiting.find(w => w.role !== userData.role);
    if (partner) {
      waiting = waiting.filter(w => w.id !== partner.id);
      socket.partner = partner.id;
      io.to(partner.id).partner = socket.id;
      io.to(socket.id).emit('found', { name: partner.username, partnerId: partner.id });
      io.to(partner.id).emit('found', { name: userData.username, partnerId: socket.id });
    } else {
      waiting.push({ ...userData, id: socket.id });
      socket.emit('wait');
    }
  });
  socket.on('signal', d => { if (d.to) io.to(d.to).emit('signal', { from: socket.id, s: d.s }); });
  socket.on('end', () => { if (socket.partner) io.to(socket.partner).emit('ended'); });
  socket.on('disconnect', () => { waiting = waiting.filter(w => w.id !== socket.id); if (socket.partner) io.to(socket.partner).emit('ended'); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ SERVER RUNNING on port ${PORT}`));
