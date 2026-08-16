const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ✅ CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 💰 RATES
const RATE_COST_PER_MINUTE = 1;
const RATE_EARN_PER_MINUTE = 0.50;

// ✅ ONE-TIME ADMIN CODE — CAN BE USED ONLY ONCE!
let ADMIN_CODE = "FlitryAdmin2026!";
let adminCodeHasBeenUsed = false; // Locks after first use

let users = [];
let activeCalls = {};

// ✅ REGISTER — WITH ONE-TIME ADMIN CODE
app.post('/register', (req, res) => {
  const { role, username, email, password, adminCode, passportPhoto, selfiePhoto } = req.body;

  if (!username || !email || !password) {
    return res.json({ success: false, error: 'Fill all fields' });
  }
  if (!email.includes('@')) {
    return res.json({ success: false, error: 'Enter valid email' });
  }
  if (password.length < 6) {
    return res.json({ success: false, error: 'Password min 6 chars' });
  }

  // ✅ FEMALE MUST UPLOAD ID + SELFIE
  if (role === 'earner') {
    if (!passportPhoto || passportPhoto.length < 100) {
      return res.json({ success: false, error: '⚠️ Please upload Passport/ID photo' });
    }
    if (!selfiePhoto || selfiePhoto.length < 100) {
      return res.json({ success: false, error: '⚠️ Please upload Selfie photo' });
    }
  }

  // ✅ ADMIN CODE CHECK — ONE-TIME USE ONLY!
  if (role === 'admin') {
    if (adminCode !== ADMIN_CODE) {
      return res.json({ success: false, error: '❌ Wrong Admin Code' });
    }
    if (adminCodeHasBeenUsed) {
      return res.json({ success: false, error: '❌ CODE EXPIRED — This code can only be used ONCE! Contact developer for a new code.' });
    }
    // ✅ LOCK THE CODE — CANNOT BE USED AGAIN!
    adminCodeHasBeenUsed = true;
    ADMIN_CODE = null; // Destroy the code forever
    console.log('🔒 ADMIN CODE USED — NOW LOCKED FOREVER!');
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
    isAdmin,
    passportPhoto: passportPhoto || null,
    selfiePhoto: selfiePhoto || null,
    totalEarned: 0,
    totalCallMinutes: 0,
    registeredAt: new Date().toISOString()
  });

  console.log('✅ CREATED:', username, '| Approved:', approved ? 'YES ✅' : 'PENDING ⏳');
  return res.json({ 
    success: true, 
    pendingApproval: !approved,
    message: approved ? '✅ Admin created! Code is now LOCKED.' : '⏳ Account created — waiting for admin approval.'
  });
});

// ✅ LOGIN
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => 
    u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) return res.json({ success: false, error: 'Wrong email or password' });
  if (!user.isApproved) return res.json({ success: false, error: '⏳ Account waiting admin approval — check back soon!' });
  return res.json({ success: true, user: {
    username: user.username,
    email: user.email,
    role: user.role,
    coins: user.coins,
    isAdmin: user.isAdmin,
    totalEarned: user.totalEarned || 0,
    totalCallMinutes: user.totalCallMinutes || 0
  }});
});

// ✅ CALL BILLING
app.post('/call/bill-minute', (req, res) => {
  const { payerEmail, earnerEmail } = req.body;
  const payer = users.find(u => u.email.toLowerCase() === payerEmail.toLowerCase());
  const earner = users.find(u => u.email.toLowerCase() === earnerEmail.toLowerCase());

  if (!payer || !earner) return res.json({ success: false, error: 'User not found' });
  if (payer.coins < RATE_COST_PER_MINUTE) {
    return res.json({ success: false, error: '⚠️ Insufficient coins — Call ended!', outOfCoins: true });
  }

  payer.coins -= RATE_COST_PER_MINUTE;
  earner.coins += RATE_EARN_PER_MINUTE;
  earner.totalEarned = (earner.totalEarned || 0) + RATE_EARN_PER_MINUTE;
  earner.totalCallMinutes = (earner.totalCallMinutes || 0) + 1;

  console.log(`💰 BILLED: ${payer.username} -1 | ${earner.username} +0.50`);
  res.json({ success: true, payerCoins: payer.coins, earnerCoins: earner.coins });
});

// ✅ ADMIN: GET ALL USERS
app.post('/admin/pending', (req, res) => {
  const { adminEmail, adminPassword } = req.body;
  const admin = users.find(u => 
    u.email.toLowerCase() === adminEmail.toLowerCase() && 
    u.password === adminPassword && 
    u.isAdmin
  );
  if (!admin) return res.json({ success: false, error: 'Unauthorized' });
  const pending = users.filter(u => u.role === 'earner').map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    passportPhoto: u.passportPhoto,
    selfiePhoto: u.selfiePhoto,
    isApproved: u.isApproved,
    totalEarned: u.totalEarned || 0,
    totalCallMinutes: u.totalCallMinutes || 0,
    registeredAt: u.registeredAt
  }));
  return res.json({ success: true, pending });
});

// ✅ ADMIN: APPROVE
app.post('/admin/approve', (req, res) => {
  const { adminEmail, adminPassword, userId } = req.body;
  const admin = users.find(u => 
    u.email.toLowerCase() === adminEmail.toLowerCase() && 
    u.password === adminPassword && 
    u.isAdmin
  );
  if (!admin) return res.json({ success: false, error: 'Unauthorized' });
  const target = users.find(u => u.id === userId);
  if (!target) return res.json({ success: false, error: 'User not found' });
  target.isApproved = true;
  target.coins = 50;
  console.log('✅ APPROVED:', target.username);
  return res.json({ success: true, username: target.username });
});

// ✅ ADMIN: REJECT
app.post('/admin/reject', (req, res) => {
  const { adminEmail, adminPassword, userId } = req.body;
  const admin = users.find(u => 
    u.email.toLowerCase() === adminEmail.toLowerCase() && 
    u.password === adminPassword && 
    u.isAdmin
  );
  if (!admin) return res.json({ success: false, error: 'Unauthorized' });
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ success: false, error: 'User not found' });
  const name = users[idx].username;
  users.splice(idx, 1);
  console.log('❌ REJECTED:', name);
  return res.json({ success: true, username: name });
});

// ✅ COINS & PURCHASE
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
      io.to(socket.id).emit('found', { 
        name: partner.username, partnerId: partner.id,
        partnerEmail: partner.email, partnerRole: partner.role
      });
      io.to(partner.id).emit('found', { 
        name: data.username, partnerId: socket.id,
        partnerEmail: data.email, partnerRole: data.role
      });
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
console.log(`🔑 CURRENT ADMIN CODE: ${ADMIN_CODE || '🔒 LOCKED — ALREADY USED'}`);
server.listen(PORT, () => console.log(`✅ SERVER RUNNING PORT ${PORT} | RATE: 1/min → 0.50/min earned`));
