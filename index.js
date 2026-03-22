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

// ── Links store ────────────────────────────────────────────────────────────────

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
// The content is a plain text string with markdown, multiple finds separated by \n
// Format per find:
//   **DisplayName(@RobloxUsername)** HAS FOUND **AuraName**, CHANCE OF **1 IN 540,000,000**
//
// We extract ALL finds from the content and return an array.

function parseAllFinds(data) {
    const content = data.content || '';
    if (!content) return [];

    const finds = [];

    // Match each individual find in the content string
    // Pattern: **anything(@RobloxUsername)** HAS FOUND **AuraName**, CHANCE OF **1 IN number**
    const pattern = /\*\*.+?\(@([^)]+)\)\*\*\s+HAS FOUND\s+\*\*(.+?)\*\*,\s+CHANCE OF\s+\*\*(1\s+IN\s+[\d,]+)\*\*/gi;

    let match;
    while ((match = pattern.exec(content)) !== null) {
        const robloxUsername = match[1].trim();
        const auraName       = match[2].trim();
        const chanceStr      = match[3].trim();
        const chance         = parseChance(chanceStr);

        if (chance) {
            finds.push({ robloxUsername, auraName, chance, chanceStr });
        }
    }

    return finds;
}

// ── Ping handler ───────────────────────────────────────────────────────────────

async function handleFind(data) {
    const finds = parseAllFinds(data);

    if (finds.length === 0) {
        console.log(`⚠️  Could not parse any finds from content`);
        return;
    }

    console.log(`📋  Parsed ${finds.length} find(s) from payload`);

    const links = loadLinks();

    for (const { robloxUsername, auraName, chance, chanceStr } of finds) {
        console.log(`🎯  ${robloxUsername} found ${auraName} (${chanceStr})`);

        // Skip if below global threshold
        const roleId = getRoleToPing(auraName, chance);
        if (!roleId) {
            console.log(`⏭️  Skipping ${robloxUsername} — below global threshold`);
            continue;
        }

        // Skip if user is not linked
        const discordUserId = links[robloxUsername.toLowerCase()];
        if (!discordUserId) {
            console.log(`⏭️  Skipping ${robloxUsername} — not linked`);
            continue;
        }

        // Build a clean embed matching Sol's Stat Tracker style
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({
                name: data.username || "Sol's Stat Tracker",
                iconURL: data.avatarURL || undefined,
            })
            .setDescription(
                `**${robloxUsername}** HAS FOUND **${auraName}**, CHANCE OF **${chanceStr}**`
            );

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
}

// ── Slash commands ─────────────────────────────────────────────────────────────

discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.guildId !== privateGuildId) return;

    const { commandName } = interaction;

    if (commandName === 'link') {
        const robloxUsername = interaction.options.getString('roblox_username').toLowerCase();
        const discordUser    = interaction.options.getUser('discord_user');

        await interaction.deferReply({ flags: 64 });

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

        await interaction.deferReply({ flags: 64 });

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
            await interaction.reply({ content: 'No linked users yet.', flags: 64 });
            return;
        }
        const list = entries.map(([r, d]) => `• **${r}** → <@${d}>`).join('\n');
        await interaction.reply({ content: `**Linked users:**\n${list}`, flags: 64 });
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
            const parsed = JSON.parse(rawData.toString('utf8'));
            console.log(`📩  WS message — action: ${parsed.action}`);

            switch (parsed.action) {
                case 'enabled':
                    console.log("Sol's Stat Tracker — Enabled");
                    break;
                case 'disabled':
                    console.log("Sol's Stat Tracker — Disabled");
                    break;
                case 'executeWebhook':
                    handleFind(parsed.data);
                    break;
                default:
                    console.error(`WS invalid action: ${parsed.action}`);
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
                console.error('API token already in-use. Waiting 35s then retrying...');
                setTimeout(connect, 35_000);
                return;
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

// ── Start ──────────────────────────────────────────────────────────────────────

discordClient.once(Events.ClientReady, () => {
    console.log(`✅  Discord bot logged in as ${discordClient.user.tag}`);
    const links = loadLinks();
    console.log(`👥  Linked users: ${Object.keys(links).join(', ') || 'none'}`);
    connect();
});

discordClient.login(botToken);
