// Sol's Stat Tracker Ping Bot
// Built on top of the official Sol's Stat Tracker Webhook Client by @mongoo.se
// Intercepts executeWebhook payloads, checks linked users, and pings roles in your private server.

const WebSocket = require('ws');
const { Client, GatewayIntentBits, Events, WebhookClient, EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const {
    token, webhookURL,
    overrideUsername, overrideAvatarURL, colors, emojis,
    gatewayURL, maxReconnectInterval, reconnectOnDuplicateConnection, verboseLogging,
    // Your additions:
    botToken, privateGuildId, outputChannelId, roles: roleIds
} = require('./config');

// ── Discord bot client (for pinging roles + users in your private server) ─────

const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds],
});

discordClient.login(botToken);

discordClient.once(Events.ClientReady, () => {
    console.log(`✅  Discord bot logged in as ${discordClient.user.tag}`);
});

// ── Webhook client (passes through all finds to your webhook as normal) ────────

const webhookClient = new WebhookClient({ url: webhookURL });

webhookClient.on(Events.Error, (error) => {
    console.error(`ID: ${webhookClient.id} | Webhook client error: ${error.message}`);
});

// ── Links store ────────────────────────────────────────────────────────────────
// links.json → { "robloxusername_lowercase": "DiscordUserID", ... }

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

function getTierLabel(auraName, chance) {
    const lower = auraName.toLowerCase().trim();
    if (CHALLENGED_PLUS_AURAS.includes(lower)) return '🔥 CHALLENGED+';
    if (CHALLENGED_AURAS.includes(lower))       return '⚡ CHALLENGED';
    if (chance >= 1_000_000_000)                return '🌌 TRANSCENDENT';
    if (chance >= 99_999_999)                   return '✨ GLORIOUS';
    return '';
}

// ── Payload parser ─────────────────────────────────────────────────────────────
// The executeWebhook payload contains Discord embeds.
// The embed description looks like:
//   "Zune(@Hoangvn150) HAS FOUND Impeached, CHANCE OF 1 IN 200,000,000"

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
    if (!parsed) return; // Not an aura-find message (e.g. enabled/disabled status)

    const { robloxUsername, auraName, chance, chanceStr } = parsed;
    console.log(`🎯  ${robloxUsername} found ${auraName} (${chanceStr})`);

    // Skip if below global threshold
    const roleId = getRoleToPing(auraName, chance);
    if (!roleId) {
        console.log(`⏭️  Skipping — below global threshold`);
        return;
    }

    // Skip if the user is not linked
    const links = loadLinks();
    const discordUserId = links[robloxUsername.toLowerCase()];
    if (!discordUserId) {
        console.log(`⏭️  Skipping — ${robloxUsername} is not linked`);
        return;
    }

    const roleMention = `<@&${roleId}>`;
    const userMention = `<@${discordUserId}>`;
    const tierLabel   = getTierLabel(auraName, chance);

    const pingMessage = [
        `${roleMention} ${userMention}`,
        `> ${tierLabel}`,
        `> **${robloxUsername}** found **${auraName}**`,
        `> Chance: **${chanceStr}**`,
    ].join('\n');

    try {
        const outputChannel = await discordClient.channels.fetch(outputChannelId);
        await outputChannel.send(pingMessage);
        console.log(`📨  Sent ping — ${robloxUsername} | ${auraName}`);
    } catch (err) {
        console.error(`❌  Failed to send ping: ${err.message}`);
    }
}

// ── Slash commands (/link, /unlink, /links) ────────────────────────────────────

discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.guildId !== privateGuildId) return; // Only in your private server

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

// ── WebSocket (official Sol's Stat Tracker gateway) ───────────────────────────

let reconnectInterval = 31_000;

