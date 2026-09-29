import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCandles, placeOrder, testOrder, fetchBalances, fetchOpenOrders, cancelOrder, signup, login, saveKeys, removeKeys, fetchMLPrediction } from './api.js';
import { calcBB, calcEMA, calcRSI, calcMACD, generatePrediction } from './indicators.js';

const PAIRS     = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];
const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];
const PAIR_LABELS = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL', XRPUSDT: 'XRP', BNBUSDT: 'BNB' };

const C = {
  up: '#26a69a', down: '#ef5350', grid: 'rgba(255,255,255,0.04)',
  text: '#d1d4dc', muted: '#787b86', bg: '#131722', panel: '#1e222d',
  border: '#2a2e39', accent: '#2962ff', warn: '#ff9800'
};

// ─── Chart Components (unchanged) ─────────────────────────────────────────────
function CandleChart({ candles, bb, ema20, ema50, showBB, showEMA, width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !candles.length) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);
    const pad = { top: 16, right: 64, bottom: 28, left: 8 };
    const cW = width - pad.left - pad.right;
    const cH = height - pad.top - pad.bottom;
    const prices = candles.flatMap(c => [c.high, c.low]);
    const bbVals = showBB ? bb.flatMap(b => b.upper && b.lower ? [b.upper, b.lower] : []) : [];
    const allP = [...prices, ...bbVals].filter(Boolean);
    const minP = Math.min(...allP) * 0.9985;
    const maxP = Math.max(...allP) * 1.0015;
    const pRange = maxP - minP;
    const toY = p => pad.top + cH - ((p - minP) / pRange) * cH;
    const barW = Math.max(1, Math.floor(cW / candles.length) - 1);
    const toX = i => pad.left + (i / candles.length) * cW + barW / 2;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (cH / 5) * i;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      const p = maxP - (pRange / 5) * i;
      ctx.fillStyle = C.muted; ctx.font = '10px Roboto Mono'; ctx.textAlign = 'left';
      ctx.fillText(p > 100 ? p.toFixed(0) : p.toFixed(4), width - pad.right + 4, y + 3);
    }
    if (showBB) {
      ['upper', 'mid', 'lower'].forEach(key => {
        ctx.beginPath(); ctx.strokeStyle = 'rgba(66,133,244,0.45)'; ctx.lineWidth = 1;
        bb.forEach((b, i) => {
          if (!b[key]) return;
          (i === 0 || !bb[i-1][key]) ? ctx.moveTo(toX(i), toY(b[key])) : ctx.lineTo(toX(i), toY(b[key]));
        });
        ctx.stroke();
      });
    }
    if (showEMA) {
      [[ema20, '#ff9800'], [ema50, '#9c27b0']].forEach(([ema, color]) => {
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
        ema.forEach((v, i) => {
          if (!v) return;
          (i === 0 || !ema[i-1]) ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
        });
        ctx.stroke();
      });
    }
    candles.forEach((c, i) => {
      const x = toX(i);
      const isUp = c.close >= c.open;
      ctx.strokeStyle = isUp ? C.up : C.down;
      ctx.fillStyle = isUp ? C.up : C.down;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
      const bodyH = Math.max(1, Math.abs(toY(c.close) - toY(c.open)));
      ctx.fillRect(x - barW / 2, Math.min(toY(c.open), toY(c.close)), barW, bodyH);
    });
    const step = Math.floor(candles.length / 6);
    candles.forEach((c, i) => {
      if (i % step !== 0) return;
      const d = new Date(c.t * 1000);
      const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = C.muted; ctx.font = '9px Roboto Mono'; ctx.textAlign = 'center';
      ctx.fillText(label, toX(i), height - pad.bottom + 14);
    });
  }, [candles, bb, ema20, ema50, showBB, showEMA, width, height]);
  return <canvas ref={ref} style={{ display: 'block' }} />;
}

