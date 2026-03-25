require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ApplicationCommandOptionType, REST, Routes
} = require('discord.js');
const axios = require('axios');
const {MongoClient} = require('mongodb');
const fs = require('fs').promises;
const path = require('path');
const TOKEN = process.env.DISCORD_TOKEN;
const QUTRADE_BASE_URL = process.env.QUTRADE_BASE_URL || 'http://localhost:3002';
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'qutrade_discord_bot';
const COLLECTION_NAME = 'price_alerts';
const JSON_FILE_PATH = './price_alerts.json';
const USE_JSON_STORAGE = process.env.USE_JSON_STORAGE === 'true'; // Toggle for storage method

let db;
let storageMethod = USE_JSON_STORAGE ? 'json' : 'mongodb';

async function connectToDatabase() {
    if (storageMethod === 'mongodb') {
        try {
            const client = new MongoClient(MONGO_URI);
            await client.connect();
            db = client.db(DB_NAME);
            console.log('Connected to MongoDB');
        } catch (err) {
            console.error('Failed to connect to MongoDB:', err);
            process.exit(1);
        }
    }
}

function setCache(key, value) {
    const now = Date.now();
    cache.set(key, {
        value,
        timestamp: now
    });
}

function getCache(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return item.value;
}

const discord_client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: ['CHANNEL']
});

// Commands that can be used in DMs
const DM_COMMANDS = ['marketdata', 'marketlimit', 'marketdepth', 'markettrades', 'pricealert'];

// Storage functions for MongoDB
const mongoStorage = {
    async getAllAlerts() {
        return await db.collection(COLLECTION_NAME).find({}).toArray();
    },
    async insertAlert(alertData) {
        return await db.collection(COLLECTION_NAME).insertOne(alertData);
    },
    async deleteAlerts(alertIds) {
        return await db.collection(COLLECTION_NAME).deleteMany({_id: {$in: alertIds}});
    }
};

