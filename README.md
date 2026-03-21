# Sol's Stat Tracker Ping Bot

Built on top of the official [Sol's Stat Tracker Webhook](https://github.com/mongoo-se/sols-stat-tracker-webhook) by @mongoo.se.

Connects directly to the Sol's Stat Tracker WebSocket API. When a find comes in,
it forwards it to your webhook as normal **AND** checks if the Roblox player is
linked to a friend in your private server — if so, it pings the right role + their Discord.

No extra servers needed. No reading Discord messages. No ToS risk.

---

## How it works

```
Sol's Stat Tracker API (WebSocket)
        │
        ▼
  executeWebhook event
        │
        ├──► Forward to your webhook channel (as normal)
        │
        └──► Is the Roblox user linked?
                  │
              Yes ▼
             Is rarity ≥ 99,999,999?
                  │
              Yes ▼
             Pick role (CHALLENGED+ / CHALLENGED / Transcendent / Glorious)
                  │
                  ▼
             Ping role + Discord user in your private server
```

---

## Ping logic (one role, highest priority wins)

| Priority | Condition | Role pinged |
|---|---|---|
| 1 | Aura is OPPRESSION, Dreammetric, MONARCH, Oblivion, illusionary | @CHALLENGED+ |
| 2 | Aura is Glitch, Borealis, LEVIATHAN, Memory, Neferkhaf, Fragments of the Crimson Moon | @Challenged |
| 3 | Rarity 1/1,000,000,000+ | @Transcendent Ping |
| 4 | Rarity 1/99,999,999 – 999,999,999 | @Glorious Ping |

If the Roblox username is not linked to a Discord user, the ping is **skipped silently**.

---

## Setup

### 1 — Get your Sol's Stat Tracker API token
In the Sol's Stat Tracker Discord bot, run `/generatetoken`. Copy the token.

### 2 — Create a Discord webhook
In your server, go to any channel → Edit Channel → Integrations → Webhooks → New Webhook.
Copy the webhook URL. This is where all finds will be forwarded (the normal behaviour).

### 3 — Create a Discord bot (for the role pings)
1. Go to https://discord.com/developers/applications → **New Application** → name it
2. Left sidebar → **Bot** → **Reset Token** → copy it (`botToken`)
3. Also copy the **Application ID** from General Information (`clientId`)
4. Enable **MESSAGE CONTENT INTENT** under Privileged Gateway Intents ✅
5. Left sidebar → **OAuth2 → URL Generator**
   - Scopes: `bot` + `applications.commands`
   - Bot Permissions: `Send Messages` · `Mention Everyone` · `View Channels`
6. Use the generated URL to invite the bot to your private server

### 4 — Fill in config.js

Enable **Developer Mode** in Discord (Settings → Advanced → Developer Mode) to be
able to right-click and copy IDs.

Fill in the bottom half of `config.js`:

```js
"botToken":       "your bot token",
"clientId":       "your bot application ID",
"privateGuildId": "right-click your server icon → Copy Server ID",
"outputChannelId":"right-click your pings channel → Copy Channel ID",

"roles": {
    "glorious":       "right-click @Glorious Ping → Copy Role ID",
    "transcendent":   "right-click @Transcendent Ping → Copy Role ID",
    "challenged":     "right-click @Challenged → Copy Role ID",
    "challengedPlus": "right-click @CHALLENGED+ → Copy Role ID"
}
```

Also fill in the top half (original settings):
```js
"token":      "your Sol's Stat Tracker API token",
"webhookURL": "your Discord webhook URL",
```

### 5 — Install, register commands, and run

```
Double-click setup.bat       ← installs dependencies (run once)
Double-click register.bat    ← registers /link /unlink /links (run once)
Double-click run.bat         ← starts the bot
```

Or via terminal:
```bash
npm install
node register-commands.js   # once only
node .
```

---

## Slash commands (in your private server)

| Command | What it does |
|---|---|
| `/link roblox_username:X discord_user:@Y` | Link Roblox user X to Discord user Y |
| `/unlink roblox_username:X` | Remove the link for X |
| `/links` | Show all current links |

---

## Running 24/7

**On Windows** — just leave the terminal open, or use [NSSM](https://nssm.cc/) to run it as a Windows service.

**On a VPS/Linux** — use PM2:
```bash
npm install -g pm2
pm2 start index.js --name sols-ping-bot
pm2 save && pm2 startup
```

**Free cloud** — Railway, Render, or Fly.io all support Node.js.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `The API token is invalid` | Re-run `/generatetoken` in the Sol's Stat Tracker bot and update `token` in config.js |
| `The API token is already in-use` | Another instance is running. Stop it first, or set `reconnectOnDuplicateConnection: false` |
| Find arrives but no ping sent | Check the console — it will say either "below global threshold" or "not linked". Run `/links` to verify |
| Role not mentioned | Make sure the bot has **Mention @everyone, @here, and All Roles** in the output channel |
| `/link` not appearing | Run `register.bat` (or `node register-commands.js`) again and wait ~30 seconds |
