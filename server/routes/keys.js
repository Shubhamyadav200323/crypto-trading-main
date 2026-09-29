const express    = require('express');
const axios      = require('axios');
const crypto     = require('crypto');
const User       = require('../models/User');
const { encrypt, decrypt } = require('../encryption');
const authMiddleware = require('../middleware/auth');
const router     = express.Router();

router.post('/save', authMiddleware, async (req, res) => {
  try {
    const { apiKey, secretKey } = req.body;
    if (!apiKey || !secretKey) return res.status(400).json({ error: 'Both API key and secret required' });

    // Test keys against Binance before saving
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(queryString)
      .digest('hex');

    await axios.get(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );

    // Encrypt and save
    await User.findByIdAndUpdate(req.user.userId, {
      'binanceKeys.apiKey':    encrypt(apiKey),
      'binanceKeys.secretKey': encrypt(secretKey),
      hasKeys: true
    });

    res.json({ success: true, message: 'API keys saved and verified' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid API keys or insufficient permissions' });
  }
});

router.delete('/remove', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      'binanceKeys.apiKey':    null,
      'binanceKeys.secretKey': null,
      hasKeys: false
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    res.json({ hasKeys: user.hasKeys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;