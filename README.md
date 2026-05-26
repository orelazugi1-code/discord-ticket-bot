# Discord Ticket Bot + Dashboard

A full Discord bot with ticket system, custom commands, and a web dashboard — built with discord.js v14, Express, and SQLite.

---

## Prerequisites

- Node.js v18 or later
- A Discord application (bot + OAuth2 configured)

---

## Step-by-step Setup

### 1. Create a Discord Application

1. Go to https://discord.com/developers/applications and click **New Application**.
2. Name it and click **Create**.
3. Go to **Bot** → click **Add Bot**.
4. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent**
   - **Message Content Intent**
5. Copy the **Bot Token** (you'll need it shortly).

### 2. Configure OAuth2

1. In your application, go to **OAuth2 → General**.
2. Add a Redirect URI: `http://localhost:3000/auth/callback`
3. Copy your **Client ID** and **Client Secret**.

### 3. Invite the Bot

Use this URL (replace `CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

Permission integer `8` = Administrator (required to manage channels and permissions).

### 4. Fill in the .env file

Open `.env` and fill in every value:

```env
BOT_TOKEN=       # Bot Token from Step 1
CLIENT_ID=       # Application Client ID
CLIENT_SECRET=   # Application Client Secret
GUILD_ID=        # Right-click your server → Copy Server ID
REDIRECT_URI=    # http://localhost:3000/auth/callback
SESSION_SECRET=  # Any long random string, e.g. openssl rand -hex 32
PORT=3000
```

### 5. Install dependencies

```bash
npm install
```

### 6. Run the bot

```bash
node index.js
```

The bot will log in, register slash commands to your guild, and start listening.

### 7. Run the dashboard (separate terminal)

```bash
node dashboard/server.js
```

Visit http://localhost:3000 and click **Login with Discord**.

---

## Bot Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/ticket-setup` | Post the ticket panel in a channel | Administrator |
| `/close [reason]` | Close the current ticket | Manage Channels |
| `/add-user @user` | Add a user to the current ticket | Manage Channels |
| `/remove-user @user` | Remove a user from the current ticket | Manage Channels |
| `/ticket-stats` | View ticket statistics | Manage Channels |
| `/add-command` | Add a custom !command | Administrator |
| `/remove-command` | Remove a custom !command | Administrator |
| `/commands` | List all custom commands | Everyone |

Custom commands are triggered with `!commandname` in chat.

---

## Dashboard Features

| Page | What you can do |
|------|-----------------|
| **Overview** | See total, open, and closed ticket counts at a glance |
| **Tickets** | Browse all tickets, filter by status, open HTML transcript |
| **Commands** | Add/remove custom !commands, mark them admin-only |
| **Settings** | Edit panel message, max tickets, auto-close hours, channel/role IDs |

Only Discord users who are **Administrator** in a server can see it in the dashboard.

---

## File Structure

```
discord-bot/
├── index.js                  ← Bot entry point
├── .env                      ← Configuration (never commit this)
├── package.json
├── src/
│   ├── database.js           ← SQLite schema + all DB helpers
│   ├── commands/
│   │   ├── ticket-setup.js
│   │   ├── close.js
│   │   ├── add-user.js
│   │   ├── remove-user.js
│   │   ├── ticket-stats.js
│   │   ├── add-command.js
│   │   ├── remove-command.js
│   │   └── commands.js
│   ├── handlers/
│   │   ├── buttonHandler.js  ← Handles button interactions
│   │   └── modalHandler.js   ← Handles modal submissions
│   └── utils/
│       ├── transcript.js     ← HTML transcript generator
│       └── ticketManager.js  ← closeTicketChannel() shared logic
├── dashboard/
│   ├── server.js             ← Express server + OAuth2
│   └── public/
│       ├── index.html        ← Login page
│       └── dashboard.html    ← Full SPA dashboard
├── data/                     ← SQLite database (auto-created)
└── transcripts/              ← HTML transcripts (auto-created)
```

---

## Transcript System

Every message sent inside a ticket channel is recorded in the database. When a ticket is closed (via `/close` or the button), an HTML transcript is generated in `transcripts/` and its path is stored in the database. The dashboard's **Transcript** button opens it in a new tab — or regenerates it on the fly if the file is missing.

---

## Auto-Close

Set **Auto-close after (hours)** in the dashboard Settings tab to a non-zero value. The bot checks every hour and closes tickets older than that threshold, logging the event and saving a transcript automatically.

---

## Security Notes

- `.env` is listed in `.gitignore` — never commit it.
- The dashboard session uses `SESSION_SECRET` — set this to a long, random string in production.
- All dashboard API routes verify both authentication (Discord session) and that the user is an administrator of the requested guild.
- Set `cookie.secure = true` in `dashboard/server.js` if you deploy behind HTTPS.
