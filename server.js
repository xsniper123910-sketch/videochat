const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

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
const SMS_COST_PER_TEXT = 2;
const SMS_EARN_PER_TEXT = 1;
const UNLOCK_MINUTES = 900;

// ✅ ONE-TIME ADMIN CODE
let ADMIN_CODE = "FlitryAdmin2026!";
let adminCodeHasBeenUsed = false;

let users = [];
let onlineUsers = {};
let pairData = {}; // { "email1_email2": { totalMinutes: 0, messages: [] } }
let favorites = {}; // { userEmail: [list of favorite partner emails] }
let blurSettings = {}; // { womanEmail_manEmail: true/false }

// ✅ REGISTER
app.post('/register', (req, res) => {
  const { role, username, email, password, adminCode, passportPhoto, selfiePhoto } = req.body;
  if (!username || !email || !password) return res.json({ success: false, error: 'Fill all fields' });
  if (!email.includes('@')) return res.json({ success: false, error: 'Enter valid email' });
  if (password.length < 6) return res.json({ success: false, error: 'Password min 6 chars' });

  if (role === 'earner') {
    if (!passportPhoto || passportPhoto.length < 100) return res.json({ success: false, error: '⚠️ Upload Passport/ID photo' });
    if (!selfiePhoto || selfiePhoto.length < 100) return res.json({ success: false, error: '⚠️ Upload Selfie photo' });
  }

  if (role === 'admin') {
    if (adminCode !== ADMIN_CODE) return res.json({ success: false, error: '❌ Wrong Admin Code' });
    if (adminCodeHasBeenUsed) return res.json({ success: false, error: '❌ CODE EXPIRED — Only ONE use allowed' });
    adminCodeHasBeenUsed = true;
    ADMIN_CODE = null;
    console.log('🔒 ADMIN CODE USED & LOCKED');
  }

  const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
  if (exists) return res.json({ success: false, error: 'Email or Username exists' });

  let coins = 0, approved = false, isAdmin = false;
  if (role === 'payer') { coins = 100; approved = true; }
  if (role === 'earner') { coins = 0; approved = false; }
  if (role === 'admin') { coins = 9999; approved = true; isAdmin = true; }

  const cleanEmail = email.toLowerCase();
  users.push({
    id: Date.now().toString(),
    username: username.trim(),
    email: cleanEmail,
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

  favorites[cleanEmail] = [];
  return res.json({ success: true, pendingApproval: !approved,
    message: approved ? '✅ Account created!' : '⏳ Waiting admin approval' });
});

// ✅ LOGIN
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) return res.json({ success: false, error: 'Wrong email or password' });
  if (!user.isApproved) return res.json({ success: false, error: '⏳ Account waiting approval' });

  const cleanEmail = user.email.toLowerCase();
  onlineUsers[cleanEmail] = {
    username: user.username, role: user.role, online: true,
    lastSeen: Date.now()
  };
  if (!favorites[cleanEmail]) favorites[cleanEmail] = [];

  return res.json({ success: true, user: {
    username: user.username, email: user.email, role: user.role,
    coins: user.coins, isAdmin: user.isAdmin,
    totalEarned: user.totalEarned || 0, totalCallMinutes: user.totalCallMinutes || 0,
    favorites: favorites[cleanEmail] || []
  }});
});

// ✅ GET ONLINE WOMEN
app.post('/api/online-women', (req, res) => {
  const women = Object.entries(onlineUsers)
    .filter(([email, data]) => data.role === 'earner' && data.online)
    .map(([email, data]) => {
      const fullUser = users.find(u => u.email.toLowerCase() === email);
      return {
        email, username: data.username, selfiePhoto: fullUser?.selfiePhoto || null, online: true
      };
    });
  return res.json({ success: true, women });
});

// ✅ BILL MINUTE + TRACK PAIR TIME
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

  const sorted = [payerEmail.toLowerCase(), earnerEmail.toLowerCase()].sort();
  const pairKey = sorted.join('_');
  if (!pairData[pairKey]) pairData[pairKey] = { totalMinutes: 0, messages: [] };
  pairData[pairKey].totalMinutes += 1;

  res.json({
    success: true, payerCoins: payer.coins, earnerCoins: earner.coins,
    totalMinutesTogether: pairData[pairKey].totalMinutes,
    canText: pairData[pairKey].totalMinutes >= UNLOCK_MINUTES
  });
});

