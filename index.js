// Sol's Stat Tracker Ping Bot
// Built on top of the official Sol's Stat Tracker Webhook Client by @mongoo.se

const WebSocket = require('ws');
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const https = require('https');

const {
    token,
    gatewayURL, maxReconnectInterval, reconnectOnDuplicateConnection,
    botToken, privateGuildId, outputChannelId, roles: roleIds,
    railwayApiToken, railwayServiceId, railwayEnvironmentId,
} = require('./config');

// ── Discord bot client ─────────────────────────────────────────────────────────

const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds],
});

discordClient.login(botToken);

discordClient.once(Events.ClientReady, () => {
    console.log(`✅  Discord bot logged in as ${discordClient.user.tag}`);
    const links = loadLinks();
    console.log(`👥  Linked users: ${Object.keys(links).join(', ') || 'none'}`);
});

// ── Links store (Railway environment variable) ────────────────────────────────
// Links are stored as a JSON string in the LINKS environment variable.
// e.g. LINKS = {"bobloqgc":"123456789","rogue":"987654321"}

function loadLinks() {
    try {
        const raw = process.env.LINKS;
        if (!raw || raw === '{}' || raw === '') return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

async function saveLinks(links) {
    // Update the LINKS env var in Railway via their API
    return new Promise((resolve, reject) => {
        const value = JSON.stringify(links);
        const body = JSON.stringify({
            query: `
                mutation upsertVariable {
                    variableCollectionUpsert(input: {
                        projectId: "${process.env.RAILWAY_PROJECT_ID}",
                        environmentId: "${railwayEnvironmentId}",
                        serviceId: "${railwayServiceId}",
                        variables: { LINKS: ${JSON.stringify(value)} }
                    })
                }
            `
        });

        const req = https.request({
            hostname: 'backboard.railway.app',
            path: '/graphql/v2',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${railwayApiToken}`,
                'Content-Length': Buffer.byteLength(body),
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.errors) {
                        console.error('Railway API error:', parsed.errors);
                        reject(parsed.errors);
                    } else {
                        // Update local env var so current process sees the change immediately
                        process.env.LINKS = value;
                        resolve();
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── Aura classification ────────────────────────────────────────────────────────

const CHALLENGED_AURAS = [
    'glitch',
    'borealis',
    'leviathan',
    'memory',
    'neferkhaf',
    'fragments of the crimson moon',
];

const CHALLENGED_PLUS_AURAS = [
    'oppression',
    'dreammetric',
    'monarch',
    'oblivion',
    'illusionary',
];

function parseChance(text) {
    const match = text.replace(/\s/g, '').match(/1IN([\d,]+)/i);
    if (!match) return null;
    return parseInt(match[1].replace(/,/g, ''), 10);
}

function getRoleToPing(auraName, chance) {
    const lower = auraName.toLowerCase().trim();
    if (CHALLENGED_PLUS_AURAS.includes(lower)) return roleIds.challengedPlus;
    if (CHALLENGED_AURAS.includes(lower))       return roleIds.challenged;
    if (chance >= 1_000_000_000)                return roleIds.transcendent;
    if (chance >= 99_999_999)                   return roleIds.glorious;
    return null;
}

// ── Payload parser ─────────────────────────────────────────────────────────────
// Embed description format:
//   "agony(@Bobloqgc) HAS FOUND Sailor : Admiral, CHANCE OF 1 IN 540,000,000"
//          ^^^^^^^^^^ real Roblox username (inside the brackets)

function parseWebhookPayload(data) {
    if (!data.embeds || data.embeds.length === 0) return null;

    const embed = data.embeds[0];
    const text  = embed.description || '';
    if (!text) return null;

    const pattern = /.+?\(@([^)]+)\)\s+HAS FOUND\s+(.+?),\s+CHANCE OF\s+(1\s+IN\s+[\d,]+)/i;
    const match = text.match(pattern);
    if (!match) return null;

    const robloxUsername = match[1].trim();
    const auraName       = match[2].trim();
    const chanceStr      = match[3].trim();
    const chance         = parseChance(chanceStr);

    if (!chance) return null;
    return { robloxUsername, auraName, chance, chanceStr };
}

// ── Ping handler ───────────────────────────────────────────────────────────────

async function handleFind(data) {
    const parsed = parseWebhookPayload(data);
    if (!parsed) return;

    const { robloxUsername, auraName, chance } = parsed;
    console.log(`🎯  ${robloxUsername} found ${auraName}`);

    const roleId = getRoleToPing(auraName, chance);
    if (!roleId) {
        console.log(`⏭️  Skipping — below global threshold`);
        return;
    }

    const links = loadLinks();
    const discordUserId = links[robloxUsername.toLowerCase()];
    if (!discordUserId) {
        console.log(`⏭️  Skipping — ${robloxUsername} is not linked`);
        return;
    }

    const src = data.embeds[0];
    const embed = new EmbedBuilder();

    if (src.description)        embed.setDescription(src.description);
    if (src.color)              embed.setColor(src.color);
    if (src.title)              embed.setTitle(src.title);
    if (src.url)                embed.setURL(src.url);
    if (src.author)             embed.setAuthor({ name: src.author.name, iconURL: src.author.icon_url, url: src.author.url });
    if (src.thumbnail?.url)     embed.setThumbnail(src.thumbnail.url);
    if (src.image?.url)         embed.setImage(src.image.url);
    if (src.footer)             embed.setFooter({ text: src.footer.text, iconURL: src.footer.icon_url });
    if (src.timestamp)          embed.setTimestamp(new Date(src.timestamp));
    if (src.fields?.length > 0) embed.addFields(src.fields);

    try {
        const outputChannel = await discordClient.channels.fetch(outputChannelId);
        await outputChannel.send({
            content: `<@&${roleId}> <@${discordUserId}>`,
            embeds: [embed],
        });
        console.log(`📨  Sent ping — ${robloxUsername} | ${auraName}`);
    } catch (err) {
        console.error(`❌  Failed to send ping: ${err.message}`);
    }
}

// ── Slash commands ─────────────────────────────────────────────────────────────

discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.guildId !== privateGuildId) return;

    const { commandName } = interaction;

    if (commandName === 'link') {
        const robloxUsername = interaction.options.getString('roblox_username').toLowerCase();
        const discordUser    = interaction.options.getUser('discord_user');

        await interaction.deferReply({ ephemeral: true });

        const links = loadLinks();
        links[robloxUsername] = discordUser.id;

        try {
            await saveLinks(links);
            await interaction.editReply({ content: `✅ Linked **${robloxUsername}** → ${discordUser}` });
        } catch {
            await interaction.editReply({ content: `❌ Failed to save — check Railway API token in config.` });
        }
    }

    else if (commandName === 'unlink') {
        const robloxUsername = interaction.options.getString('roblox_username').toLowerCase();

        await interaction.deferReply({ ephemeral: true });

        const links = loadLinks();
        if (!links[robloxUsername]) {
            await interaction.editReply({ content: `⚠️ **${robloxUsername}** is not linked.` });
            return;
        }

        delete links[robloxUsername];

        try {
            await saveLinks(links);
            await interaction.editReply({ content: `🗑️ Unlinked **${robloxUsername}**.` });
        } catch {
            await interaction.editReply({ content: `❌ Failed to save — check Railway API token in config.` });
        }
    }

    else if (commandName === 'links') {
        const links = loadLinks();
        const entries = Object.entries(links);
        if (entries.length === 0) {
            await interaction.reply({ content: 'No linked users yet.', ephemeral: true });
            return;
        }
        const list = entries.map(([r, d]) => `• **${r}** → <@${d}>`).join('\n');
        await interaction.reply({ content: `**Linked users:**\n${list}`, ephemeral: true });
    }
});

// ── WebSocket ──────────────────────────────────────────────────────────────────

let reconnectInterval = 31_000;

const connect = () => {
    const ws = new WebSocket(gatewayURL, {
        headers: { token }
    });

    ws.on('open', () => {
        console.log(`WS client connected: ${gatewayURL}`);
        reconnectInterval = 31_000;
    });

    ws.on('message', (rawData) => {
        try {
            rawData = JSON.parse(rawData.toString('utf8'));
            switch (rawData.action) {
                case 'enabled':
                    console.log("Sol's Stat Tracker — Enabled");
                    break;
                case 'disabled':
                    console.log("Sol's Stat Tracker — Disabled");
                    break;
                case 'executeWebhook':
                    handleFind(rawData.data);
                    break;
                default:
                    console.error(`WS invalid action: ${rawData.action}`);
            }
        } catch (error) {
            console.error(`WS message error: ${error.message}`);
        }
    });

    ws.on('close', async (code, reason) => {
        reason = reason.toString('utf8');
        console.warn(`WS disconnected: Code ${code}${reason ? ` - ${reason}` : ''}`);
        switch (code) {
            case 4001: console.error('API token missing. Stopping.'); return;
            case 4002: console.error('API token invalid. Stopping.'); return;
            case 4004: console.error('API token deleted. Stopping.'); return;
            case 4003:
                console.error('API token already in-use.');
                if (!reconnectOnDuplicateConnection) return;
            default:
                console.warn(`Reconnecting in ${reconnectInterval}ms...`);
                setTimeout(connect, reconnectInterval);
                reconnectInterval = Math.min(maxReconnectInterval, reconnectInterval * 2);
        }
    });

    ws.on('error', (error) => {
        console.error(`WS error: ${error.message}`);
        ws.terminate();
    });
};

connect();
