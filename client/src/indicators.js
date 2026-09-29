// ─── Simple Moving Average ────────────────────────────────────────────────────
export function calcSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, c) => s + c.close, 0) / period;
  });
}

// ─── Exponential Moving Average ───────────────────────────────────────────────
export function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const out = Array(data.length).fill(null);
  let ema = data[0]?.close || 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { out[0] = ema; continue; }
    ema = data[i].close * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

// ─── Bollinger Bands ──────────────────────────────────────────────────────────
export function calcBB(data, period = 20, mult = 2) {
  const sma = calcSMA(data, period);
  return data.map((_, i) => {
    if (sma[i] === null) return { upper: null, mid: null, lower: null };
    const slice = data.slice(i - period + 1, i + 1);
    const std = Math.sqrt(
      slice.reduce((s, c) => s + Math.pow(c.close - sma[i], 2), 0) / period
    );
    return { upper: sma[i] + mult * std, mid: sma[i], lower: sma[i] - mult * std };
  });
}

// ─── RSI ──────────────────────────────────────────────────────────────────────
export function calcRSI(data, period = 14) {
  const out = Array(data.length).fill(null);
  for (let i = period; i < data.length; i++) {
    const changes = data
      .slice(i - period, i)
      .map((d, j, arr) => j === 0 ? 0 : d.close - arr[j - 1].close);
    const gains  = changes.filter(c => c > 0).reduce((s, c) => s + c, 0) / period;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((s, c) => s + c, 0)) / period;
    out[i] = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
  }
  return out;
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
export function calcMACD(data) {
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);
  const macdLine = data.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null
  );
  const macdData  = macdLine.map(v => ({ close: v || 0 }));
  const signal    = calcEMA(macdData, 9);
  const histogram = macdLine.map((v, i) =>
    v !== null && signal[i] !== null ? v - signal[i] : null
  );
  return { macdLine, signal, histogram };
}

// ─── AI Prediction ────────────────────────────────────────────────────────────
export function generatePrediction(candles, bb, rsi, macd) {
  if (!candles.length) return null;
  const curPrice  = candles.at(-1)?.close || 0;
  const rsiVal    = rsi.filter(Boolean).at(-1) || 50;
  const macdHist  = macd.histogram.filter(Boolean).at(-1) || 0;
  const bbLast    = bb.at(-1);
  const ema20Last = calcEMA(candles, 20).at(-1);
  const ema50Last = calcEMA(candles, 50).at(-1);

  let score = 0;
  const signals = [];

  // RSI signal
  if (rsiVal < 30) {
    score += 3;
    signals.push({ text: `RSI ${rsiVal.toFixed(1)} — strongly oversold, high bounce probability`, dir: 1 });
  } else if (rsiVal < 40) {
    score += 1;
    signals.push({ text: `RSI ${rsiVal.toFixed(1)} — oversold zone, mild bullish bias`, dir: 1 });
  } else if (rsiVal > 70) {
    score -= 3;
    signals.push({ text: `RSI ${rsiVal.toFixed(1)} — strongly overbought, correction likely`, dir: -1 });
  } else if (rsiVal > 60) {
    score -= 1;
    signals.push({ text: `RSI ${rsiVal.toFixed(1)} — overbought zone, mild bearish bias`, dir: -1 });
  } else {
    signals.push({ text: `RSI ${rsiVal.toFixed(1)} — neutral range`, dir: 0 });
  }

  // MACD signal
  if (macdHist > 0) {
    score += 2;
    signals.push({ text: `MACD histogram positive — bullish momentum building`, dir: 1 });
  } else {
    score -= 2;
    signals.push({ text: `MACD histogram negative — bearish momentum`, dir: -1 });
  }

  // Bollinger Band signal
  if (bbLast?.lower && curPrice < bbLast.lower) {
    score += 2;
    signals.push({ text: `Price below lower Bollinger Band — potential reversal up`, dir: 1 });
  } else if (bbLast?.upper && curPrice > bbLast.upper) {
    score -= 2;
    signals.push({ text: `Price above upper Bollinger Band — potential reversal down`, dir: -1 });
  } else {
    signals.push({ text: `Price within Bollinger Bands — stable range`, dir: 0 });
  }

  // EMA crossover
  if (ema20Last && ema50Last) {
    if (ema20Last > ema50Last) {
      score += 1;
      signals.push({ text: `EMA20 above EMA50 — uptrend confirmed`, dir: 1 });
    } else {
      score -= 1;
      signals.push({ text: `EMA20 below EMA50 — downtrend confirmed`, dir: -1 });
    }
  }

  const direction = score >= 3 ? 'STRONG BUY' : score >= 1 ? 'BUY' : score <= -3 ? 'STRONG SELL' : score <= -1 ? 'SELL' : 'NEUTRAL';
  const dirColor  = score > 0 ? '#26a69a' : score < 0 ? '#ef5350' : '#787b86';
  const momentum  = Math.abs(score) / 8; // 0 to 1
  const target1   = score > 0 ? curPrice * (1 + 0.008 + momentum * 0.01) : curPrice * (1 - 0.008 - momentum * 0.01);
  const target2   = score > 0 ? curPrice * (1 + 0.018 + momentum * 0.02) : curPrice * (1 - 0.018 - momentum * 0.02);
  const stopLoss  = score > 0 ? curPrice * (1 - 0.015) : curPrice * (1 + 0.015);
  const riskReward = Math.abs(target1 - curPrice) / Math.abs(stopLoss - curPrice);

  return { score, direction, dirColor, signals, target1, target2, stopLoss, riskReward, curPrice };
}
