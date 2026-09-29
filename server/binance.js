const crypto = require('crypto');
const axios = require('axios');

const BASE_URL = 'https://api.binance.com';

// ─── Public request (no API key needed) ───────────────────────────────────────
async function publicRequest(path, params = {}) {
  try {
    const query = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${path}${query ? '?' + query : ''}`;
    const { data } = await axios.get(url);
    return data;
  } catch (err) {
    const msg = err.response?.data?.msg || err.message;
    throw new Error(`Binance public request failed: ${msg}`);
  }
}

// ─── Signed request (needs API key + secret) ──────────────────────────────────
async function signedRequest(method, path, params = {}) {
  try {
    const timestamp = Date.now();
    const allParams = { ...params, timestamp };
    const queryString = new URLSearchParams(allParams).toString();

    const signature = crypto
      .createHmac('sha256', process.env.BINANCE_SECRET)
      .update(queryString)
      .digest('hex');

    const url = `${BASE_URL}${path}?${queryString}&signature=${signature}`;
    const headers = { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY };

    let response;
    if (method === 'GET')    response = await axios.get(url, { headers });
    if (method === 'POST')   response = await axios.post(url, null, { headers });
    if (method === 'DELETE') response = await axios.delete(url, { headers });

    return response.data;
  } catch (err) {
    const msg = err.response?.data?.msg || err.message;
    throw new Error(`Binance signed request failed: ${msg}`);
  }
}

module.exports = { publicRequest, signedRequest };
