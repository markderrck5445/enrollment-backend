// test-server.js - Create this file to test basic server functionality
const express = require('express');
const app = express();
const PORT = 5000;

app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});

// Test this with: curl http://localhost:192.168.0.100/test