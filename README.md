<div align="center">

# Arena Duel

**Choose your fighters. Tune the rules. Watch the battle unfold.**

A browser-based 2D combat simulator built with HTML, CSS, and JavaScript modules. No framework, build step, or third-party dependencies.

[Quick start](#quick-start) · [Features](#features) · [How to play](#how-to-play) · [Development](#development)

</div>

## What is Arena Duel?

Arena Duel is an automatic battle prototype. Choose two characters, adjust their attributes and arena rules, then start a match. Fighters move, target one another, use their weapons and abilities, and fight until a winner is determined.

The interface includes English and Simplified Chinese, light and dark themes, saved match settings, and JSON files for sharing duel setups.

## Quick start

Requires **Node.js 18 or newer**.

```sh
cd arena-combat-simulator
npm start
```

Open **<http://127.0.0.1:4173/>** in your browser. If you are already in the `arena-combat-simulator` directory, run `npm start` directly.

The included server serves the app locally. Open the URL above rather than opening `index.html` as a file: the browser needs to load JavaScript modules and fetch the translation catalog over HTTP.

## Features

| Feature | What it offers |
| --- | --- |
| **Character selection** | Choose a fighter for each side from the category roster. Both sides can use the same character with separate settings. |
| **Automatic combat** | Watch movement, weapon attacks, projectiles, abilities, status effects, health, and the final result play out in the arena. |
| **Match customization** | Tune fighter stats, character abilities, and arena rules. Changes are saved locally and applied to the next match. |
| **Duel presets** | Browse built-in matchups, save personal duels, and import or export JSON presets. |
| **Languages** | Switch between English and Simplified Chinese from the header. The choice is remembered in your browser. |
| **Themes** | Follow your system appearance or choose light or dark mode without resetting the match. |

### Playable roster

- **Warrior** — plate armor reduces incoming damage, with a minimum of 1 damage per hit.
- **Archer** — every fourth arrow applies a root followed by a slow.
- **Guardian** — a 40-durability shield and a straight charge every 4 seconds; after the shield breaks, a chain flail lands for 5 seconds and blocks movement. Body and weapon visuals use 1.5× scale.
- **Mage** — cycles through ice, fire, and leech magic with marks and finishing effects.
- **Priest** — applies marks and uses prayer to heal or damage.
- **Dong Fang Chang Fan** — blue-white twinkling stars launch from behind, curve around the sides and accelerate toward enemies. Myriad Star Fireflies grants up to three independent 2-second stacks, each adding 200% attack speed; every attack creates one star.
- **Beastmaster** — fights alongside a summon and can unleash a pack attack.

Warrior, Archer, Guardian, Mage, Priest and Dong Fang Chang Fan have portraits, avatars and battle artwork. The roster also contains locked, unavailable character previews; Beastmaster currently uses placeholder artwork.

The battle HUD includes side portraits, live health, traits, attack intervals, movement speed, elapsed time and combat events. Warrior, Archer and Guardian have combat audio; audio credits are listed in [assets/audio/SOURCES.md](assets/audio/SOURCES.md).

## How to play

1. **Select a side.** Click the left or right character panel, then choose a character from the roster below. Use the category rail to browse character groups.
2. **Configure the match.** Expand the settings panel above the roster. The fighter tabs edit each side; the Arena tab controls shared rules. You can reset an individual section or all settings.
3. **Start the battle.** Press **Start Battle**. The selection panels move away, a countdown runs, and the fighters battle automatically.
4. **Return to selection.** Use **Back to Selection** or press **Esc** to leave the arena. The battlefield resets for the next match.

The category rail supports mouse, touch, and keyboard navigation. Help tooltips can be opened with a pointer, keyboard focus, or touch.

### Save and share duels

Open the settings panel and choose **Duel Presets**. The browser contains built-in matchups and your own saved duels. Use **Save Current Duel** to add a tile, or **Import JSON** to add a shared file without changing the current match. Each personal tile can be loaded, exported, renamed, or deleted. Built-in tiles can be loaded or exported.

Three- and four-fighter files can also be stored and exported. Their tiles show a muted icon because the visible arena currently supports two fighters. Open a tile's **More** menu, or right-click it, to choose **Load First Two Fighters**; the full file remains saved.

### Change language or theme

Both controls are in the page header. Language selection uses a saved preference when available, then your browser language, then English. Theme selection offers **System**, **Light**, and **Dark**; System follows operating system changes.

## Development

Run the regression suite with:

```sh
npm test
```

Tests use Node.js's built-in test runner and require no package installation.

The app is organized around a small browser entry point and separate modules for configuration, selection, customization, combat, sharing, localization, themes, and UI transitions:

```text
arena-combat-simulator/
├── index.html              Page shell and application entry point
├── serve.cjs               Local static server
├── assets/                 Runtime character and weapon images
├── src/
│   ├── locales/            CSV translation catalog
│   ├── scripts/            Game systems and browser controllers
│   │   └── share/          Preset library and duel JSON codec
│   └── styles/             Components, layout, and theme palettes
├── tests/                  Node regression tests
├── archive/artwork/        Concept art and earlier assets
└── architecture.md         System design and extension guide
```

See [architecture.md](architecture.md) for module ownership, data flow, saved and shared formats, design rules, and a step-by-step example of adding a language through the CSV and global dropdown.

> **Current scope:** The visible interface runs two-fighter duels. The underlying settings and combat modules contain groundwork for additional fighter slots, but those slots are not yet exposed in the selection and battle UI.