const connect = () => {
    const ws = new WebSocket(gatewayURL, {
        headers: { token }
    });

    ws.on('open', () => {
        console.log(`ID: ${webhookClient.id} | WS client connected: ${gatewayURL}`);
        reconnectInterval = 31_000;

        setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
                const connectedEmbed = new EmbedBuilder()
                    .setDescription(`${emojis.success} **Sol's Stat Tracker** - Connected`)
                    .setColor(colors.success);

                if (verboseLogging) webhookClient.send({ embeds: [connectedEmbed] });
            }
        }, 1_000);
    });

    ws.on('message', (rawData) => {
        try {
            rawData = JSON.parse(rawData.toString('utf8'));

            switch (rawData.action) {
                case 'enabled': {
                    const enabledEmbed = new EmbedBuilder()
                        .setDescription(`${emojis.success} **Sol's Stat Tracker** - Enabled`)
                        .setColor(colors.success);
                    webhookClient.send({ embeds: [enabledEmbed] });
                    break;
                }
                case 'disabled': {
                    const disabledEmbed = new EmbedBuilder()
                        .setDescription(`${emojis.error} **Sol's Stat Tracker** - Disabled`)
                        .setColor(colors.error);
                    webhookClient.send({ embeds: [disabledEmbed] });
                    break;
                }
                case 'executeWebhook': {
                    rawData.data.username        = overrideUsername  ?? rawData.data.username;
                    rawData.data.avatarURL        = overrideAvatarURL ?? rawData.data.avatarURL;
                    rawData.data.allowedMentions  = { parse: [] };

                    // 1. Forward to your webhook channel as normal
                    webhookClient.send(rawData.data);

                    // 2. Check if we should ping anyone in your private server
                    handleFind(rawData.data);
                    break;
                }
                default:
                    console.error(`ID: ${webhookClient.id} | WS client invalid action: ${rawData.action}`);
                    break;
            }
        } catch (error) {
            console.error(`ID: ${webhookClient.id} | WS client message error: ${error.message}`);
        }
    });

    ws.on('close', async (code, reason) => {
        reason = reason.toString('utf8');
        console.warn(`ID: ${webhookClient.id} | WS client disconnected: Code ${code}${reason ? ` - ${reason}` : ''}`);

        switch (code) {
            case 4001:
                console.error('The API token is missing.');
                if (verboseLogging) await webhookClient.send({ embeds: [new EmbedBuilder().setDescription(`${emojis.error} **Sol's Stat Tracker** - The API token is missing.`).setColor(colors.error)] });
                return;
            case 4002:
                console.error('The API token is invalid.');
                if (verboseLogging) await webhookClient.send({ embeds: [new EmbedBuilder().setDescription(`${emojis.error} **Sol's Stat Tracker** - The API token is invalid.`).setColor(colors.error)] });
                return;
            case 4004:
                console.error('The API token has been deleted.');
                if (verboseLogging) await webhookClient.send({ embeds: [new EmbedBuilder().setDescription(`${emojis.error} **Sol's Stat Tracker** - The API token has been deleted.`).setColor(colors.error)] });
                return;
            case 4003:
                console.error('The API token is already in-use.');
                if (verboseLogging) await webhookClient.send({ embeds: [new EmbedBuilder().setDescription(`${emojis.error} **Sol's Stat Tracker** - The API token is already in-use.`).setColor(colors.error)] });
                if (!reconnectOnDuplicateConnection) return;
            default:
                console.warn(`ID: ${webhookClient.id} | Reconnecting WS client in ${reconnectInterval}ms...`);
                if (verboseLogging) await webhookClient.send({ embeds: [new EmbedBuilder().setDescription(`${emojis.none} **Sol's Stat Tracker** - Reconnecting`).setColor(colors.none)] });
                setTimeout(connect, reconnectInterval);
                reconnectInterval = Math.min(maxReconnectInterval, reconnectInterval * 2);
        }
    });

    ws.on('error', async (error) => {
        console.error(`ID: ${webhookClient.id} | WS client error: ${error.message}`);
        ws.terminate();
    });
};

connect();
