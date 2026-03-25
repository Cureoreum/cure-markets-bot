require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const QUTRADE_BASE_URL = 'https://qutrade.io';

app.use(express.json());

function validatePair(pair) {
    if (!pair) return true; // Optional parameter
    const pairs = pair.split(',');
    const pairRegex = /^[a-z0-9]+_[a-z0-9]+$/; // e.g., cure_usdt

    for (const p of pairs) {
        if (!pairRegex.test(p.trim())) {
            return false;
        }
    }
    return true;
}

function validateLimit(limit, max = 100) {
    if (!limit) return true; // Optional parameter
    const num = parseInt(limit, 10);
    return !isNaN(num) && num >= 1 && num <= max;
}

function validateTimestamp(timestamp) {
    if (!timestamp) return true; // Optional parameter
    const num = parseInt(timestamp, 10);
    return !isNaN(num) && num > 0;
}

function validateMarketDataParams(params) {
    const errors = [];

    if (params.pair && !validatePair(params.pair)) {
        errors.push('Invalid pair format. Must be comma-separated market tickers like "cure_usdt,cure_btc"');
    }

    return errors;
}

function validateMarketLimitParams(params) {
    const errors = [];

    if (params.pair && !validatePair(params.pair)) {
        errors.push('Invalid pair format. Must be comma-separated market tickers like "cure_usdt,cure_btc"');
    }

    return errors;
}

function validateMarketDepthParams(params) {
    const errors = [];

    if (params.pair && !validatePair(params.pair)) {
        errors.push('Invalid pair format. Must be comma-separated market tickers like "cure_usdt,cure_btc"');
    }

    if (params.limit && !validateLimit(params.limit, 100)) {
        errors.push('Invalid limit. Must be a number between 1 and 100');
    }

    return errors;
}

function validateMarketTradesParams(params) {
    const errors = [];

    if (params.pair && !validatePair(params.pair)) {
        errors.push('Invalid pair format. Must be comma-separated market tickers like "cure_usdt,cure_btc"');
    }

    if (params.limit && !validateLimit(params.limit, 100)) {
        errors.push('Invalid limit. Must be a number between 1 and 100');
    }

    if (params.from && !validateTimestamp(params.from)) {
        errors.push('Invalid from timestamp. Must be a positive integer');
    }

    if (params.to && !validateTimestamp(params.to)) {
        errors.push('Invalid to timestamp. Must be a positive integer');
    }

    // Validate time range
    if (params.from && params.to && parseInt(params.from) >= parseInt(params.to)) {
        errors.push('From timestamp must be less than to timestamp');
    }

    return errors;
}

// Helper to build query string
function buildQueryString(params) {
    const qs = new URLSearchParams(params).toString();
    return qs ? `?${qs}` : '';
}

// Helper to get validated query parameters
function getValidatedParams(req, validationFn) {
    const errors = validationFn(req.query);
    if (errors.length > 0) {
        throw new Error(errors.join(', '));
    }
    return req.query;
}

// Market Data
app.get('/market_data', async (req, res) => {
    try {
        const params = getValidatedParams(req, validateMarketDataParams);
        const url = `${QUTRADE_BASE_URL}/api/v1/market_data/${buildQueryString(params)}`;
        const response = await axios.get(url);

        res.json({ data: response.data});
    } catch (error) {
        if (error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// Market Limit
app.get('/market_limit', async (req, res) => {
    try {
        const params = getValidatedParams(req, validateMarketLimitParams);
        const url = `${QUTRADE_BASE_URL}/api/v1/market_limit/${buildQueryString(params)}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        if (error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// Market Depth
app.get('/market_depth', async (req, res) => {
    try {
        const params = getValidatedParams(req, validateMarketDepthParams);
        const url = `${QUTRADE_BASE_URL}/api/v1/market_depth/${buildQueryString(params)}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        if (error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// Market Trades
app.get('/market_trades', async (req, res) => {
    try {
        const params = getValidatedParams(req, validateMarketTradesParams);
        const url = `${QUTRADE_BASE_URL}/api/v1/market_trades/${buildQueryString(params)}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        if (error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});