// Storage functions for JSON file
const jsonStorage = {
    async getAllAlerts() {
        try {
            const data = await fs.readFile(JSON_FILE_PATH, 'utf8');
            return JSON.parse(data) || [];
        } catch (err) {
            // If file doesn't exist, return empty array
            if (err.code === 'ENOENT') {
                return [];
            }
            throw err;
        }
    },
    async insertAlert(alertData) {
        let alerts = [];
        try {
            const data = await fs.readFile(JSON_FILE_PATH, 'utf8');
            alerts = JSON.parse(data) || [];
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        // Add new alert with ID
        alertData._id = Date.now().toString();
        alerts.push(alertData);

        await fs.writeFile(JSON_FILE_PATH, JSON.stringify(alerts, null, 2));
        return { insertedId: alertData._id };
    },
    async deleteAlerts(alertIds) {
        try {
            const data = await fs.readFile(JSON_FILE_PATH, 'utf8');
            let alerts = JSON.parse(data) || [];
            alerts = alerts.filter(alert => !alertIds.includes(alert._id));
            await fs.writeFile(JSON_FILE_PATH, JSON.stringify(alerts, null, 2));
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    }
};

// Select storage method
const storage = storageMethod === 'mongodb' ? mongoStorage : jsonStorage;

async function checkPriceAlerts() {
    try {
        const alerts = await storage.getAllAlerts();
        if (alerts.length === 0) return;
        const pairs = [...new Set(alerts.map(alert => alert.pair))];
        if (pairs.length === 0) return;
        const url = `${QUTRADE_BASE_URL}/market_data?pair=${pairs.join(',')}`;
        const response = await axios.get(url);
        const data = response.data;
        if (!data || !data.data) return;

        const userAlerts = new Map();
        for (const alert of alerts) {
            const pairData = data.data.list[alert.pair];
            if (!pairData) continue;
            const currentPrice = parseFloat(pairData.price);
            const alertPrice = parseFloat(alert.price);
            if ((alert.above && currentPrice >= alertPrice) ||
                (alert.below && currentPrice <= alertPrice)) {
                if (!userAlerts.has(alert.userId)) {
                    userAlerts.set(alert.userId, []);
                }
                userAlerts.get(alert.userId).push({
                    ...alert,
                    currentPrice
                });
            }
        }
        for (const [userId, triggeredAlerts] of userAlerts.entries()) {
            const user = await discord_client.users.fetch(userId).catch(() => null);
            if (!user) continue;
            const embed = new EmbedBuilder()
                .setTitle('Price Alert')
                .setColor('#ff9900')
                .setDescription('Your price alerts have been triggered:')
                .setTimestamp();
            for (const alert of triggeredAlerts) {
                let above = alert.currentPrice > alert.price && alert.above;
                let below = alert.currentPrice < alert.price && alert.below;
                let determination = above ? "above" : (below) ? "below" : "match"
                embed.addFields({
                    name: `${alert.pair}`,
                    value: `Alert triggered at ${alert.currentPrice}\nTarget: ${alert.price} (type: ${determination} alert price)`,
                    inline: true
                });
            }
            // Remove triggered alerts from storage
            const alertIds = triggeredAlerts.map(alert => alert._id);
            await storage.deleteAlerts(alertIds);
            // Send DM notification
            try {
                await user.send({embeds: [embed]});
            } catch (err) {
                console.error(`Failed to send DM to user ${userId}:`, err);
            }
        }
    } catch (err) {
        console.error('Error checking price alerts:', err);
    }
}

const handlers = {
    marketdata: async (interaction) => {
        const pair = interaction.options.getString('pair') || 'cure_usdt,cure_btc';
        const url = `${QUTRADE_BASE_URL}/market_data?pair=${pair}`;
        const cacheKey = `marketdata_${pair}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return interaction.reply({embeds: [cached], ephemeral: false});
        }
        try {
            const response = await axios.get(url);
            const data = response.data;
            if (!data || !data.data)
                return interaction.reply({content: 'No data available', ephemeral: true});
            const embed = new EmbedBuilder()
                .setTitle('Market Data')
                .setColor('#0099ff')
                .setDescription(`Data for pairs: ${pair}`)
                .setTimestamp();
            let d2 = JSON.parse(JSON.stringify(data));
            let result = Object.keys(d2.data.list).map((key) => [key, d2.data.list[key]]);
            result.forEach(item => {
                item = item[1];
                item.pair = pair;
                embed.addFields({
                    name: item.pair,
                    value: `Price: ${item.price}  \n Time: ${new Date(item.timestamp * 1000)}`,
                    inline: true
                });
            });
            setCache(cacheKey, embed);
            await interaction.reply({embeds: [embed]});
        } catch (err) {
            console.error(err);
            interaction.reply({content: 'Error fetching market data', ephemeral: true});
        }
    },
    marketlimit: async (interaction) => {
        const pair = interaction.options.getString('pair') || 'cure_usdt,cure_btc';
        const limit = interaction.options.getInteger('limit') || 10;
        const url = `${QUTRADE_BASE_URL}/market_limit?pair=${pair}&limit=${limit}`;
        const cacheKey = `marketlimit_${pair}_${limit}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return interaction.reply({embeds: [cached], ephemeral: false});
        }
        try {
            const response = await axios.get(url);
            const data = response.data;
            if (!data)
                return interaction.reply({content: 'No data available', ephemeral: true});
            const embed = new EmbedBuilder()
                .setTitle('Market Limit')
                .setColor('#00ff00')
                .setDescription(`Limit data for pairs: ${pair} (limit: ${limit})`)
                .setTimestamp();
            let d2 = JSON.parse(JSON.stringify(data));
            let result = Object.keys(d2.list).map((key) => [key, d2.list[key]]);
            result.forEach(item => {
                item = item[1];
                embed.addFields({
                    name: pair,
                    value: `High: ${item.max_price_buy}, Low: ${item.min_price_sell} \n Time: ${new Date(item.timestamp * 1000)}`,
                    inline: true
                });
            });
            setCache(cacheKey, embed);
            await interaction.reply({embeds: [embed]});
        } catch (err) {
            console.error(err);
            interaction.reply({content: 'Error fetching market limit', ephemeral: true});
        }
    },
    marketdepth: async (interaction) => {
        const pair = interaction.options.getString('pair') || 'cure_usdt,cure_btc';
        const limit = interaction.options.getInteger('limit') || 10;
        const url = `${QUTRADE_BASE_URL}/market_depth?pair=${pair}&limit=${limit}`;
        const cacheKey = `marketdepth_${pair}_${limit}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return interaction.reply({embeds: [cached], ephemeral: false});
        }
        try {
            const response = await axios.get(url);
            const data = response.data;
            if (!data)
                return interaction.reply({content: 'No data available', ephemeral: true});
            const embed = new EmbedBuilder()
                .setTitle('Market Depth')
                .setColor('#ff0000')
                .setDescription(`Depth data for pairs: ${pair} (limit: ${limit})`)
                .setTimestamp();
            let d2 = JSON.parse(JSON.stringify(data));
            let result = Object.keys(d2.list).map((key) => [key, d2.list[key]]);
            result.forEach(item => {
                item = item[1];
                const bids = item.bids.slice(0, 3).map(b => `${b[0]} (${b[1]})`).join('\n');
                const asks = item.asks.slice(0, 3).map(a => `${a[0]} (${a[1]})`).join('\n');
                embed.addFields(
                    {name: `${pair} - Bids`, value: bids || 'No bids', inline: true},
                    {name: `${pair} - Asks`, value: asks || 'No asks', inline: true}
                );
            });
            setCache(cacheKey, embed);
            await interaction.reply({embeds: [embed]});
        } catch (err) {
            console.error(err);
            interaction.reply({content: 'Error fetching market depth', ephemeral: true});
        }
    },
    markettrades: async (interaction) => {
        const pair = interaction.options.getString('pair') || 'cure_usdt';
        const limit = interaction.options.getInteger('limit') || 10;
        const url = `${QUTRADE_BASE_URL}/market_trades?pair=${pair}&limit=${limit}`;
        const cacheKey = `markettrades_${pair}_${limit}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return interaction.reply({embeds: [cached], ephemeral: false});
        }
        try {
            const response = await axios.get(url);
            const data = response.data;
            if (!data)
                return interaction.reply({content: 'No data available', ephemeral: true});
            const embed = new EmbedBuilder()
                .setTitle('Market Trades')
                .setColor('#ffff00')
                .setDescription(`Recent trades for pairs: ${pair} (limit: ${limit})`)
                .setTimestamp();
            let d2 = JSON.parse(JSON.stringify(data));
            let result = Object.keys(d2.list).map((key) => [key, d2.list[key]]);
            result.forEach(item => {
                item = item[1];
                let v = `Price: ${item.price}, Amount: ${item.amount}, Time: ${new Date(item.timestamp * 1000).toLocaleTimeString()}`;
                embed.addFields({name: item.pair, value: v || 'No trades', inline: true});
            });
            setCache(cacheKey, embed);
            await interaction.reply({embeds: [embed]});
        } catch (err) {
            console.error(err);
            interaction.reply({content: 'Error fetching trades', ephemeral: true});
        }
    },
    pricealert: async (interaction) => {
        const pair = interaction.options.getString('pair') || 'cure_usdt';
        const price = interaction.options.getNumber('price');
        const above = interaction.options.getBoolean('above') || false;
        const below = interaction.options.getBoolean('below') || false;
        if (!pair || !price) {
            return interaction.reply({
                content: 'Please provide both pair and price',
                ephemeral: true
            });
        }
        if (!above && !below) {
            return interaction.reply({
                content: 'Please specify either "above" or "below" condition',
                ephemeral: true
            });
        }
        // Store the alert in the selected storage method
        const alertData = {
            userId: interaction.user.id,
            pair,
            price,
            above,
            below,
            createdAt: new Date()
        };
        try {
            await storage.insertAlert(alertData);
            const embed = new EmbedBuilder()
                .setTitle('Price Alert Set')
                .setColor('#00ff00')
                .setDescription(`Alert set for ${pair}`)
                .addFields(
                    {name: 'Pair', value: pair, inline: true},
                    {name: 'Price', value: price.toString(), inline: true},
                    {
                        name: 'Condition',
                        value: above && below ? 'Above/Below' : (above ? 'Above' : 'Below'),
                        inline: true
                    }
                )
                .setTimestamp();
            await interaction.reply({embeds: [embed], ephemeral: true});
        } catch (err) {
            console.error('Error saving alert:', err);
            await interaction.reply({
                content: 'Failed to set price alert',
                ephemeral: true
            });
        }
    }
};

