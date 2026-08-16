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

// ✅ REGISTER — FIXED FOR MALE / FEMALE / ADMIN
app.post('/register', (req, res) => {
  try {
    let { role, username, email, password, adminCode } = req.body;

    console.log('📩 Register attempt:', { role, username, email });

    // Validate all fields
    if (!username || !email || !password) {
      return res.json({ success: false, error: '❌ Please fill all fields' });
    }
    if (password.length < 6) {
      return res.json({ success: false, error: '❌ Password must be at least 6 characters' });
    }
    if (!email.includes('@') || !email.includes('.')) {
      return res.json({ success: false, error: '❌ Please enter a valid email address' });
    }

    // Admin check
    if (role === 'admin') {
      if (adminCode !== ADMIN_CODE) {
        return res.json({ success: false, error: '❌ Wrong Admin Code' });
      }
    }

    // Check if already exists
    const exists = users.find(u => 
      u.email.toLowerCase() === email.toLowerCase() || 
      u.username.toLowerCase() === username.toLowerCase()
    );
    if (exists) {
      return res.json({ success: false, error: '❌ Email or Username already exists' });
    }

    // ✅ Determine role settings
    let coins = 0;
    let isApproved = false;
    let isAdmin = false;

    if (role === 'payer' || role === 'male') {
      coins = 100;
      isApproved = true;
    } else if (role === 'earner' || role === 'female') {
      coins = 0;
      isApproved = false; // Female needs approval
    } else if (role === 'admin') {
      coins = 9999;
      isApproved = true;
      isAdmin = true;
    }

    // ✅ Create new user
    const newUser = {
      id: Date.now().toString(),
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      role: role,
      coins: coins,
      isApproved: isApproved,
      isAdmin: isAdmin
    };

    users.push(newUser);
    console.log('✅ User created:', username, 'Role:', role);
    return res.json({ success: true, message: '✅ Account created successfully!' });

  } catch (e) {
    console.error('❌ Register Error:', e);
    return res.json({ success: false, error: '❌ Server Error — Please try again' });
  }
});

// ✅ LOGIN
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => 
      u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!user) return res.json({ success: false, error: '❌ Wrong Email or Password' });
    if (!user.isApproved) return res.json({ success: false, error: '⏳ Account waiting for approval — check back later' });
    
    return res.json({ 
      success: true, 
      user: { 
        username: user.username, 
        email: user.email, 
        role: user.role, 
        coins: user.coins, 
        isAdmin: user.isAdmin 
      } 
    });
  } catch (e) {
    console.error('❌ Login Error:', e);
    return res.json({ success: false, error: '❌ Login Error' });
  }
});

// ✅ BUY COINS
app.post('/buy-coins', (req, res) => {
  try {
    const { email, pack } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ success: false, error: 'User not found' });
    
    const packs = {
      small: { coins: 100, bonus: 0 },
      medium: { coins: 500, bonus: 50 },
      large: { coins: 1500, bonus: 200 },
      mega: { coins: 5000, bonus: 800 }
    };
    
    const p = packs[pack];
    if (!p) return res.json({ success: false, error: 'Invalid package' });
    
    user.coins += p.coins + p.bonus;
    return res.json({ success: true, coins: user.coins, added: p.coins + p.bonus });
  } catch (e) {
    return res.json({ success: false });
  }
});

// ✅ DEDUCT COINS
app.post('/deduct-coins', (req, res) => {
  try {
    const { email, amount } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.coins < amount) {
      return res.json({ success: false, error: '❌ Not enough coins' });
    }
    user.coins -= amount;
    return res.json({ success: true, coins: user.coins });
  } catch (e) {
    return res.json({ success: false });
  }
});

// ✅ SOCKET.IO VIDEO
io.on('connection', socket => {
  socket.on('find', userData => {
    waiting = waiting.filter(w => w.email !== userData.email);
    const partner = waiting.find(w => w.role !== userData.role);
    
    if (partner) {
      waiting = waiting.filter(w => w.email !== partner.email);
      socket.partner = partner.id;
      io.to(partner.id).partner = socket.id;
      io.to(socket.id).emit('found', { name: partner.username, partnerId: partner.id });
      io.to(partner.id).emit('found', { name: userData.username, partnerId: socket.id });
    } else {
      waiting.push({ ...userData, id: socket.id });
      socket.emit('wait');
    }
  });

  socket.on('signal', d => {
    if (d.to) io.to(d.to).emit('signal', { from: socket.id, s: d.s });
  });

  socket.on('end', () => {
    if (socket.partner) io.to(socket.partner).emit('ended');
  });

  socket.on('disconnect', () => {
    waiting = waiting.filter(w => w.id !== socket.id);
    if (socket.partner) io.to(socket.partner).emit('ended');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ SERVER RUNNING on port ${PORT}`));
