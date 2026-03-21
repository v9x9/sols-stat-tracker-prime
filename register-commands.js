/**
 * register-commands.js
 * Run this ONCE to register /link, /unlink, /links slash commands to your private server.
 *
 *   node register-commands.js
 */

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { botToken, clientId, privateGuildId } = require('./config');

const commands = [
    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link a Roblox username to a Discord user')
        .addStringOption(o =>
            o.setName('roblox_username')
             .setDescription('Exact Roblox username (case-insensitive)')
             .setRequired(true))
        .addUserOption(o =>
            o.setName('discord_user')
             .setDescription('The Discord user to link')
             .setRequired(true)),

    new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Remove a Roblox → Discord link')
        .addStringOption(o =>
            o.setName('roblox_username')
             .setDescription('Roblox username to unlink')
             .setRequired(true)),

    new SlashCommandBuilder()
        .setName('links')
        .setDescription('List all linked Roblox → Discord users'),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(botToken);

(async () => {
    try {
        console.log('📡  Registering slash commands to your private server...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, privateGuildId),
            { body: commands },
        );
        console.log('✅  Done! Commands will appear in your server within seconds.');
    } catch (err) {
        console.error('❌  Error:', err);
    }
})();