// ✅ CHECK UNLOCK STATUS
app.post('/api/check-sms-unlocked', (req, res) => {
  const { userEmail, partnerEmail } = req.body;
  if (!userEmail || !partnerEmail) return res.json({ success: false });
  const sorted = [userEmail.toLowerCase(), partnerEmail.toLowerCase()].sort();
  const pairKey = sorted.join('_');
  const data = pairData[pairKey] || { totalMinutes: 0, messages: [] };
  res.json({
    success: true, totalMinutes: data.totalMinutes,
    canText: data.totalMinutes >= UNLOCK_MINUTES,
    unlockMinutesRequired: UNLOCK_MINUTES, messages: data.messages.slice(-50)
  });
});

// ✅ SEND SMS
app.post('/api/send-sms', (req, res) => {
  const { fromEmail, toEmail, text } = req.body;
  if (!text || text.trim().length === 0 || text.length > 500) {
    return res.json({ success: false, error: 'Message empty or too long (max 500 chars)' });
  }

  const sorted = [fromEmail.toLowerCase(), toEmail.toLowerCase()].sort();
  const pairKey = sorted.join('_');
  if (!pairData[pairKey]) pairData[pairKey] = { totalMinutes: 0, messages: [] };
  const pair = pairData[pairKey];

  if (pair.totalMinutes < UNLOCK_MINUTES) {
    return res.json({ success: false, error: `🔒 Locked — need ${UNLOCK_MINUTES} min together. Currently: ${pair.totalMinutes} min` });
  }

  const sender = users.find(u => u.email.toLowerCase() === fromEmail.toLowerCase());
  const receiver = users.find(u => u.email.toLowerCase() === toEmail.toLowerCase());
  if (!sender || !receiver) return res.json({ success: false, error: 'User not found' });

  if (sender.coins < SMS_COST_PER_TEXT) {
    return res.json({ success: false, error: `⚠️ Need ${SMS_COST_PER_TEXT} coins. You have ${sender.coins}` });
  }
  sender.coins -= SMS_COST_PER_TEXT;
  receiver.coins += SMS_EARN_PER_TEXT;

  const msg = {
    from: fromEmail.toLowerCase(), to: toEmail.toLowerCase(),
    text: text.trim(), time: new Date().toISOString()
  };
  pair.messages.push(msg);
  if (pair.messages.length > 200) pair.messages.shift();

  console.log(`💬 SMS: ${sender.username} → ${receiver.username} | -${SMS_COST_PER_TEXT} +${SMS_EARN_PER_TEXT}`);
  res.json({ success: true, message: msg, senderCoins: sender.coins, receiverCoins: receiver.coins });
});

// ✅ GET CHAT HUB — ALL WOMEN UNLOCKED
app.post('/api/chat-hub', (req, res) => {
  const { userEmail } = req.body;
  if (!userEmail) return res.json({ success: false });
  const ue = userEmail.toLowerCase();
  const unlocked = [];

  Object.entries(pairData).forEach(([key, data]) => {
    const emails = key.split('_');
    if (emails.includes(ue) && data.totalMinutes >= UNLOCK_MINUTES) {
      const partnerEmail = emails.find(e => e !== ue);
      const partner = users.find(u => u.email.toLowerCase() === partnerEmail);
      if (partner) {
        unlocked.push({
          email: partnerEmail, username: partner.username,
          selfiePhoto: partner.selfiePhoto || null,
          totalMinutes: data.totalMinutes,
          lastMessage: data.messages.length ? data.messages[data.messages.length - 1] : null,
          isFavorite: favorites[ue]?.includes(partnerEmail) || false
        });
      }
    }
  });

  unlocked.sort((a, b) => (b.lastMessage?.time || '').localeCompare(a.lastMessage?.time || ''));
  res.json({ success: true, unlocked });
});

// ✅ FAVORITES — ADD / REMOVE
app.post('/api/favorite', (req, res) => {
  const { userEmail, partnerEmail, action } = req.body;
  const ue = userEmail.toLowerCase();
  const pe = partnerEmail.toLowerCase();
  if (!favorites[ue]) favorites[ue] = [];

  if (action === 'add' && !favorites[ue].includes(pe)) {
    favorites[ue].push(pe);
  } else if (action === 'remove') {
    favorites[ue] = favorites[ue].filter(e => e !== pe);
  }
  res.json({ success: true, favorites: favorites[ue] });
});

