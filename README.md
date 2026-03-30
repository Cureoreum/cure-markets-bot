# cure-markets-bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Node.js-green)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue)](https://discord.js.org/)

A robust Node.js application consisting of a **Discord Bot** and an **Express API Proxy**. It allows users to retrieve real-time cryptocurrency market data and set up automated price alerts via Direct Messages (DM) within Discord.

## 🚀 Features

*   **Discord Slash Commands:** Interactive commands to fetch market data, trade history, and order book depth.
*   **Price Alerts:** Set triggers for specific trading pairs (Above/Below price). Receives notifications via DM when conditions are met.
*   **Hybrid Storage:** Supports **MongoDB** for persistent storage or a fallback **JSON** file storage.
*   **API Proxy:** An Express server that validates and proxies requests to the QuTrade exchange API, handling input validation and error formatting.
*   **Performance Caching:** Implements a 30-second TTL cache for market data requests to reduce API load.
*   **Process Manager:** A launcher script to orchestrate the API and Bot processes simultaneously.

## 🛠 Tech Stack

*   **Runtime:** Node.js
*   **Framework:** Discord.js (v14+), Express.js
*   **Database:** MongoDB (Primary), JSON File (Fallback)
*   **HTTP Client:** Axios
*   **Configuration:** dotenv

## 📦 Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/qutrade-bot.git
    cd qutrade-bot
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**
    Create a `.env` file in the root directory and populate it with the required variables (see [Configuration](#configuration) below).
    ```bash
    cp .env.example .env
    # Edit .env with your details
    ```

4.  **Database Setup (Optional)**
    *   **MongoDB:** Ensure MongoDB is running locally or provide a valid connection string in `.env`.
    *   **JSON:** If `USE_JSON_STORAGE=true`, ensure write permissions to `./price_alerts.json`.

## ⚙️ Configuration

The application uses the following environment variables. Update your `.env` file accordingly:

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `DISCORD_TOKEN` | Your Discord Bot Token | - | ✅ |
| `GUILD_ID` | Discord Server ID for local command registration | - | ⚠️ |
| `MONGO_URI` | MongoDB Connection String | `mongodb://localhost:27017` | ❌ |
| `QUTRADE_BASE_URL` | API Proxy Base URL (For Bot to call) | `http://localhost:3002` | ❌ |
| `PORT` | Port for Express API Server | `3000` | ❌ |
| `USE_JSON_STORAGE` | Toggle storage backend (`true` for JSON, `false` for Mongo) | `false` | ❌ |

> **⚠️ Port Configuration Note:** The default `QUTRADE_BASE_URL` for the bot is set to `localhost:3002`, but the Express API defaults to port `3000`. Ensure you update `.env` to match your API server port (e.g., set `PORT=3002` in `.env` for the API if you don't change the bot config).

## 📂 Project Structure

*   `main.js`: Orchestrator script to launch the API and Bot simultaneously.
*   `discord_client.js`: Handles Discord gateway connection, slash commands, and price alert logic.
*   `qapi.js`: Express server exposing market data endpoints with validation.
*   `.env`: Environment variables (not tracked in git).
*   `package.json`: Dependencies and scripts.

## 📖 Usage

### 1. Running the Application
Run the launcher script to start both the API and the Bot:
```bash
node main.js
```

*Alternatively, run processes individually for debugging:*
```bash
# Start API
node qapi.js

# Start Bot
node discord_client.js
```

### 2. Discord Commands
Once the bot is online, use the following slash commands. Commands are available in Guilds and DMs (depending on registration).

| Command | Description | Options |
| :--- | :--- | :--- |
| `/marketdata` | Get current market data for pairs | `pair` (str) |
| `/marketlimit` | Get market high/low limits | `pair` (str), `limit` (int) |
| `/marketdepth` | View order book depth | `pair` (str), `limit` (int) |
| `/markettrades` | View recent trade history | `pair` (str), `limit` (int) |
| `/pricealert` | Set a DM price alert | `pair` (str), `price` (num), `above` (bool), `below` (bool) |

**Example Usage:**
> `/pricealert pair:cure_usdt price:100.5 above:true`

### 3. API Endpoints
The Express server proxies requests to `qutrade.io`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/market_data` | Fetch current market data. |
| `GET` | `/market_limit` | Fetch 24h high/low prices. |
| `GET` | `/market_depth` | Fetch order book levels. |
| `GET` | `/market_trades` | Fetch recent trade list. |

**Query Parameters:**
*   `pair`: Comma-separated tickers (e.g., `cure_usdt,cure_btc`). Regex: `^[a-z0-9]+_[a-z0-9]+$`.
*   `limit`: Integer between 1-100.
*   `from` / `to`: Timestamps (integers) for trade filtering.

## ⚙️ Price Alert System

*   **Trigger Logic:** The bot checks active alerts every **30 seconds**.
*   **Notification:** Users receive a Direct Message when the market price meets their condition.
*   **Deletion:** Triggered alerts are automatically removed from the database to prevent spam.
*   **Storage:** Alerts are persisted in MongoDB by default, or `./price_alerts.json` if configured.

## 🔒 Security

*   **Never commit `.env` files.** Keep your `DISCORD_TOKEN` and `MONGO_URI` private.
*   **Input Validation:** The API layer validates pair formats and limits to prevent injection or malformed requests.
*   **Intent Security:** Ensure you enable the required intents (`Guilds`, `MessageContent`, etc.) in the Discord Developer Portal for the bot to function correctly.

## 🛑 Troubleshooting

**Bot doesn't show commands:**
*   Ensure you have set the `GUILD_ID` in `.env` and the bot is a member of that server.
*   Check the console logs for "Slash commands registered".

**Database Connection Failed:**
*   Verify `MONGO_URI` is correct.
*   If using JSON storage, ensure `USE_JSON_STORAGE` is set to `true` in `.env`.
*   Data is not shared between datatypes

**API Port Mismatch:**
*   If the bot cannot fetch data, check the console logs for connection errors. Ensure `QUTRADE_BASE_URL` in the bot's environment matches the `PORT` the Express server is running on.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:
1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
---

*Disclaimer: This project is provided for educational and development purposes.*