function RSIChart({ rsi, width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !rsi.length) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);
    const pad = { top: 6, right: 64, bottom: 16, left: 8 };
    const cW = width - pad.left - pad.right;
    const cH = height - pad.top - pad.bottom;
    const toY = v => pad.top + cH - ((v - 0) / 100) * cH;
    const toX = i => pad.left + (i / rsi.length) * cW;
    ctx.fillStyle = 'rgba(239,83,80,0.07)';
    ctx.fillRect(pad.left, toY(70), cW, toY(100) - toY(70));
    ctx.fillStyle = 'rgba(38,166,154,0.07)';
    ctx.fillRect(pad.left, toY(30), cW, toY(70) - toY(30));
    [30, 50, 70].forEach(v => {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.left, toY(v)); ctx.lineTo(width - pad.right, toY(v)); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = '9px Roboto Mono'; ctx.textAlign = 'left';
      ctx.fillText(v, width - pad.right + 4, toY(v) + 3);
    });
    ctx.beginPath(); ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 1.5;
    rsi.forEach((v, i) => {
      if (v === null) return;
      (i === 0 || rsi[i-1] === null) ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
    });
    ctx.stroke();
    const last = rsi.filter(Boolean).at(-1);
    if (last) {
      ctx.fillStyle = last > 70 ? C.down : last < 30 ? C.up : C.muted;
      ctx.font = '10px Roboto Mono'; ctx.textAlign = 'right';
      ctx.fillText(`RSI ${last.toFixed(1)}`, width - pad.right - 2, pad.top + 12);
    }
  }, [rsi, width, height]);
  return <canvas ref={ref} style={{ display: 'block' }} />;
}

function MACDChart({ macd, width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !macd?.histogram?.length) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);
    const pad = { top: 6, right: 64, bottom: 16, left: 8 };
    const cW = width - pad.left - pad.right;
    const cH = height - pad.top - pad.bottom;
    const all = [...macd.histogram, ...macd.macdLine, ...macd.signal].filter(v => v !== null);
    if (!all.length) return;
    const min = Math.min(...all) * 1.15;
    const max = Math.max(...all) * 1.15;
    const toY = v => pad.top + cH - ((v - min) / (max - min)) * cH;
    const toX = i => pad.left + (i / macd.histogram.length) * cW;
    const barW = Math.max(1, Math.floor(cW / macd.histogram.length) - 1);
    const zeroY = toY(0);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(width - pad.right, zeroY); ctx.stroke();
    macd.histogram.forEach((v, i) => {
      if (v === null) return;
      ctx.fillStyle = v >= 0 ? 'rgba(38,166,154,0.65)' : 'rgba(239,83,80,0.65)';
      const y = Math.min(zeroY, toY(v));
      ctx.fillRect(toX(i) - barW / 2, y, barW, Math.max(1, Math.abs(zeroY - toY(v))));
    });
    [[macd.macdLine, C.accent], [macd.signal, '#ff6b6b']].forEach(([line, color]) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      line.forEach((v, i) => {
        if (v === null) return;
        (i === 0 || line[i-1] === null) ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
      });
      ctx.stroke();
    });
    ctx.fillStyle = C.muted; ctx.font = '9px Roboto Mono'; ctx.textAlign = 'left';
    ctx.fillText('MACD', width - pad.right + 4, pad.top + 10);
  }, [macd, width, height]);
  return <canvas ref={ref} style={{ display: 'block' }} />;
}

