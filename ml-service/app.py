from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
import pandas as pd
import requests
import os

app = Flask(__name__)
CORS(app)

# ─── Model ─────────────────────────────────────────────────────────────────────
# The LSTM runs in plain NumPy (no TensorFlow), so it fits in Render's free 512 MB.
# Weights, scaler and feature list were exported from btc_lstm_model.keras,
# scaler.pkl and features.pkl into model_weights.npz.
print("Loading LSTM model...")
W = dict(np.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model_weights.npz')))
features      = [str(f) for f in W['features']]
SCALER_SCALE  = W['scaler_scale']
SCALER_MIN    = W['scaler_min']
print("Model loaded successfully!")


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def lstm(x, name, return_sequences):
    # Keras LSTM: gates ordered i, f, c, o; activation tanh, recurrent sigmoid
    kernel, recurrent, bias = W[f'{name}__0'], W[f'{name}__1'], W[f'{name}__2']
    units = recurrent.shape[0]
    batch, steps, _ = x.shape
    h = np.zeros((batch, units), dtype=np.float32)
    c = np.zeros((batch, units), dtype=np.float32)
    xw = x @ kernel + bias                      # (batch, steps, 4*units)
    outputs = []
    for t in range(steps):
        z = xw[:, t, :] + h @ recurrent
        i = sigmoid(z[:, :units])
        f = sigmoid(z[:, units:2 * units])
        g = np.tanh(z[:, 2 * units:3 * units])
        o = sigmoid(z[:, 3 * units:])
        c = f * c + i * g
        h = o * np.tanh(c)
        if return_sequences:
            outputs.append(h)
    return np.stack(outputs, axis=1) if return_sequences else h


def batch_norm(x, name, eps=1e-3):
    gamma, beta, mean, var = (W[f'{name}__{k}'] for k in range(4))
    return gamma * (x - mean) / np.sqrt(var + eps) + beta


def dense(x, name):
    return x @ W[f'{name}__0'] + W[f'{name}__1']


def model_predict(X):
    x = X.astype(np.float32)
    x = batch_norm(lstm(x, 'lstm',   True),  'batch_normalization')
    x = batch_norm(lstm(x, 'lstm_1', True),  'batch_normalization_1')
    x = batch_norm(lstm(x, 'lstm_2', False), 'batch_normalization_2')
    x = np.maximum(dense(x, 'dense'), 0)        # relu
    return sigmoid(dense(x, 'dense_1'))         # (batch, 1)


def scale(values):
    # Same as the saved MinMaxScaler.transform
    return values * SCALER_SCALE + SCALER_MIN


# ─── Data ──────────────────────────────────────────────────────────────────────
def to_binance_symbol(symbol):
    # "BTC-USD" / "BTCUSDT" / "btc" -> "BTCUSDT"
    s = symbol.upper().replace('-', '').replace('/', '')
    if s.endswith('USDT'):
        return s
    if s.endswith('USD'):
        s = s[:-3]
    return s + 'USDT'

def fetch_recent_data(symbol='BTC-USD', limit=300):
    # Hourly candles from Binance (yfinance is often blocked/rate-limited on cloud servers)
    r = requests.get(
        'https://api.binance.com/api/v3/klines',
        params={'symbol': to_binance_symbol(symbol), 'interval': '1h', 'limit': limit},
        timeout=15
    )
    r.raise_for_status()
    rows = r.json()
    df = pd.DataFrame(rows).iloc[:, :6]
    df.columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    for c in ['open', 'high', 'low', 'close', 'volume']:
        df[c] = df[c].astype(float)
    return df

def add_indicators(df):
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = -delta.where(delta < 0, 0).rolling(14).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    ema12 = df['close'].ewm(span=12).mean()
    ema26 = df['close'].ewm(span=26).mean()
    df['macd'] = ema12 - ema26
    df['macd_signal'] = df['macd'].ewm(span=9).mean()
    df['macd_hist'] = df['macd'] - df['macd_signal']
    sma20 = df['close'].rolling(20).mean()
    std20 = df['close'].rolling(20).std()
    df['bb_upper'] = sma20 + (2 * std20)
    df['bb_lower'] = sma20 - (2 * std20)
    df['bb_width'] = df['bb_upper'] - df['bb_lower']
    df['ema20'] = df['close'].ewm(span=20).mean()
    df['ema50'] = df['close'].ewm(span=50).mean()
    df['returns'] = df['close'].pct_change()
    df['volatility'] = df['returns'].rolling(20).std()
    return df


# ─── Routes ────────────────────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({ 'status': 'ok', 'model': 'LSTM BTC Predictor' })

@app.route('/predict', methods=['GET'])
def predict():
    try:
        symbol = request.args.get('symbol', 'BTC-USD')

        # Fetch recent data
        df = fetch_recent_data(symbol)
        df = add_indicators(df)
        df = df.dropna()

        if len(df) < 60:
            return jsonify({ 'error': 'Not enough data' }), 400

        # Prepare last 60 candles
        latest = df[features].values[-60:]
        scaled = scale(latest)
        X = np.array([scaled])

        # Make prediction
        prediction = float(model_predict(X)[0][0])
        direction = 'UP' if prediction > 0.5 else 'DOWN'
        confidence = prediction if prediction > 0.5 else 1 - prediction

        current_price = float(df['close'].iloc[-1])
        predicted_change = confidence * 0.02 if direction == 'UP' else -confidence * 0.02
        predicted_price = current_price * (1 + predicted_change)

        return jsonify({
            'symbol':          symbol,
            'direction':       direction,
            'confidence':      round(confidence * 100, 2),
            'current_price':   round(current_price, 2),
            'predicted_price': round(predicted_price, 2),
            'predicted_in':    '4 hours',
            'model':           'LSTM Neural Network',
            'accuracy':        '52%'
        })

    except Exception as e:
        return jsonify({ 'error': str(e) }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
