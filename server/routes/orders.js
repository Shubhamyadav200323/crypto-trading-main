const express  = require('express');
const crypto   = require('crypto');
const axios    = require('axios');
const User     = require('../models/User');
const { decrypt } = require('../encryption');
const authMiddleware = require('../middleware/auth');
const router   = express.Router();

const BASE = 'https://api.binance.com';

async function userSignedRequest(userId, method, path, params = {}) {
  const user = await User.findById(userId);
  if (!user?.hasKeys) throw new Error('No API keys connected. Please add your Binance API keys first.');

  const apiKey    = decrypt(user.binanceKeys.apiKey);
  const secret    = decrypt(user.binanceKeys.secretKey);
  const timestamp = Date.now();
  const allParams = { ...params, timestamp };
  const queryString = new URLSearchParams(allParams).toString();

  const signature = crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');

  const url     = `${BASE}${path}?${queryString}&signature=${signature}`;
  const headers = { 'X-MBX-APIKEY': apiKey };

  if (method === 'GET')    return (await axios.get(url, { headers })).data;
  if (method === 'POST')   return (await axios.post(url, null, { headers })).data;
  if (method === 'DELETE') return (await axios.delete(url, { headers })).data;
}

router.use(authMiddleware);

router.get('/balances', async (req, res) => {
  try {
    const data = await userSignedRequest(req.user.userId, 'GET', '/api/v3/account');
    const balances = data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    res.json(balances);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/place', async (req, res) => {
  try {
    const { symbol, side, type, quantity, price } = req.body;
    const params = { symbol, side, type, quantity };
    if (type === 'LIMIT') { params.price = price; params.timeInForce = 'GTC'; }
    const data = await userSignedRequest(req.user.userId, 'POST', '/api/v3/order', params);
    res.json(data);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/test', async (req, res) => {
  try {
    const { symbol, side, type, quantity, price } = req.body;
    const params = { symbol, side, type, quantity };
    if (type === 'LIMIT') { params.price = price; params.timeInForce = 'GTC'; }
    const data = await userSignedRequest(req.user.userId, 'POST', '/api/v3/order/test', params);
    res.json({ success: true, data });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/open', async (req, res) => {
  try {
    const data = await userSignedRequest(req.user.userId, 'GET', '/api/v3/openOrders', { symbol: req.query.symbol });
    res.json(data);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/cancel', async (req, res) => {
  try {
    const data = await userSignedRequest(req.user.userId, 'DELETE', '/api/v3/order', {
      symbol: req.query.symbol,
      orderId: req.query.orderId
    });
    res.json(data);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;