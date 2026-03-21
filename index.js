// Sol's Stat Tracker Ping Bot
// Built on top of the official Sol's Stat Tracker Webhook Client by @mongoo.se

const WebSocket = require('ws');
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const {
    token, colors, emojis,
    gatewayURL, maxReconnectInterval, reconnectOnDuplicateConnection, verboseLogging,
    botToken, privateGuildId, outputChannelId, roles: roleIds
} = require('./config');

// ── Discord bot client ─────────────────────────────────────────────────────────

const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds],
});

discordClient.login(botToken);

discordClient.once(Events.ClientReady, () => {
    console.log(`✅  Discord bot logged in as ${discordClient.user.tag}`);
});

// ── Links store ────────────────────────────────────────────────────────────────

const LINKS_FILE = path.join(__dirname, 'links.json');

function loadLinks() {
    if (!fs.existsSync(LINKS_FILE)) return {};
    return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
}

function saveLinks(data) {
    fs.writeFileSync(LINKS_FILE, JSON.stringify(data, null, 2));
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

function parseWebhookPayload(data) {
    if (!data.embeds || data.embeds.length === 0) return null;

    const embed = data.embeds[0];
    const text  = embed.description || '';
    if (!text) return null;

    const pattern = /^(.+?)(?:\(@[^)]+\))?\s+HAS FOUND\s+(.+?),\s+CHANCE OF\s+(1\s+IN\s+[\d,]+)/i;
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

    // Skip if below global threshold
    const roleId = getRoleToPing(auraName, chance);
    if (!roleId) {
        console.log(`⏭️  Skipping — below global threshold`);
        return;
    }

    // Skip if user is not linked
    const links = loadLinks();
    const discordUserId = links[robloxUsername.toLowerCase()];
    if (!discordUserId) {
        console.log(`⏭️  Skipping — ${robloxUsername} is not linked`);
        return;
    }

    // Rebuild the exact same embed Sol's Stat Tracker sends
    const src = data.embeds[0];
    const embed = new EmbedBuilder();

    if (src.description)            embed.setDescription(src.description);
    if (src.color)                  embed.setColor(src.color);
    if (src.title)                  embed.setTitle(src.title);
    if (src.url)                    embed.setURL(src.url);
    if (src.author)                 embed.setAuthor({ name: src.author.name, iconURL: src.author.icon_url, url: src.author.url });
    if (src.thumbnail?.url)         embed.setThumbnail(src.thumbnail.url);
    if (src.image?.url)             embed.setImage(src.image.url);
    if (src.footer)                 embed.setFooter({ text: src.footer.text, iconURL: src.footer.icon_url });
    if (src.timestamp)              embed.setTimestamp(new Date(src.timestamp));
    if (src.fields?.length > 0)     embed.addFields(src.fields);

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
        const robloxUsername = interaction.options.getString('roblox_username');
        const discordUser    = interaction.options.getUser('discord_user');
        const links = loadLinks();
        links[robloxUsername.toLowerCase()] = discordUser.id;
        saveLinks(links);
        await interaction.reply({ content: `✅ Linked **${robloxUsername}** → ${discordUser}`, ephemeral: true });
    }

    else if (commandName === 'unlink') {
        const robloxUsername = interaction.options.getString('roblox_username');
        const links = loadLinks();
        if (!links[robloxUsername.toLowerCase()]) {
            await interaction.reply({ content: `⚠️ **${robloxUsername}** is not linked.`, ephemeral: true });
            return;
        }
        delete links[robloxUsername.toLowerCase()];
        saveLinks(links);
        await interaction.reply({ content: `🗑️ Unlinked **${robloxUsername}**.`, ephemeral: true });
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
        console.log(`ID: ${discordClient.user?.id ?? 'pending'} | WS client connected: ${gatewayURL}`);
        reconnectInterval = 31_000;
    });

    ws.on('message', (rawData) => {
        try {
            rawData = JSON.parse(rawData.toString('utf8'));

            switch (rawData.action) {
                case 'enabled':
                    console.log('Sol\'s Stat Tracker — Enabled');
                    break;
                case 'disabled':
                    console.log('Sol\'s Stat Tracker — Disabled');
                    break;
                case 'executeWebhook': {
                    // Only check if a linked friend got the aura — no webhook forwarding
                    handleFind(rawData.data);
                    break;
                }
                default:
                    console.error(`WS client invalid action: ${rawData.action}`);
                    break;
            }
        } catch (error) {
            console.error(`WS client message error: ${error.message}`);
        }
    });

    ws.on('close', async (code, reason) => {
        reason = reason.toString('utf8');
        console.warn(`WS client disconnected: Code ${code}${reason ? ` - ${reason}` : ''}`);

        switch (code) {
            case 4001:
                console.error('The API token is missing. Bot stopping.');
                return;
            case 4002:
                console.error('The API token is invalid. Bot stopping.');
                return;
            case 4004:
                console.error('The API token has been deleted. Bot stopping.');
                return;
            case 4003:
                console.error('The API token is already in-use.');
                if (!reconnectOnDuplicateConnection) return;
            default:
                console.warn(`Reconnecting in ${reconnectInterval}ms...`);
                setTimeout(connect, reconnectInterval);
                reconnectInterval = Math.min(maxReconnectInterval, reconnectInterval * 2);
        }
    });

    ws.on('error', async (error) => {
        console.error(`WS client error: ${error.message}`);
        ws.terminate();
    });
};

connect();
