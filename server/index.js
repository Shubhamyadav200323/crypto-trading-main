require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');
const WebSocket = require('ws');
const axios = require('axios');

const app = express();
app.use(cors({ origin: [
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean) }));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// Routes
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/keys',   require('./routes/keys'));
app.use('/api/market', require('./routes/market'));
app.use('/api/orders', require('./routes/orders'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`✅ REST API + WebSocket running on port ${PORT}`);
});

// WebSocket proxy — shares the HTTP port (Render exposes only one port per service)
const wss = new WebSocket.Server({ server });
const streams = ['btcusdt','ethusdt','solusdt','xrpusdt','bnbusdt'].map(s => `${s}@ticker`).join('/');

let binanceWS;
function connectBinanceWS() {
  binanceWS = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  binanceWS.on('open',    () => console.log('✅ Connected to Binance WebSocket stream'));
  binanceWS.on('message', msg => wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg.toString())));
  binanceWS.on('close',   () => { console.log('⚠️  Reconnecting...'); setTimeout(connectBinanceWS, 5000); });
  binanceWS.on('error',   err => console.error('❌ WS error:', err.message));
}
connectBinanceWS();

wss.on('connection', () => console.log(`🌐 Browser connected (total: ${wss.clients.size})`));
// ML Service proxy
// On Render's free plan the ML service sleeps after 15 min idle. While it wakes up
// Render answers 502/503, so retry for up to ~90s before giving up.
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callML(symbol) {
  const ML_URL = process.env.ML_URL || 'http://localhost:5000';
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const { data } = await axios.get(`${ML_URL}/predict`, { params: { symbol }, timeout: 60000 });
      return data;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const wakingUp = !status || status === 502 || status === 503 || status === 504;
      if (!wakingUp) break;            // real error from the ML service — don't retry
      console.log(`⏳ ML service waking up (attempt ${attempt}, status ${status || err.code})`);
      await sleep(15000);
    }
  }
  throw lastErr;
}

app.get('/api/ml/predict', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'BTC-USD';
    res.json(await callML(symbol));
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    console.error('❌ ML proxy error:', detail);
    res.status(502).json({ error: 'ML service unavailable', detail });
  }
});

// Wake the ML service as soon as this server starts (e.g. after its own cold start)
setTimeout(() => {
  const ML_URL = process.env.ML_URL;
  if (ML_URL) axios.get(`${ML_URL}/health`, { timeout: 90000 }).catch(() => {});
}, 1000);