// ─── Login / Signup Screen ─────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode]       = useState('login'); // 'login' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handle = async () => {
    if (!email || !password) { setError('Please enter email and password'); return; }
    setLoading(true); setError(null);
    try {
      const data = mode === 'login' ? await login(email, password) : await signup(email, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('email', data.email);
      onAuth({ token: data.token, email: data.email, hasKeys: data.hasKeys });
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const inp = { width: '100%', background: '#0f1117', border: `1px solid ${C.border}`, color: C.text, padding: '10px 12px', borderRadius: 6, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Roboto Mono', monospace" }}>
      <div style={{ width: 380, background: C.panel, borderRadius: 12, border: `1px solid ${C.border}`, padding: 36 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, color: C.accent, fontWeight: 700, letterSpacing: 2 }}>◈ CRYPTEX</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>Binance Trading Platform</div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', background: '#0f1117', borderRadius: 6, padding: 3, marginBottom: 24 }}>
          {['login', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); }}
              style={{ flex: 1, background: mode === m ? C.panel : 'transparent', color: mode === m ? C.text : C.muted, border: 'none', borderRadius: 4, padding: '7px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textTransform: 'capitalize', fontWeight: mode === m ? 600 : 400 }}>
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 6, letterSpacing: 0.5 }}>EMAIL</div>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" type="email" style={inp}
              onKeyDown={e => e.key === 'Enter' && handle()} />
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 6, letterSpacing: 0.5 }}>PASSWORD</div>
            <input value={password} onChange={e => setPass(e.target.value)} placeholder="min 6 characters" type="password" style={inp}
              onKeyDown={e => e.key === 'Enter' && handle()} />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,83,80,0.1)', border: `1px solid ${C.down}`, borderRadius: 6, padding: '8px 12px', color: C.down, fontSize: 11 }}>
              {error}
            </div>
          )}

          <button onClick={handle} disabled={loading}
            style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '11px 0', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, color: C.muted, fontSize: 11 }}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
            style={{ color: C.accent, cursor: 'pointer' }}>
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Connect Binance Keys Screen ───────────────────────────────────────────────
function ConnectKeysScreen({ token, email, onConnected, onSkip }) {
  const [apiKey, setApiKey]   = useState('');
  const [secret, setSecret]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(false);

  const handle = async () => {
    if (!apiKey || !secret) { setError('Please enter both API key and secret key'); return; }
    setLoading(true); setError(null);
    try {
      await saveKeys(apiKey, secret, token);
      setSuccess(true);
      setTimeout(() => onConnected(), 1500);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const inp = { width: '100%', background: '#0f1117', border: `1px solid ${C.border}`, color: C.text, padding: '10px 12px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Roboto Mono', monospace" }}>
      <div style={{ width: 460, background: C.panel, borderRadius: 12, border: `1px solid ${C.border}`, padding: 36 }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, color: C.accent, fontWeight: 700, letterSpacing: 2 }}>◈ CRYPTEX</div>
          <div style={{ color: C.text, fontSize: 14, marginTop: 8, fontWeight: 600 }}>Connect Your Binance Account</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Signed in as {email}</div>
        </div>

        {/* How to get keys */}
        <div style={{ background: '#0f1117', borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 11 }}>
          <div style={{ color: C.warn, fontWeight: 600, marginBottom: 10 }}>How to get your Binance API keys:</div>
          {[
            '1. Go to binance.com → Profile → API Management',
            '2. Click "Create API" → System Generated',
            '3. Enable: ✅ Read Info  ✅ Spot Trading',
            '4. Disable: ❌ Withdrawals (keep this OFF)',
            '5. Copy API Key and Secret Key below'
          ].map((step, i) => (
            <div key={i} style={{ color: C.muted, marginBottom: 5 }}>{step}</div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 6, letterSpacing: 0.5 }}>BINANCE API KEY</div>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your API key here" style={inp} />
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 6, letterSpacing: 0.5 }}>BINANCE SECRET KEY</div>
            <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste your secret key here" type="password" style={inp} />
          </div>

          {/* Security note */}
          <div style={{ background: 'rgba(38,166,154,0.08)', border: `1px solid rgba(38,166,154,0.3)`, borderRadius: 6, padding: '8px 12px', fontSize: 10, color: C.up }}>
            🔒 Your keys are encrypted with AES-256 before being stored. We never store plain text keys and never have withdrawal access.
          </div>

          {error && (
            <div style={{ background: 'rgba(239,83,80,0.1)', border: `1px solid ${C.down}`, borderRadius: 6, padding: '8px 12px', color: C.down, fontSize: 11 }}>
              ❌ {error}
            </div>
          )}

          {success && (
            <div style={{ background: 'rgba(38,166,154,0.1)', border: `1px solid ${C.up}`, borderRadius: 6, padding: '8px 12px', color: C.up, fontSize: 11 }}>
              ✅ Keys verified and connected! Loading your account…
            </div>
          )}

          <button onClick={handle} disabled={loading || success}
            style={{ background: C.up, color: '#fff', border: 'none', borderRadius: 6, padding: '11px 0', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Verifying keys with Binance…' : '🔗 Connect Binance Account'}
          </button>

          <button onClick={onSkip}
            style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, padding: '9px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>
            Skip for now — view charts only
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Trading Platform ─────────────────────────────────────────────────────
function TradingPlatform({ token, email, hasKeys, onLogout, onConnectKeys }) {
  const [pair, setPair]         = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [candles, setCandles]   = useState([]);
  const [tickers, setTickers]   = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [showBB, setShowBB]     = useState(true);
  const [showEMA, setShowEMA]   = useState(true);
  const [balances, setBalances] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [side, setSide]         = useState('BUY');
  const [orderType, setType]    = useState('MARKET');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitP] = useState('');
  const [orderStatus, setStatus] = useState(null);
  const [orderLoading, setOL]   = useState(false);
  const [tab, setTab]           = useState('prediction');
  const [mlPrediction, setMlPrediction] = useState(null);
  const [dims, setDims]         = useState({ w: 860, h: 380 });
  const [showUserMenu, setUserMenu] = useState(false);
  const containerRef            = useRef(null);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setDims({ w: Math.floor(e.contentRect.width), h: 380 });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const loadCandles = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchCandles(pair, interval, 150);
      setCandles(data);
    } catch (e) {
      setError('Could not fetch candles');
    } finally { setLoading(false); }
  }, [pair, interval]);
  const [mlStatus, setMlStatus] = useState('loading'); // loading | ok | error
  const loadMLPrediction = useCallback(async () => {
    try {
      const data = await fetchMLPrediction(pair);
      setMlPrediction(data);
      setMlStatus('ok');
    } catch (_) {
      setMlStatus(prev => (prev === 'ok' ? 'ok' : 'error'));
    }
  }, [pair]);

  // Load now, then refresh every 60s (also retries if the free-tier ML service was asleep)
  useEffect(() => {
    setMlPrediction(null);
    setMlStatus('loading');
    loadMLPrediction();
    const t = setInterval(loadMLPrediction, 60000);
    return () => clearInterval(t);
  }, [loadMLPrediction]);


  useEffect(() => { loadCandles(); }, [loadCandles]);

  useEffect(() => {
    const t = setInterval(loadCandles, 60000);
    return () => clearInterval(t);
  }, [loadCandles]);

  // WebSocket live prices
  useEffect(() => {
    const wsBase = `wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker/xrpusdt@ticker/bnbusdt@ticker`;
    const ws = new WebSocket(wsBase);
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        const tick = msg.data;
        if (tick?.s) {
          setTickers(prev => ({ ...prev, [tick.s]: { price: parseFloat(tick.c), change: parseFloat(tick.P) } }));
          if (tick.s === pair) {
            setCandles(prev => {
              if (!prev.length) return prev;
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], close: parseFloat(tick.c) };
              return updated;
            });
          }
        }
      } catch (_) {}
    };
    return () => ws.close();
  }, [pair]);

  // Load account data (only if has keys)
  const loadAccountData = useCallback(async () => {
    if (!hasKeys || !token) return;
    try {
      const [bal, orders] = await Promise.all([
        fetchBalances(token),
        fetchOpenOrders(pair, token)
      ]);
      setBalances(bal);
      setOpenOrders(orders);
    } catch (_) {}
  }, [pair, token, hasKeys]);

  useEffect(() => { loadAccountData(); }, [loadAccountData]);

  const bb    = candles.length ? calcBB(candles) : [];
  const ema20 = candles.length ? calcEMA(candles, 20) : [];
  const ema50 = candles.length ? calcEMA(candles, 50) : [];
  const rsi   = candles.length ? calcRSI(candles) : [];
  const macd  = candles.length ? calcMACD(candles) : { macdLine: [], signal: [], histogram: [] };
  const prediction = candles.length ? generatePrediction(candles, bb, rsi, macd) : null;

  const curTicker = tickers[pair];
  const curPrice  = curTicker?.price || candles.at(-1)?.close || 0;
  const change24  = curTicker?.change || 0;

  const handleOrder = async (isTest = false) => {
    if (!hasKeys) { setStatus({ type: 'error', msg: 'Connect your Binance API keys first to place orders' }); return; }
    if (!quantity || parseFloat(quantity) <= 0) { setStatus({ type: 'error', msg: 'Enter a valid quantity' }); return; }
    if (orderType === 'LIMIT' && !limitPrice) { setStatus({ type: 'error', msg: 'Enter a limit price' }); return; }
    setOL(true); setStatus(null);
    try {
      const params = { symbol: pair, side, type: orderType, quantity, price: limitPrice || undefined };
      const result = isTest ? await testOrder(params, token) : await placeOrder(params, token);
      setStatus({ type: 'success', msg: isTest ? 'Order valid ✓ ready to place' : `Order placed! ID: ${result.orderId}` });
      if (!isTest) { setQuantity(''); setLimitP(''); loadAccountData(); }
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally { setOL(false); }
  };

  const handleCancel = async (symbol, orderId) => {
    try { await cancelOrder(symbol, orderId, token); loadAccountData(); }
    catch (e) { alert('Cancel failed: ' + e.message); }
  };

  const s = {
    btn: (active, color) => ({ background: active ? (color || C.accent) : 'transparent', color: active ? '#fff' : C.muted, border: `1px solid ${active ? (color || C.accent) : C.border}`, borderRadius: 3, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }),
    input: { width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: '6px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box' },
    tabBtn: (active) => ({ background: active ? '#2a2e39' : 'transparent', color: active ? C.text : C.muted, border: 'none', borderRight: `1px solid ${C.border}`, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }),
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Roboto Mono', monospace", fontSize: 12, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Top Bar */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>◈ CRYPTEX</span>

        {/* Pairs */}
        <div style={{ display: 'flex', gap: 3 }}>
          {PAIRS.map(p => {
            const t = tickers[p];
            return (
              <button key={p} onClick={() => setPair(p)} style={s.btn(pair === p)}>
                <span>{PAIR_LABELS[p]}</span>
                {t && <span style={{ color: t.change >= 0 ? C.up : C.down, marginLeft: 4 }}>{t.change >= 0 ? '+' : ''}{t.change.toFixed(2)}%</span>}
              </button>
            );
          })}
        </div>

        {/* Intervals */}
        <div style={{ display: 'flex', gap: 3 }}>
          {INTERVALS.map(iv => (
            <button key={iv} onClick={() => setInterval(iv)} style={{ ...s.btn(interval === iv), border: 'none', background: interval === iv ? '#2a2e39' : 'transparent' }}>{iv}</button>
          ))}
        </div>

        {/* Price */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: change24 >= 0 ? C.up : C.down }}>
            ${curPrice ? curPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: curPrice < 10 ? 4 : 2 }) : '---'}
          </span>
          <span style={{ color: change24 >= 0 ? C.up : C.down }}>{change24 >= 0 ? '▲' : '▼'} {Math.abs(change24).toFixed(2)}%</span>
          {loading && <span style={{ color: C.muted, fontSize: 10 }}>updating…</span>}

          {/* Binance connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: hasKeys ? 'rgba(38,166,154,0.1)' : 'rgba(255,152,0,0.1)', border: `1px solid ${hasKeys ? C.up : C.warn}`, borderRadius: 4, padding: '3px 8px', fontSize: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: hasKeys ? C.up : C.warn }} />
            <span style={{ color: hasKeys ? C.up : C.warn }}>{hasKeys ? 'Binance Connected' : 'No API Keys'}</span>
            {!hasKeys && <span onClick={onConnectKeys} style={{ color: C.accent, cursor: 'pointer', marginLeft: 4 }}>Connect →</span>}
          </div>

          {/* User menu */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setUserMenu(v => !v)} style={{ background: '#2a2e39', color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>
              👤 {email?.split('@')[0]}
            </button>
            {showUserMenu && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, zIndex: 100, minWidth: 160 }}>
                <div style={{ color: C.muted, fontSize: 10, padding: '4px 8px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>{email}</div>
                {!hasKeys && (
                  <div onClick={() => { setUserMenu(false); onConnectKeys(); }} style={{ color: C.up, padding: '6px 8px', cursor: 'pointer', fontSize: 11, borderRadius: 3 }}>
                    🔗 Connect Binance
                  </div>
                )}
                {hasKeys && (
                  <div onClick={() => { setUserMenu(false); onConnectKeys(); }} style={{ color: C.warn, padding: '6px 8px', cursor: 'pointer', fontSize: 11, borderRadius: 3 }}>
                    🔑 Update API Keys
                  </div>
                )}
                <div onClick={() => { setUserMenu(false); onLogout(); }} style={{ color: C.down, padding: '6px 8px', cursor: 'pointer', fontSize: 11, borderRadius: 3 }}>
                  ↩ Sign Out
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Indicator bar */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: '4px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ color: C.muted, fontSize: 10 }}>overlay:</span>
        <button onClick={() => setShowBB(v => !v)} style={s.btn(showBB, '#4285f4')}>BB(20,2)</button>
        <button onClick={() => setShowEMA(v => !v)} style={s.btn(showEMA, C.warn)}>EMA 20/50</button>
        {error && <span style={{ color: C.warn, marginLeft: 'auto', fontSize: 10 }}>⚠ {error}</span>}
        <button onClick={loadCandles} style={{ ...s.btn(false), marginLeft: error ? 4 : 'auto' }}>↺ refresh</button>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Charts */}
        <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {candles.length > 0 ? (
            <>
              <CandleChart candles={candles} bb={bb} ema20={ema20} ema50={ema50} showBB={showBB} showEMA={showEMA} width={dims.w} height={dims.h} />
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                <RSIChart rsi={rsi} width={dims.w} height={100} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                <MACDChart macd={macd} width={dims.w} height={100} />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
              Loading chart data…
            </div>
          )}

          {/* Bottom tabs */}
          <div style={{ borderTop: `1px solid ${C.border}`, background: C.panel, flex: 1 }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
              {[['prediction', '🔮 prediction'], ['openorders', '📋 open orders'], ['balances', '💰 balances']].map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} style={s.tabBtn(tab === id)}>{label}</button>
              ))}
            </div>
            <div style={{ padding: 12, maxHeight: 180, overflowY: 'auto' }}>

              {/* Prediction */}
              {tab === 'prediction' && prediction && (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {!mlPrediction && (
                    <div style={{ background: 'rgba(41,98,255,0.1)', border: `1px solid ${C.accent}`, borderRadius: 8, padding: '10px 16px', marginBottom: 12, color: C.muted, fontSize: 12 }}>
                      <div style={{ fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>LSTM NEURAL NETWORK</div>
                      {mlStatus === 'error'
                        ? 'ML model is waking up (free server) — retrying every minute…'
                        : 'Loading ML prediction… (first load can take up to a minute)'}
                    </div>
                  )}
                  {mlPrediction && (
                    <div style={{ background: 'rgba(41,98,255,0.1)', border: `1px solid ${C.accent}`, borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: C.muted, fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>LSTM NEURAL NETWORK</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: mlPrediction.direction === 'UP' ? C.up : C.down, fontWeight: 700, fontSize: 16 }}>
                            {mlPrediction.direction === 'UP' ? '▲' : '▼'} {mlPrediction.direction}
                          </span>
                          <span style={{ color: C.muted, fontSize: 11 }}>{mlPrediction.confidence}% confidence</span>
                        </div>
                      </div>
                      <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>
                        <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>PREDICTED IN 4H</div>
                        <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>${mlPrediction.predicted_price?.toLocaleString()}</div>
                      </div>
                      <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>
                        <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>MODEL ACCURACY</div>
                        <div style={{ color: C.up, fontSize: 13 }}>{mlPrediction.accuracy}</div>
                      </div>
                    </div>
                  )}
                  <div style={{ minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ color: C.muted }}>signal:</span>
                      <span style={{ color: prediction.dirColor, fontWeight: 700, fontSize: 14 }}>{prediction.direction}</span>
                      <span style={{ color: C.muted }}>score: {prediction.score > 0 ? '+' : ''}{prediction.score}</span>
                    </div>
                    {prediction.signals.map((sig, i) => (
                      <div key={i} style={{ color: sig.dir > 0 ? C.up : sig.dir < 0 ? C.down : C.muted, marginBottom: 4, fontSize: 11 }}>
                        {sig.dir > 0 ? '▲' : sig.dir < 0 ? '▼' : '—'} {sig.text}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 24 }}>
                    <div style={{ color: C.muted, marginBottom: 6, fontSize: 10 }}>PRICE TARGETS</div>
                    {[['Entry', prediction.curPrice, C.text], ['Target 1', prediction.target1, prediction.dirColor], ['Target 2', prediction.target2, prediction.dirColor], ['Stop Loss', prediction.stopLoss, C.down]].map(([label, val, color]) => (
                      <div key={label} style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                        <span style={{ color: C.muted }}>{label}</span>
                        <span style={{ color }}>${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 6, color: C.muted, fontSize: 10 }}>
                      R/R ratio: <span style={{ color: prediction.riskReward >= 1.5 ? C.up : C.warn }}>{prediction.riskReward.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Open orders */}
              {tab === 'openorders' && (
                !hasKeys
                  ? <div style={{ color: C.muted, fontSize: 11 }}>Connect your Binance API keys to see open orders. <span onClick={onConnectKeys} style={{ color: C.accent, cursor: 'pointer' }}>Connect now →</span></div>
                  : openOrders.length
                    ? <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr>{['symbol','side','type','qty','price','status',''].map(h => <th key={h} style={{ textAlign: 'left', padding: '3px 8px', borderBottom: `1px solid ${C.border}`, color: C.muted }}>{h}</th>)}</tr></thead>
                        <tbody>{openOrders.map(o => (
                          <tr key={o.orderId} style={{ borderBottom: `1px solid ${C.border}22` }}>
                            <td style={{ padding: '4px 8px' }}>{o.symbol}</td>
                            <td style={{ padding: '4px 8px', color: o.side === 'BUY' ? C.up : C.down }}>{o.side}</td>
                            <td style={{ padding: '4px 8px', color: C.muted }}>{o.type}</td>
                            <td style={{ padding: '4px 8px' }}>{parseFloat(o.origQty)}</td>
                            <td style={{ padding: '4px 8px' }}>{parseFloat(o.price) > 0 ? '$' + parseFloat(o.price).toLocaleString() : 'MKT'}</td>
                            <td style={{ padding: '4px 8px', color: C.muted }}>{o.status}</td>
                            <td style={{ padding: '4px 8px' }}><button onClick={() => handleCancel(o.symbol, o.orderId)} style={{ background: 'transparent', color: C.down, border: `1px solid ${C.down}`, borderRadius: 2, padding: '1px 6px', cursor: 'pointer', fontSize: 10, fontFamily: 'inherit' }}>cancel</button></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    : <div style={{ color: C.muted, fontSize: 11 }}>No open orders for {pair}</div>
              )}

              {/* Balances */}
              {tab === 'balances' && (
                !hasKeys
                  ? <div style={{ color: C.muted, fontSize: 11 }}>Connect your Binance API keys to see your real balances. <span onClick={onConnectKeys} style={{ color: C.accent, cursor: 'pointer' }}>Connect now →</span></div>
                  : balances.length
                    ? <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr>{['asset','free','locked'].map(h => <th key={h} style={{ textAlign: 'left', padding: '3px 8px', borderBottom: `1px solid ${C.border}`, color: C.muted }}>{h}</th>)}</tr></thead>
                        <tbody>{balances.map(b => (
                          <tr key={b.asset} style={{ borderBottom: `1px solid ${C.border}22` }}>
                            <td style={{ padding: '4px 8px' }}>{b.asset}</td>
                            <td style={{ padding: '4px 8px', color: C.up }}>{b.free.toFixed(6)}</td>
                            <td style={{ padding: '4px 8px', color: b.locked > 0 ? C.warn : C.muted }}>{b.locked.toFixed(6)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    : <div style={{ color: C.muted, fontSize: 11 }}>No balances found</div>
              )}
            </div>
          </div>
        </div>

        {/* Order Sidebar */}
        <div style={{ width: 230, background: C.panel, borderLeft: `1px solid ${C.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>PLACE ORDER — {pair}</div>

          {/* No keys warning */}
          {!hasKeys && (
            <div style={{ background: 'rgba(255,152,0,0.1)', border: `1px solid ${C.warn}`, borderRadius: 6, padding: '8px 10px', fontSize: 10 }}>
              <div style={{ color: C.warn, marginBottom: 4 }}>⚠ No Binance keys connected</div>
              <span onClick={onConnectKeys} style={{ color: C.accent, cursor: 'pointer' }}>Connect your account →</span>
            </div>
          )}

          {/* Buy/Sell */}
          <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {['BUY', 'SELL'].map(v => (
              <button key={v} onClick={() => setSide(v)} style={{ flex: 1, background: side === v ? (v === 'BUY' ? C.up : C.down) : 'transparent', color: side === v ? '#fff' : C.muted, border: 'none', padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>{v}</button>
            ))}
          </div>

          {/* Market/Limit */}
          <div style={{ display: 'flex', gap: 4 }}>
            {['MARKET', 'LIMIT'].map(v => (
              <button key={v} onClick={() => setType(v)} style={{ flex: 1, background: orderType === v ? '#2a2e39' : 'transparent', color: orderType === v ? C.text : C.muted, border: `1px solid ${orderType === v ? C.border : 'transparent'}`, borderRadius: 3, padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>{v}</button>
            ))}
          </div>

          {orderType === 'LIMIT' && (
            <div>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>PRICE (USDT)</div>
              <input value={limitPrice} onChange={e => setLimitP(e.target.value)} placeholder={curPrice ? curPrice.toFixed(2) : '0.00'} style={s.input} />
            </div>
          )}

          <div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>QUANTITY ({PAIR_LABELS[pair]})</div>
            <input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder='0.00001' style={s.input} />
          </div>

          <div style={{ background: C.bg, borderRadius: 3, padding: '6px 8px', fontSize: 11 }}>
            <span style={{ color: C.muted }}>total ≈ </span>
            <span>${((parseFloat(quantity) || 0) * (orderType === 'LIMIT' ? (parseFloat(limitPrice) || 0) : curPrice)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          {orderStatus && (
            <div style={{ background: orderStatus.type === 'success' ? 'rgba(38,166,154,0.1)' : 'rgba(239,83,80,0.1)', border: `1px solid ${orderStatus.type === 'success' ? C.up : C.down}`, borderRadius: 3, padding: '6px 8px', fontSize: 10, color: orderStatus.type === 'success' ? C.up : C.down }}>
              {orderStatus.msg}
            </div>
          )}

          <button onClick={() => handleOrder(true)} disabled={orderLoading}
            style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '7px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>
            {orderLoading ? 'checking…' : '✓ test order (safe)'}
          </button>

          <button onClick={() => handleOrder(false)} disabled={orderLoading || !hasKeys}
            style={{ background: !hasKeys ? '#2a2e39' : side === 'BUY' ? C.up : C.down, color: !hasKeys ? C.muted : '#fff', border: 'none', borderRadius: 4, padding: '10px 0', cursor: !hasKeys ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
            {orderLoading ? 'placing…' : !hasKeys ? 'Connect Keys First' : `${side} ${PAIR_LABELS[pair]}`}
          </button>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>QUICK BALANCES</div>
            {!hasKeys
              ? <div style={{ color: C.muted, fontSize: 10 }}>connect API keys to load</div>
              : balances.length
                ? balances.slice(0, 6).map(b => (
                    <div key={b.asset} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: C.muted }}>{b.asset}</span>
                      <span>{b.free.toFixed(4)}</span>
                    </div>
                  ))
                : <div style={{ color: C.muted, fontSize: 10 }}>no balances found</div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App — handles which screen to show ───────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('loading'); // loading | auth | connect | trading
  const [user, setUser]     = useState(null); // { token, email, hasKeys }

  // Check if already logged in on page load
  useEffect(() => {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('email');
    if (token && email) {
      // Verify token still works
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(data => {
        if (data.email) {
          setUser({ token, email: data.email, hasKeys: data.hasKeys });
          setScreen('trading');
        } else {
          localStorage.clear();
          setScreen('auth');
        }
      })
      .catch(() => setScreen('auth'));
    } else {
      setScreen('auth');
    }
  }, []);

  const handleAuth = (userData) => {
    setUser(userData);
    setScreen(userData.hasKeys ? 'trading' : 'connect');
  };

  const handleKeysConnected = () => {
    setUser(prev => ({ ...prev, hasKeys: true }));
    setScreen('trading');
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setScreen('auth');
  };

  if (screen === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#131722', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#787b86', fontFamily: 'monospace' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, color: '#2962ff', fontWeight: 700, marginBottom: 12 }}>◈ CRYPTEX</div>
          <div>Loading…</div>
        </div>
      </div>
    );
  }

  if (screen === 'auth') {
    return <AuthScreen onAuth={handleAuth} />;
  }

  if (screen === 'connect') {
    return (
      <ConnectKeysScreen
        token={user.token}
        email={user.email}
        onConnected={handleKeysConnected}
        onSkip={() => setScreen('trading')}
      />
    );
  }

  return (
    <TradingPlatform
      token={user.token}
      email={user.email}
      hasKeys={user.hasKeys}
      onLogout={handleLogout}
      onConnectKeys={() => setScreen('connect')}
    />
  );
}
