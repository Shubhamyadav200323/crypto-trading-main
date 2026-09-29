const express = require('express');
const { publicRequest } = require('../binance');
const router = express.Router();

// ─── GET /api/market/candles ───────────────────────────────────────────────────
// Returns OHLCV candle data for a symbol
// Query params: symbol (BTCUSDT), interval (1m/5m/15m/1h/4h/1d), limit (max 1000)
router.get('/candles', async (req, res) => {
  try {
    const { symbol = 'BTCUSDT', interval = '1h', limit = 150 } = req.query;

    const raw = await publicRequest('/api/v3/klines', { symbol, interval, limit });

    // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    const candles = raw.map(c => ({
      t:     c[0] / 1000,           // timestamp in seconds
      open:  parseFloat(c[1]),
      high:  parseFloat(c[2]),
      low:   parseFloat(c[3]),
      close: parseFloat(c[4]),
      vol:   parseFloat(c[5])
    }));

    res.json(candles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/market/ticker ────────────────────────────────────────────────────
// Returns current price + 24h change for a symbol
router.get('/ticker', async (req, res) => {
  try {
    const { symbol = 'BTCUSDT' } = req.query;
    const data = await publicRequest('/api/v3/ticker/24hr', { symbol });

    res.json({
      symbol:        data.symbol,
      price:         parseFloat(data.lastPrice),
      change:        parseFloat(data.priceChangePercent),
      high24h:       parseFloat(data.highPrice),
      low24h:        parseFloat(data.lowPrice),
      volume24h:     parseFloat(data.volume),
      quoteVolume:   parseFloat(data.quoteVolume)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/market/all-tickers ──────────────────────────────────────────────
// Returns tickers for all supported pairs at once
router.get('/all-tickers', async (req, res) => {
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];
    const allData = await publicRequest('/api/v3/ticker/24hr');

    const filtered = allData
      .filter(t => symbols.includes(t.symbol))
      .map(t => ({
        symbol:  t.symbol,
        price:   parseFloat(t.lastPrice),
        change:  parseFloat(t.priceChangePercent)
      }));

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
