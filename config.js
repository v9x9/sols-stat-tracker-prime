const config = {
    // ── ORIGINAL SOL'S STAT TRACKER SETTINGS ─────────────────────────────────

    "token":      process.env.SOL_TOKEN,
    "webhookURL": process.env.WEBHOOK_URL,

    "overrideUsername":  null,
    "overrideAvatarURL": null,

    "colors": {
        "success": "#6ab183",
        "error":   "#d85a4b",
        "none":    "#777f8d"
    },

    "emojis": {
        "success": "<:green_tick:1365702693326422026>",
        "error":   "<:red_tick:1365702694727188491>",
        "none":    "<:gray_tick:1365702690985738390>"
    },

    "gatewayURL":                     "wss://api.mongoosee.com/solsstattracker/v2/gateway",
    "maxReconnectInterval":           120000,
    "reconnectOnDuplicateConnection": false,
    "verboseLogging":                 true,


    // ── YOUR PING BOT SETTINGS ────────────────────────────────────────────────

    "botToken":        process.env.BOT_TOKEN,
    "clientId":        process.env.CLIENT_ID,
    "privateGuildId":  process.env.PRIVATE_GUILD_ID,
    "outputChannelId": process.env.OUTPUT_CHANNEL_ID,

    "roles": {
        "glorious":       process.env.ROLE_GLORIOUS,
        "transcendent":   process.env.ROLE_TRANSCENDENT,
        "challenged":     process.env.ROLE_CHALLENGED,
        "challengedPlus": process.env.ROLE_CHALLENGED_PLUS,
    },


    // ── RAILWAY API (for saving /link data permanently) ───────────────────────

    "railwayApiToken":      process.env.RAILWAY_API_TOKEN,
    "railwayServiceId":     process.env.RAILWAY_SERVICE_ID,
    "railwayEnvironmentId": process.env.RAILWAY_ENVIRONMENT_ID,
};

module.exports = config;
