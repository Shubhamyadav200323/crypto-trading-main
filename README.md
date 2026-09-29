# Cryptex — Binance Trading Platform

TradingView-style crypto trading platform connected to Binance.
Built for Indian users — works fully with Binance API.

## Features
- Live candlestick charts (Binance data)
- Technical indicators: Bollinger Bands, EMA 20/50, RSI, MACD
- AI prediction engine (LONG/SHORT/NEUTRAL signals)
- Real order execution via Binance API
- WebSocket live price ticks
- Portfolio balances + open order management

---

## Setup Instructions

### Step 1 — Get Binance API Keys
1. Go to binance.com → Profile → API Management
2. Create API key → enable "Spot Trading"
3. Copy your API Key and Secret Key

### Step 2 — Configure Backend
```
cd server
copy .env file and fill in your keys:
  BINANCE_API_KEY=your_key
  BINANCE_SECRET=your_secret
```

### Step 3 — Install & Run Backend
```bash
cd server
npm install
node index.js
```
You should see:
  ✅ REST API running → http://localhost:3001
  ✅ WebSocket proxy running → ws://localhost:3002
  ✅ Connected to Binance WebSocket stream

### Step 4 — Install & Run Frontend
Open a second terminal:
```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173

---

## Project Structure
```
crypto-trading/
├── server/
│   ├── index.js          ← Express server + WebSocket proxy
│   ├── binance.js        ← Request signing utility
│   ├── .env              ← Your API keys (never commit this)
│   └── routes/
│       ├── market.js     ← Candles, ticker endpoints
│       └── orders.js     ← Place, cancel, list orders
└── client/
    ├── src/
    │   ├── App.jsx       ← Main trading UI
    │   ├── api.js        ← Backend API calls
    │   ├── indicators.js ← RSI, MACD, BB, EMA calculations
    │   └── main.jsx      ← React entry point
    ├── index.html
    └── vite.config.js    ← Dev server + proxy config
```

---

## Testing Without Real Money
Use the "test order" button — it validates your order against
Binance without placing it. When you're confident, use the
real order button.

---

## Indian Tax Note
Crypto gains are taxed at 30% flat in India.
Keep records of all trades for ITR filing.
