# 🍅 Pomo Timer — Obsidian Plugin

A Pomodoro timer panel for [Obsidian](https://obsidian.md), inspired by the [pomo](https://github.com/Bahaaio/pomo) terminal timer by Bahaa El Deen Mohamed.

> This plugin is an **independent Obsidian reimplementation** of the pomo concept. All plugin code is original JavaScript written for the Obsidian API. No source code was copied from the pomo repository.

---

## Features

| Feature | Detail |
|---|---|
| ⏱ **Work / Break cycles** | Configurable work, short break, and long break durations |
| 🔁 **Auto long break** | Long break triggers automatically after N pomodoros (default: 4) |
| ✏️ **Click-to-edit time** | Click the clock face to type any custom duration (`25`, `10:30`, etc.) |
| 🏷 **Quick-set chips** | One-click preset buttons (1m, 5m, 25m…) — add or remove your own |
| 💾 **Remembers last time** | The timer restores the last manually-set duration on relaunch |
| 📊 **Stats panel** | Today's pomodoros, focus time, break time, day streak |
| 📅 **Weekly bar chart** | 7-day pomodoro history |
| 🗓 **4-month heatmap** | GitHub-style activity grid |
| 🔔 **Notifications** | Obsidian Notice + system desktop notification |
| 🎨 **Theme-aware** | All colors follow your Obsidian accent color — no hardcoded values |
| ⌨️ **Commands** | Play/Pause, Skip, Reset, Open panel — all bindable via hotkeys |

---

## Screenshots

<img width="1932" height="1764" alt="CleanShot 2026-04-25 at 14 41 45@2x" src="https://github.com/user-attachments/assets/17f3df56-fd69-49a2-bcee-a2ca455af800" />

---

## Installation

### Manual (recommended while unlisted)

1. Download the [latest release](../../releases/latest) and unzip it.
2. Copy the folder into your vault's plugin directory:
   ```
   <your-vault>/.obsidian/plugins/pomo-timer/
   ```
3. In Obsidian: **Settings → Community Plugins → toggle Pomo Timer on**.

### BRAT (Beta Reviewers Auto-update Tool)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Community Plugins browser.
2. Open BRAT settings → **Add Beta Plugin** → paste this repo URL.
3. Enable the plugin in Community Plugins.

---

## Usage

### Opening the panel
- Click the 🍅 icon in the left ribbon, **or**
- Run **Pomo Timer: Open Pomo panel** from the Command Palette (`Cmd/Ctrl + P`)

### Timer controls

| Action | How |
|---|---|
| Start / Pause | Click the ▶ / ⏸ button, or use the command |
| Reset | Click ↺ to reset the current session |
| Skip | Click ⏭ to jump to the next session |
| Set custom time | Click the time display (only when stopped/paused), type a duration |
| Quick-set | Click any preset chip (e.g. **5m**) |
| Add preset | Click **+** next to the chips, enter minutes, press ✓ |
| Remove preset | Click **×** on a chip |

### Sessions cycle

```
Work → Short Break → Work → Short Break → Work → Short Break → Work → Long Break → …
```

### Collapsible panels
Click **Today**, **This week**, or **4-month activity** to expand/collapse the stats sections.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Work duration | 25 min | Length of each work session |
| Short break | 5 min | Length of each short break |
| Long break | 20 min | Length of each long break |
| Long break interval | 4 | Sessions before triggering a long break |
| On session end | Ask me | Show a confirmation dialog, or auto-start next session |
| Desktop notifications | On | System notification when a session ends |

---

## Commands

All commands are accessible via `Cmd/Ctrl + P` and can be assigned custom hotkeys in **Settings → Hotkeys**.

- `Pomo Timer: Play / Pause`
- `Pomo Timer: Skip session`
- `Pomo Timer: Reset timer`
- `Pomo Timer: Open Pomo panel`

---

## Attribution

This plugin is inspired by **[pomo](https://github.com/Bahaaio/pomo)** — a beautiful terminal Pomodoro timer built with Go and Bubble Tea by [Bahaa El Deen Mohamed](https://github.com/Bahaaio), licensed under the [MIT License](https://github.com/Bahaaio/pomo/blob/main/LICENSE).

The concept, feature set, and UX flow of this plugin are modelled after the pomo CLI. All Obsidian plugin code is original.

---

## License

MIT © 2026 yaccoon — see [LICENSE](LICENSE) for details.