console.log("⏳ Starting...");
discord_client.once('clientReady', async () => {
    console.log(`Logged in as ${discord_client.user.tag}`);

    await connectToDatabase();

    setInterval(checkPriceAlerts, 30000);

    const slashCommands = [
        {
            name: 'marketdata',
            description: 'Get market data for pairs',
            options: [
                {
                    name: 'pair',
                    type: ApplicationCommandOptionType.String,
                    description: 'Comma-separated pairs (ex: cure_usdt,cure_btc)',
                    required: false
                }
            ]
        },
        {
            name: 'marketlimit',
            description: 'Get market limit data',
            options: [
                {
                    name: 'pair',
                    type: ApplicationCommandOptionType.String,
                    description: 'Pairs list (ex: cure_usdt,cure_btc)',
                    required: false
                },
                {
                    name: 'limit',
                    type: ApplicationCommandOptionType.Integer,
                    description: 'Limit of results',
                    required: false
                }
            ]
        },
        {
            name: 'marketdepth',
            description: 'Get market depth',
            options: [
                {
                    name: 'pair',
                    type: ApplicationCommandOptionType.String,
                    description: 'Trading pair (ex: cure_usdt)',
                    required: false
                },
                {
                    name: 'limit',
                    type: ApplicationCommandOptionType.Integer,
                    description: 'Number of depth results',
                    required: false
                }
            ]
        },
        {
            name: 'markettrades',
            description: 'Get recent trades',
            options: [
                {
                    name: 'pair',
                    type: ApplicationCommandOptionType.String,
                    description: 'Trading pair (ex: cure_usdt)',
                    required: false
                },
                {
                    name: 'limit',
                    type: ApplicationCommandOptionType.Integer,
                    description: 'Number of trades to display',
                    required: false
                }
            ]
        },
        {
            name: 'pricealert',
            description: 'Set a price alert for a trading pair',
            options: [
                {
                    name: 'pair',
                    type: ApplicationCommandOptionType.String,
                    description: 'Trading pair (ex: cure_usdt, cure_btc)',
                    required: true
                },
                {
                    name: 'price',
                    type: ApplicationCommandOptionType.Number,
                    description: 'Price threshold',
                    required: true
                },
                {
                    name: 'above',
                    type: ApplicationCommandOptionType.Boolean,
                    description: 'Alert when price goes above threshold',
                    required: false
                },
                {
                    name: 'below',
                    type: ApplicationCommandOptionType.Boolean,
                    description: 'Alert when price goes below threshold',
                    required: false
                }
            ]
        }
    ];

    discord_client.guilds.cache.forEach(guild => {
        guild.commands.set(slashCommands);
    });

    const rest = new REST({version: '10'}).setToken(TOKEN);
    try {
        console.log("⏳ Refreshing slash commands...");
        const guildId = process.env.GUILD_ID;
        // Register for guild
        await rest.put(
            Routes.applicationGuildCommands(discord_client.application.id, guildId),
            {body: slashCommands}
        );

        await rest.put(
            Routes.applicationCommands(discord_client.application.id),
            {body: slashCommands}
        );
        console.log("✅ Slash commands registered.");
    } catch (err) {
        console.error(err);
    }
});

discord_client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.channel?.type === 1) { // DM channel
        if (!DM_COMMANDS.includes(interaction.commandName)) {
            return interaction.reply({
                content: 'This command is not available in DMs.',
                ephemeral: true
            });
        }
    }
    const handler = handlers[interaction.commandName];
    if (handler) handler(interaction);
});

discord_client.login(TOKEN);