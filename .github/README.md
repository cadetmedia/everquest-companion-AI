# EQ Legends Companion AI

A Windows desktop companion for **EverQuest Legends** that reads the log file the game already
writes and turns it into live views: a DPS meter, floating overlays, quest, loot and gear
tracking, alerts, and an **AI assistant** you can ask about your character without tabbing out.

It is built on [**EQ Legends Companion**](https://github.com/jmoyers/everquest-companion) by
**Josh Moyers**, who built the app, its engine and almost everything in it, and on the
[**community edition**](https://github.com/kaltinril/everquest-companion) that keeps it moving
while he is away. All the credit for the app is theirs; this build adds the AI assistant.

**It only reads your log.** Nothing is injected into EverQuest, no game files are touched, no
memory is read, and nothing is automated or played for you.

## Install (Windows)

**Requires 64-bit Windows 10 or 11.**

1. Go to the [**Releases page**](https://github.com/cadetmedia/everquest-companion-AI/releases/latest)
   and download **`everquest-companion-ai-Setup-<version>.exe`** (under *Assets*).
2. Run it. It is a one-click install: no admin prompt, no wizard, and it adds a desktop and
   Start-menu shortcut.
3. Windows SmartScreen will say **"Windows protected your PC"** the first time, because the build
   is not code-signed. Click **More info**, then **Run anyway**. You only see this once.
4. In EverQuest, type **`/log on`**. The app finds your log folder on its own; if your game lives
   somewhere unusual, point it at the `Logs` folder in **Preferences**.
5. For overlays over the game, run EverQuest in **windowed** or **borderless** mode (exclusive
   fullscreen cannot be drawn over by anything).

It installs **beside** the official app and the community TEST build, with its own settings, so
none of them overwrite each other. The first launch copies your settings from the official app if
you have it.

**Updates are automatic.** The app checks the Releases page every few hours, downloads a newer
build quietly, and applies it when you close the app.

**Checking the download** (optional): each release has `SHA256SUMS.txt`. In PowerShell,
`Get-FileHash .\everquest-companion-ai-Setup-<version>.exe` should print the same value.

## Turning on the AI assistant

1. Get an API key from [OpenRouter](https://openrouter.ai/keys) (one account, many models; two of
   the eight on offer are free, rate-limited).
2. In the app, open **Preferences → AI Assistant**, paste the key, pick a model, tick the box
   saying you understand what is sent, and **Save**. The key is stored encrypted on your PC and
   sent only to OpenRouter.
3. Open **AI Assistant** in the side menu (under the **AI** heading). The bar under the chat shows
   which model is answering and what the key has spent.
4. Ask away: items, spells, mobs, your current fight, this zone, your buffs, loot, loadout and AA.
   Answers come from the app's own data and your log, not from a live wiki fetch. For your bags or
   spellbook, type `/outputfile inventory` or `/outputfile spellbook` in game first.
5. Want it over the game? Open the title bar's **Overlay** menu and tick **AI Assistant**. It opens
   at the left edge; drag it anywhere, and lock it (📌) to show just the last answer.

What the assistant sends to the model: your question, a short recap of the last few minutes of
combat and zone events, your character's name and server, zone, buffs, recent loot, your current
fight (including the names in it), and an `/outputfile` dump when it needs one. Never raw log
lines or chat.

## What else it adds to the official app

Everything the [community edition](https://github.com/kaltinril/everquest-companion#what-the-community-edition-adds)
adds: Bazaar, Factions, Achievements and Unlocks tabs, a full Spells area, gear and exaltation
planning, map routes and pins, a Sky quests overlay, the log archive, the screenshot reader, and
fixes for the game's October patches. Each release's notes list what changed.

## Reporting a problem

Open an issue on [**this repo's Issues page**](https://github.com/cadetmedia/everquest-companion-AI/issues).

## The original app

- **Its README**, unchanged, is [README.md](../README.md) in this repo.
- **Its repo** is [jmoyers/everquest-companion](https://github.com/jmoyers/everquest-companion);
  the community edition is [kaltinril/everquest-companion](https://github.com/kaltinril/everquest-companion).

## License

The same as the original: [FSL-1.1-MIT](../LICENSE), copyright 2026 Josh Moyers. The licence
permits sharing and changing the app for any purpose other than a competing commercial product.
