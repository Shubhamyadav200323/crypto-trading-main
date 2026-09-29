from flask import Flask, jsonify, request
from flask_cors import CORS
import tensorflow as tf
import pickle
import numpy as np
import pandas as pd
import requests
import os

app = Flask(__name__)
CORS(app)

# Load model and scaler
print("Loading LSTM model...")
model = tf.keras.models.load_model('btc_lstm_model.keras')

with open('scaler.pkl', 'rb') as f:
    scaler = pickle.load(f)

with open('features.pkl', 'rb') as f:
    features = pickle.load(f)

print("Model loaded successfully!")

def fetch_recent_data(symbol='BTC-USD'):
    import yfinance as yf
    df = yf.download(symbol, period='7d', interval='1h', progress=False)
    df = df.reset_index()
    df.columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
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
        scaled = scaler.transform(latest)
        X = np.array([scaled])

        # Make prediction
        prediction = model.predict(X, verbose=0)[0][0]
        direction = 'UP' if prediction > 0.5 else 'DOWN'
        confidence = float(prediction) if prediction > 0.5 else float(1 - prediction)

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