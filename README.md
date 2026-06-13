> Languages: **English** | [简体中文](README.zh-CN.md)

# Absolute Majority

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

An AI-driven political simulation game set in a fictional Japanese parliament of 2058. You play as a newly elected member of the House of Representatives — not the Prime Minister, not a party leader, just one rookie MP among 200 — and navigate factional struggles, coalition politics, committee battles, media wars, and backroom deals.

Every event, line of dialogue, and choice is generated live by an LLM (any OpenAI-compatible API), grounded by a deterministic rule engine that enforces parliamentary procedure. When no LLM is configured, the game falls back to rule-based text so it always runs.

## Features

- **AI-driven narrative** — Events, dialogues, and choices are produced by an LLM in real time, adapting to the current political situation, the congressional season, and your character's background.
- **Full parliamentary simulation** — A 200-seat House of Representatives, 9 standing committees, no-confidence motions, bill decision chains, and tiered vote thresholds (simple / absolute / supermajority).
- **Faction system** — Internal party factions with loyalty, ambition, and the ability to challenge the party leader. One party (ULP) runs on democratic centralism and forbids factions.
- **Seasonal congressional calendar** — The year is split into four sessions that change what is possible: a budget battle (Jan–Mar), a legislative push (Apr–Jun), a constituency recess (Jul–Sep), and an extraordinary session (Oct–Dec).
- **Dual career tracks** — Climb the party ladder and the parliamentary ladder independently; becoming a minister ≠ becoming party leader.
- **Government formation** — Post-election coalition negotiations, cabinet allocation, and prime-minister designation.
- **Galgame-style dialog** — Political events unfold as visual-novel-style conversations with choices and consequences.
- **Character creation** — Define your name, age, gender, party, personality traits, ideology, and background; your background shapes the events you encounter.

## The World

**Setting:** Fictional Japan, 2058. Parliamentary cabinet system. The House of Representatives is the only playable chamber.

**Term:** 4 years = 48 turns. 1 turn = 1 month. The game starts in January of the budget-battle session.

**Six original parties** (no real-world parties or politicians):

| Party | Abbr. | Ideology | Base seats |
|-------|-------|----------|-----------|
| Reform Democratic Party | RDP | Center | 54 |
| Liberty Party | LP | Right | 40 |
| National Conservative Party | NCP | Center-right | 38 |
| Social Alliance | SA | Center-left | 29 |
| First Citizens Front | FCF | Far-right | 24 |
| United Labor Party | ULP | Left | 14 |

You are the 200th seat — the deciding vote that joins one of these parties and tips the balance.

## Game Flow

1. **Main menu** — Start a new game or continue a saved one.
2. **Character creation** — Define your politician.
3. **Main interface** — Switch between four dashboards (Cabinet / Committees / Political landscape / Relations), advance turns, and respond to AI-generated events through the dialog overlay.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite 5** (build tooling)
- No runtime dependencies beyond React — all game logic is hand-written.

## Getting Started

```bash
# install dependencies
npm install

# start the dev server
npm run dev

# build for production
npm run build

# preview the production build
npm run preview
```

Then open the URL Vite prints (default `http://localhost:5173`).

## LLM Configuration

The game uses a two-layer architecture:

- **Rule fallback (always on)** — Pure local logic keeps the game playable without any API.
- **LLM enhancement (optional)** — Connect any OpenAI-compatible API (DeepSeek, OpenAI, Kimi, Qwen, etc.) for richer, more dynamic narrative and reasoning.

Configure the LLM in-game via the settings panel: provide a **Base URL**, an **API Key**, and a **Model name** (default model: `deepseek-chat`). The configuration is stored locally in your browser.

## Project Structure

```
src/
├── App.tsx                # Routing, header, nav tabs, turn flow
├── components/            # UI: MainMenu, CharacterCreation, GalgameDialog, dashboards
├── engine/                # Game logic: agent, narrative, rules, election, committee, faction...
├── config/                # Rule constants, election/district/background config
├── data/                  # Initial state, parties, events, market, media, world config
├── hooks/                 # useGameState (central state management)
└── types/                 # TypeScript type definitions
```

Key engines:

- `agentEngine` — AI agents (the PM, party leaders, faction leaders, media, interest groups) perceive the world and generate intents.
- `narrativeEngine` — Converts intents into playable events (title, dialog, choices, effects).
- `rulesEngine` — The sole authority for modifying seats, support, funds, and relations; validates every AI intent.

## Status

Personal project, actively iterated. Built for fun and as an experiment in LLM-grounded political simulation.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
