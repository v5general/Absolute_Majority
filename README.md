<div align="center">

# 🎮 Absolute Majority

> *"You are not the Prime Minister. You are not a party leader. You are one rookie MP among 200 — and politics is a game where the rules, the numbers, and the human heart collide."*

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![NPCs: Political Human Skill](https://img.shields.io/badge/NPCs-Political%20Human%20Skill-green)](https://github.com/v5general/political-human-skill)

<br>

An AI-driven turn-based parliamentary political strategy game set in a fictional Japanese parliament of 2058. Every event, line of dialogue, and choice is generated live by an LLM, grounded by a deterministic rule engine that enforces parliamentary procedure. When no LLM is configured, the game falls back to rule-based text so it always runs.

<br>

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

<br>

[What is this](#what-is-this) · [🎮 Connection to Political Human Skill](#-connection-to-political-human-skill) · [Features](#features) · [The World](#the-world) · [Game Flow](#game-flow) · [Tech Stack](#tech-stack) · [Getting Started](#getting-started) · [LLM Configuration](#llm-configuration) · [Project Structure](#project-structure) · [Status](#status) · [License](#license)

</div>

---

## What is this

**Absolute Majority** is a turn-based parliamentary political strategy game. You play as a newly elected member of the House of Representatives and navigate factional struggles, coalition politics, committee battles, media wars, and backroom deals across 48 turns (4 years).

The game runs on a two-layer architecture:

```text
Rule Engine (always on)                   LLM Enhancement (optional)
- Deterministic parliamentary procedure    - Dynamic narrative generation
- Seat allocation & election math          - NPC dialogue & reasoning
- Intent validation & settlement           - Event & choice production
- 14 procedural intent types               - Context-aware adaptation

        ↓ Both layers collaborate, neither is subservient ↓
The rule engine is the sole authority for state mutation.
The LLM generates narrative, dialogue, and choices within those constraints.
When the LLM is absent, rule-based text fills every gap.
```

Every NPC in the game — from the Prime Minister to faction leaders, media commentators, and interest groups — perceives the world and generates intents through an agent engine. Those intents are validated by the rule engine before they can change any game state.

---

## 🎮 Connection to Political Human Skill

> 🧩 **The NPCs in this game are powered by [Political Human Skill](https://github.com/v5general/political-human-skill)** — an open-source framework for creating political-figure personas with a dual-layer structure (Human Layer + Political Layer).

Absolute Majority needs more than MPs who vote by the numbers. It needs NPCs who exist like real political people: with age, background, and formative experience; with personality, weaknesses, and hobbies; with stances, support bases, and faction relationships; who shift their trust and wariness based on the player's past actions; who speak differently in public, private, crisis, and intimate settings; who take different strategies under constituency pressure, faction orders, personal ambition, and political grudges — and whose memories are isolated from one another.

**[Political Human Skill](https://github.com/v5general/political-human-skill)** provides exactly this. When integrated, the skill:

- Judges among candidate actions provided by the game rules and selects one
- Outputs structured, debuggable, explainable NPC behavior JSON
- Maintains persona continuity across turns with isolated memory and relationship state
- Switches self-states (public / private / strategic / wounded / intimate) based on context

```json
{
  "selected_action": "negotiate_budget",
  "action_scores": { "support_bill": 58, "negotiate_budget": 86, "join_rebellion": 27 },
  "public_statement": "I understand the policy direction, but local economies need more carefully designed institutional safeguards.",
  "private_reason": "My support base depends on local public spending. Direct support would damage constituency relations.",
  "relationship_delta": { "trust": 1, "respect": 2, "caution": 1 },
  "memory_write": ["The player asked this NPC to support the fiscal reform bill without offering local budget compensation."]
}
```

> **Absolute Majority** is the primary application scenario for Political Human Skill, but the skill itself stands as an independent, reusable, extensible framework. Both projects are developed in tandem and share the same safety commitments — no real modern political figures, ever.

---

## Features

- **AI-driven narrative** — Events, dialogues, and choices are produced by an LLM in real time, adapting to the current political situation, the congressional season, and your character's background.
- **Full parliamentary simulation** — A 200-seat House of Representatives (110 direct + 90 proportional D'Hondt, parallel system), 9 standing committees, no-confidence motions, bill decision chains, and tiered vote thresholds (simple / absolute / supermajority).
- **Faction system** — Internal party factions with loyalty, ambition, and the ability to challenge the party leader. One party (ULP) runs on democratic centralism and forbids factions.
- **Seasonal congressional calendar** — The year is split into four sessions that change what is possible: a budget battle (Jan–Mar), a legislative push (Apr–Jun), a constituency recess (Jul–Sep), and an extraordinary session (Oct–Dec).
- **Dual career tracks** — Climb the party ladder and the parliamentary ladder independently; becoming a minister ≠ becoming party leader.
- **Government formation** — Post-election coalition negotiations, cabinet allocation, and prime-minister designation.
- **14 procedural intents** — Full intent pipeline with validate + settle: no-confidence proposals, dissolution decisions, bill drafting/voting, committee review/voting, coalition negotiation, cabinet reshuffle, leadership challenge, and policy announcements.
- **Galgame-style dialog** — Political events unfold as visual-novel-style conversations with choices and consequences, rendered fullscreen with adaptive layouts on phone and desktop.
- **Character creation** — Define your name, age, gender, party, personality traits, ideology, and background; your background shapes the events you encounter.
- **Mobile-responsive** — Layout, typography, image format (WebP on mobile, PNG on desktop), and even LLM call concurrency adapt to the screen size. Refresh-safe URL routing keeps you on the same screen (Main Hall vs Situation) across reloads.

---

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

The 199 NPC seats are distributed via a deterministic parallel election system. You are the 200th seat — a proportional-representation seat that adds +1 to whichever party you join.

---

## Game Flow

1. **Main menu** — Start a new game or continue a saved one.
2. **Character creation** — Define your politician.
3. **Main Hall** — Your home base: advance turns, open popovers for party overview and your profile, and enter the Situation.
4. **Situation** — Four dashboards (Cabinet / Committees / Political landscape / Relations) plus a live AI reasoning log. Reachable via `#/game/situation` so the view survives refresh.

---

## Tech Stack

- **React 18** + **TypeScript**
- **Vite 6** (build tooling)
- No runtime dependencies beyond React — all game logic is hand-written.

---

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

---

## LLM Configuration

The game uses a two-layer architecture:

- **Rule fallback (always on)** — Pure local logic keeps the game playable without any API.
- **LLM enhancement (optional)** — Connect any OpenAI-compatible API (DeepSeek, OpenAI, Kimi, Qwen, GLM, SiliconFlow, etc.) for richer, more dynamic narrative and reasoning.

Configure the LLM in-game via the settings panel: provide a **Base URL**, an **API Key**, and a **Model name**. The configuration is stored locally in your browser.

Calls stream the response back via SSE so long generations stay alive on flaky mobile networks, and the engine automatically serializes agent calls on phones to respect stricter concurrent-connection limits. If your provider does not support streaming, the bridge transparently falls back to a single JSON response.

---

## Project Structure

```
src/
├── App.tsx                # Routing, header, nav tabs, turn flow
├── App.css                # Situation view styles + responsive breakpoints
├── components/            # UI: MainMenu, CharacterCreation, GalgameDialog, dashboards, popups
├── engine/                # Game logic: agent, narrative, rules, election, committee, faction, llmBridge...
├── config/                # Rule constants, election/district/background config
├── data/                  # Initial state, parties, events, market, media, world config
├── hooks/                 # useGameState (central state management)
└── types/                 # TypeScript type definitions
```

Key engines:

- `agentEngine` — AI agents (the PM, party leaders, faction leaders, media, interest groups) perceive the world and generate intents.
- `narrativeEngine` — Converts intents into playable events (title, dialog, choices, effects).
- `rulesEngine` — The sole authority for modifying seats, support, funds, and relations; validates and settles all 14 procedural AI intents.
- `electionEngine` — Deterministic parallel election: 110 direct seats (per-block D'Hondt across 11 districts) + 90 proportional seats (national D'Hondt with 5% threshold).
- `llmBridge` — OpenAI-compatible client with mobile-aware streaming, timeout, retry, and a `debugLLMConfig()` console helper.

---

## Status

Personal project, actively iterated with 419 deterministic unit tests across 11 test files. Built for fun and as an experiment in LLM-grounded political simulation.

---

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

<div align="center">

*48 turns. 200 seats. Your move.*

</div>
