const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Simple in-memory "database"
const users = {}; // { email: { username, email, password, role, coins, online } }

// Serve pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

// Register
app.post('/register', (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (users[email]) {
      return res.json({ success: false, error: 'Email already registered' });
    }
    users[email] = {
      username,
      email,
      password,
      role, // 'payer' = male, 'earner' = female
      coins: role === 'payer' ? 100 : 0, // Give new male users 100 free coins
      online: false
    };
    console.log('✅ Registered:', username, 'as', role);
    res.json({ success: true });
  } catch (err) {
    console.log('Register error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Login
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users[email];
    if (!user || user.password !== password) {
      return res.json({ success: false, error: 'Wrong email or password' });
    }
    user.online = true;
    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        coins: user.coins
      }
    });
  } catch (err) {
    console.log('Login error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Buy Coins
app.post('/buy-coins', (req, res) => {
  try {
    const { email, pack } = req.body;
    const user = users[email];
    if (!user) return res.json({ success: false, error: 'User not found' });

    const packs = {
      small: { coins: 100, price: 4.99 },
      medium: { coins: 550, price: 19.99 },
      large: { coins: 1700, price: 49.99 },
      mega: { coins: 5800, price: 149.99 }
    };

    const selected = packs[pack];
    if (!selected) return res.json({ success: false, error: 'Invalid pack' });

    user.coins += selected.coins;
    console.log(`💰 ${user.username} bought ${selected.coins} coins — total: ${user.coins}`);
    res.json({ success: true, newCoinCount: user.coins, added: selected.coins });
  } catch (err) {
    console.log('Buy coins error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Socket.io connections
io.on('connection', (socket) => {
  console.log('🔌 User connected');

  socket.on('login-online', (data) => {
    socket.email = data.email;
    socket.username = data.username;
    socket.role = data.role;
    if (users[data.email]) users[data.email].online = true;
    console.log(`✅ ${data.username} logged in (${data.role})`);
  });

  socket.on('find-partner', (data) => {
    // Simple match logic
    const lookingFor = data.role === 'payer' ? 'earner' : 'payer';
    let found = null;
    for (const email in users) {
      if (users[email].role === lookingFor && users[email].online) {
        found = users[email];
        break;
      }
    }
    if (found) {
      socket.emit('partner-found', {
        partnerId: found.email,
        email: found.email,
        name: found.username
      });
    } else {
      socket.emit('wait');
    }
  });

  socket.on('disconnect', () => {
    if (socket.email && users[socket.email]) {
      users[socket.email].online = false;
    }
    console.log('🔌 User disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
