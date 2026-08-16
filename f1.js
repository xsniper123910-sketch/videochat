{
  "name": "video-chat-platform",
  "version": "1.0.0",
  "description": "Video calling platform with payments & Bitcoin payouts",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "axios": "^1.7.9",
    "bcryptjs": "^2.4.3",
    "bitcoinjs-lib": "^6.1.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.9.5",
    "node-cron": "^3.0.3",
    "stripe": "^17.5.0"
  },
  "engines": {
    "node": "20.x"
  }
}