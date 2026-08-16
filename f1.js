// User storage (replace with your database in production)
const users = [];

// REGISTER ENDPOINT
app.post('/register', async (req, res) => {
  try {
    const { role, username, email, password, fullName, address, city, country, idPhoto, selfie, proofOfResidence } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.json({ success: false, error: 'Missing required fields' });
    }
    if (password.length < 6) {
      return res.json({ success: false, error: 'Password must be at least 6 characters' });
    }
    if (!email.includes('@')) {
      return res.json({ success: false, error: 'Enter a valid email address' });
    }

    // Check if user already exists
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase() || u.username?.toLowerCase() === username.toLowerCase());
    if (existing) {
      return res.json({ success: false, error: 'Email or username already registered' });
    }

    // Create user
    const user = {
      id: Date.now().toString(),
      username: username,
      email: email.toLowerCase(),
      password: password, // In production: hash this! bcrypt.hash(password, 10)
      role: role, // 'payer' = Man, 'earner' = Woman, 'admin' = Admin
      fullName: fullName || null,
      address: address || null,
      city: city || null,
      country: country || null,
      idPhoto: idPhoto || null,
      selfie: selfie || null,
      proofOfResidence: proofOfResidence || null,
      isApproved: role === 'payer' || role === 'admin' ? true : false, // Men & Admin auto-approved
      isAdmin: role === 'admin' ? true : false,
      createdAt: new Date().toISOString()
    };

    users.push(user);

    // Return token & user info
    res.json({
      success: true,
      token: user.id + ':' + user.email, // Simple token — replace with JWT in production
      role: user.role,
      isAdmin: user.isAdmin,
      message: role === 'earner' ? 'Registered! Waiting for approval.' : 'Account created successfully!'
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.json({ success: false, error: 'Server error: ' + err.message });
  }
});

// SIMPLE LOGIN ENDPOINT
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (!user) {
      return res.json({ success: false, error: 'Email or password incorrect' });
    }
    if (!user.isApproved) {
      return res.json({ success: false, error: 'Account not approved yet. Wait for admin approval.' });
    }

    res.json({
      success: true,
      token: user.id + ':' + user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      username: user.username
    });
  } catch (err) {
    res.json({ success: false, error: 'Login error: ' + err.message });
  }
});
