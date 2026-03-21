const config = {
    // ── ORIGINAL SOL'S STAT TRACKER SETTINGS ─────────────────────────────────

    // AUTHENTICATION (REQUIRED)
    "token": "EKFJhfnbQw!4bwg@HEi$cQpkFRV$pDOP0#Yd^Qi6jtOkT5^Dh6KjKnf1hY2d*8T*BsqrNycP@VnKmB8erL#GuvFV50dU1LA0rs0q#kj0zAjz83n1XVJaIa1r0gqWw*R&",   // From /generatetoken in the Sol's Stat Tracker bot
    "webhookURL": "https://discord.com/api/webhooks/1444424947450511390/LdzYJ-X2IhdRuda7BByHWAcCZRfKbl8C7Ed-Mi4mjelrRdmHl5XjsHPwIVocxgdoHfaz",                // Webhook in your server to forward all finds to

    // WEBHOOK USER (OPTIONAL)
    "overrideUsername": null,
    "overrideAvatarURL": null,

    "colors": {
        "success": "#6ab183",
        "error": "#d85a4b",
        "none": "#777f8d"
    },

    "emojis": {
        "success": "<:green_tick:1365702693326422026>",
        "error": "<:red_tick:1365702694727188491>",
        "none": "<:gray_tick:1365702690985738390>"
    },

    // ADVANCED CONFIGURATION (OPTIONAL) — DO NOT CHANGE UNLESS YOU KNOW WHAT YOU'RE DOING
    "gatewayURL": "wss://api.mongoosee.com/solsstattracker/v2/gateway",
    "maxReconnectInterval": 120000,
    "reconnectOnDuplicateConnection": false,
    "verboseLogging": true,


    // ── YOUR PING BOT SETTINGS ────────────────────────────────────────────────

    // Your Discord bot token (from discord.com/developers)
    "botToken": "MTQ4NDkzMDEyMTk1Njg1NTk2MA.Gtpj9-.gxq15sAskZlx1KYC0MvE0hnFxcKo2_pmBSefls",

    // Your bot's Application ID (from discord.com/developers → General Information)
    "clientId": "1484930121956855960",

    // Your private server's ID (right-click server icon → Copy Server ID)
    "privateGuildId": "1444345103866003479",

    // The channel in your private server where pings will be sent
    "outputChannelId": "1444382249624670370",

    // Role IDs in your private server (right-click role → Copy Role ID)
    "roles": {
        "glorious":       "1464542546020667600",
        "transcendent":   "1464542111188652154",
        "challenged":     "1464542675880513744",
        "challengedPlus": "1464542827122917608"
    }
};

module.exports = config;