// ✅ WOMAN TOGGLES BLUR ON MAN'S CAMERA
app.post('/api/toggle-blur', (req, res) => {
  const { womanEmail, manEmail, enabled } = req.body;
  const we = womanEmail.toLowerCase();
  const me = manEmail.toLowerCase();
  const blurKey = `${we}_${me}`;
  blurSettings[blurKey] = !!enabled;
  console.log(`🫣 BLUR: ${we} → ${me}: ${enabled}`);
  res.json({ success: true, blurred: !!enabled });
});

// ✅ GET BLUR STATUS
app.post('/api/check-blur', (req, res) => {
  const { womanEmail, manEmail } = req.body;
  const key = `${womanEmail.toLowerCase()}_${manEmail.toLowerCase()}`;
  res.json({ success: true, blurred: !!blurSettings[key] });
});

// ✅ ADMIN ENDPOINTS
app.post('/admin/pending', (req, res) => {
  const { adminEmail, adminPassword } = req.body;
  const admin = users.find(u => u.email.toLowerCase() === adminEmail.toLowerCase() && u.password === adminPassword && u.isAdmin);
  if (!admin) return res.json({ success: false, error: 'Unauthorized' });
  const pending = users.filter(u => u.role === 'earner').map(u => ({
    id: u.id, username: u.username, email: u.email,
    passportPhoto: u.passportPhoto, selfiePhoto: u.selfiePhoto,
    isApproved: u.isApproved, totalEarned: u.totalEarned || 0,
    totalCallMinutes: u.totalCallMinutes || 0, registeredAt: u.registeredAt
  }));
  return res.json({ success: true, pending });
});

app.post('/admin/approve', (req, res) => {
  const { adminEmail, adminPassword, userId } = req.body;
  const admin = users.find(u => u.email.toLowerCase() === adminEmail.toLowerCase() && u.password === adminPassword && u.isAdmin);
  if (!admin) return res.json({ success: false, error: 'Unauthorized' });
  const target = users.find(u => u.id === userId);
  if (!target) return res.json({ success: false, error: 'User not found' });
  target.isApproved = true;
  target.coins = 50;
  return res.json({ success: true, username: target.username });
});

app.post('/admin/reject', (req, res) => {
  const { adminEmail, adminPassword, userId } = req.body;
  const admin = users.find(u => u.email.toLowerCase() === adminEmail.toLowerCase() && u.password === adminPassword && u.isAdmin);
  if (!admin) return res.json({ success: false, error: 'Unauthorized' });
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ success: false, error: 'User not found' });
  users.splice(idx, 1);
  return res.json({ success: true, username: '' });
});

// ✅ COINS
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
  socket.on('login-online', data => {
    if (data.email) {
      onlineUsers[data.email.toLowerCase()] = {
        username: data.username, role: data.role, online: true,
        socketId: socket.id, lastSeen: Date.now()
      };
      io.emit('presence-update');
    }
  });

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

  socket.on('disconnect', () => {
    waiting = waiting.filter(w => w.id !== socket.id);
    Object.keys(onlineUsers).forEach(email => {
      if (onlineUsers[email].socketId === socket.id) {
        onlineUsers[email].online = false;
        onlineUsers[email].lastSeen = Date.now();
      }
    });
    io.emit('presence-update');
    if (socket.partner) io.to(socket.partner).emit('ended');
  });
});

const PORT = process.env.PORT || 3000;
console.log(`🔑 ADMIN CODE: ${ADMIN_CODE || '🔒 LOCKED'} | SMS UNLOCK: ${UNLOCK_MINUTES} min | SMS COST: ${SMS_COST_PER_TEXT} → ${SMS_EARN_PER_TEXT}`);
server.listen(PORT, () => console.log(`✅ SERVER RUNNING | Rate: 1/min → 0.50/min earned`));
// WELCOME EMAIL FOR NEW USERS
const nodemailer = require('nodemailer');

app.post('/api/send-welcome-email', async (req, res) => {
  try {
    const { email, username } = req.body;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'your-real-email@gmail.com',   // ← YOUR EMAIL
        pass: 'your-app-password-here'        // ← YOUR GMAIL APP PASSWORD
      }
    });
    await transporter.sendMail({
      from: 'your-real-email@gmail.com',
      to: email,
      subject: 'Welcome to Flitry! ✨',
      html: `<h2>Welcome ${username}!</h2><p>Thanks for joining Flitry!</p>`
    });
    res.json({ success: true });
  } catch (e) {
    console.log('Email error:', e.message);
    res.json({ success: false });
  }
});
