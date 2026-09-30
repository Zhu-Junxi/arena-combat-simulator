# Architecture

This document describes the current Arena Duel implementation and the boundaries to follow when extending it. The application is a static, dependency-free browser app built with HTML, CSS, and JavaScript ES modules. Node.js is used only for the local server and tests. There is no build step or backend.

## Run and verify

From this directory, use Node.js 18 or newer:

```sh
npm start
npm test
```

Open <http://127.0.0.1:4173/> after starting the server. Use the server because the browser loads ES modules and fetches the translation CSV; opening `index.html` as a local file is not the supported path. `serve.cjs` serves this directory with no-store caching. Tests use Node's built-in `node:test` runner.

## System map

| Location | Responsibility |
| --- | --- |
| `index.html` | Static page shell, stable element IDs, accessibility hooks, stylesheet order, and the module entry point. |
| `src/scripts/app.js` | Browser composition root: loads translations, creates state and services, wires controllers, and handles language and theme changes. |
| `src/scripts/config/` | Immutable character, weapon, match, combat, and customization definitions. |
| `src/scripts/state/game-state.js` | Current character selections, active side and category, and page phase. |
| `src/scripts/selection/` | Roster and selected fighter panels (`selection-view.js`), plus their input handling (`selection-controller.js`). |
| `src/scripts/customization/` | Validated saved settings (`settings-store.js`), settings UI, input handling, display units, and combat setup snapshots. |
| `src/scripts/battle/` | DOM-independent combat rules (`combat-engine.js`), battle display and frame loop (`combat-renderer.js`), and SVG weapon/effect markup. |
| `src/scripts/share/` | Versioned JSON duel format, personal preset library, built-in matchups, and preset browser UI. |
| `src/scripts/i18n/` and `src/locales/translations.csv` | CSV parsing, catalog validation, locale selection, translation, and DOM localization. |
| `src/scripts/theme/` and `src/styles/themes/` | Early theme setup, theme preference and stylesheet switching, selector labels, and semantic color palettes. |
| `src/scripts/ui/` | DOM lookup, decorations, tooltips, and selection-to-battle transitions. |
| `src/styles/` | Shared layout and component CSS, responsive rules, and theme-independent styling. |
| `assets/`, `archive/artwork/`, `tests/` | Runtime images, non-runtime art history, and regression tests respectively. |

`MANIFEST.sha256` is an inventory of file hashes, not an input to the runtime. If a workflow relies on its hashes, regenerate it after changing files; the application does not read it.

War is listed in the Apocalypse category. Its combat cycle and continuous swept-blade collision are isolated in `battle/war-combat.js`; `war-visuals.js` draws the held sword and thin cleave trail. `war-entrance.js` owns the pre-combat screen tear, two-second roar and mount sequence; the runtime freezes both fighters until that sequence completes. War's factory JSON contains damage, cooldown and reach as its three signature controls, six charge/sweep/knockback abilities, and blade hitbox width. Version-4 match files, version-13 duels, and older War character defaults receive only missing War fields from factory defaults.

### Dependency and data flow

```text
index.html
  -> theme-bootstrap.js (before page paint)
  -> app.js
       -> fetch translations.csv -> i18n service -> static DOM + rendered views
       -> character/config definitions -> game state -> selection view/controller
       -> settings store -> immutable match snapshot -> combat engine
       -> combat engine events/state -> renderer -> DOM and SVG
       -> transitions -> battle runtime (requestAnimationFrame)
       -> preset browser/library -> share codec <-> selected fighters + settings store
```

Keep `app.js` as the wiring layer. Put rules and data transformations in modules that can run without a browser; put DOM manipulation and event listeners in views or controllers. The engine must not read DOM, local storage, or translated strings. Views may read engine state and translate labels, but should not decide combat outcomes.

## Startup and page lifecycle

1. `index.html` runs `theme-bootstrap.js` synchronously in the head so the first paint uses the chosen palette. It adds the active theme stylesheet.
2. The module entry point fetches `translations.csv`. Until it succeeds, the page remains in its localization bootstrap state. A fetch or catalog error shows the retry UI.
3. `app.js` localizes static elements, builds the global language and theme selectors, creates game state and settings, then creates and binds each controller. It makes the page ready only after initialization succeeds.
4. Character selection changes `state.left` or `state.right`; settings are looked up by **seat and character ID**. This permits duplicate characters with distinct tuning.
5. Starting a battle obtains a frozen settings snapshot, resets the engine, animates the panels away, then starts the frame loop. The runtime waits for the configured launch delay and advances the engine in fixed `rules.step` increments (default `1/120` second). The renderer paints current state and handles engine events.
6. Returning to selection stops the frame loop, resets the engine, reverses the transition, and restores input and focus.

The page phase (`select`, transition phases, `arena`) belongs to `game-state.js` and `ui/transitions.js`. The combat phase (`idle`, `waiting`, `running`, `finished`) belongs to the battle runtime and engine. Do not use one as a replacement for the other.

**Current UI scope:** the settings store, engine, and share format contain support for up to four stable fighter slots (`left`, `right`, `third`, `fourth`), but `app.js`, selection panels, settings view, and transitions currently expose a two fighter duel. `app.js` forces the setup's `fighterCount` to 2 for the visible battle. A future free-for-all UI needs coordinated changes across those presentation modules; changing the arena control alone will not display extra fighters.

## Systems and ownership

### Characters, weapons, and assets

`config/characters.js` defines stable character IDs, localized name/trait keys, categories, lock status, and optional portrait/avatar/battle art; playable stats come from factory JSON. It derives `CHARACTER_BY_ID` and category lists. `config/weapons.js` maps character IDs to melee or ranged timing, reach, projectile properties, and weapon sprite geometry. `config/combat.js` supplies baseline rules and transition timing; `config/match.js` supplies stable seat IDs and target strategies.

The engine uses IDs and configuration; the selection and battle views use translation keys and runtime paths under `assets/`. Art under `archive/artwork/` is reference material and must not be referenced by runtime files. When adding a character, add catalog keys, runtime art if available, a weapon definition for a playable fighter, and any special rule in the engine. A `locked` roster entry is a placeholder and cannot be selected or imported as a playable fighter.

### Combat and rendering

`createCombatEngine` accepts injected rules, weapon definitions, a random function, and an `onEvent` callback. It owns fighters, summons, projectiles, zones, health, targeting, collision, abilities, and winner determination. Its `reset`, `launch`, `step`, and `stop` operations are driven by the runtime. Random injection lets tests reproduce behavior. New mechanics belong in the engine and need focused engine tests covering their rules and edge cases.

`createCombatRenderer` translates battle state and events into fighter elements, SVG effects, notes, and status text. `weapon-effects.js` generates visual markup. `createBattleRuntime` in `combat-renderer.js` owns `requestAnimationFrame`, launch countdown, fixed-step accumulation, and stopping the loop. Add a new effect by defining its engine event/state first, then rendering it here. Keep gameplay numbers out of the renderer.

### Customization and persistence

`config/customization.js` declares controls, ranges, and localization keys, and loads factory defaults from JSON. `settings-store.js` validates, clamps, normalizes, and persists per-seat/per-character fighter settings, character defaults, arena settings, and advanced mode. Its current storage key is `arena-duel.match-settings.v1`, while the serialized schema version is `5`; these are separate values. Old versions 1 through 4 are migrated on load. Invalid or unavailable stored data falls back to normalized defaults.

`settings-view.js` builds controls and tabs; `settings-controller.js` handles input, reset, and expansion. `setting-presentation.js` converts internal values into displayed values and supplies units/help text. `combat-setup.js` requests a frozen snapshot from the store. Treat snapshots as the boundary between editable settings and a battle in progress: edits should affect the next match, not mutate an active engine run. The launch delay is displayed and shared in seconds but stored in engine settings as milliseconds.

`settings-store.js` keeps changes usable in memory if a write fails. Controllers await `whenPersisted()` before claiming a change was saved; the storage status UI explains pending writes and failures. Project and folder adapters retain a local recovery copy. Saving a character default applies its current values to that character in every seat, persists those seat values, and uses them for future resets.

`ui/feedback.js` owns brief visual toasts and writes the same localized message to the existing main or preset-dialog live status region. Call it for completed discrete actions (selection, save, reset, preset operations, and preference changes); skip repetitive toasts for slider input, tabs, and category browsing. Success lasts about 2.5 seconds, warnings and errors about 4.5 seconds, and a new toast replaces the old one. Toasts are visual only (`aria-hidden`), so screen readers hear the live status once. Pass the action control as `anchor` when possible. Keep state changes immediate and await persistence before showing save success; CSS motion is cosmetic and must obey `prefers-reduced-motion`.

For a new setting, define its bounds/default and label key, add store normalization and mutation, add the UI control and any display conversion, consume it in the engine or runtime, and update JSON share validation if it is part of a portable duel. Decide whether old saved data needs migration, then test invalid values and defaults.

#### Fighter tuning standard

Every playable fighter's first view shows Health, Movement Speed, and exactly three signature controls that change that fighter's battle behavior. The signature choices are intentionally tailored to the fighter: use values the engine actually consumes rather than adding controls to meet a raw count. All other controls live in a collapsed **Detailed Tuning** disclosure. Keep cosmetic controls in a separately labeled group inside it. The disclosure is independent of **Advanced Tuning**, which changes numeric limits. Its open state is remembered when the panel rerenders. Locked roster placeholders do not need tuning.

To connect a new playable character: define a stable character ID and weapon; define bounded controls in `config/customization.js` and numeric defaults in factory JSON; normalize and mutate them in `settings-store.js`; include them in the immutable combat snapshot and consume them in the engine; render two shared controls and three meaningful signature controls in `settings-view.js`, with remaining controls in Detailed Tuning; route inputs through `settings-controller.js`; add English and Chinese labels/help in `translations.csv`; validate and migrate them in the duel codec and saved settings; test UI placement, combat effect, save/reset, and recipe round trips. Preserve existing character IDs and saved values when extending the schema.

### Sharing

`duel-share-codec.js` defines the `arena-duel.duel` JSON format and current version `14`. Export includes selected fighter IDs, a snapshot of their stats, advanced mode, and arena rules. Import parses and validates the whole file, including shape, versions, known unlocked characters, allowed numeric values, and supported modes, before `duel-transfer-controller.js` applies it. Import updates only the selected fighters' entries and arena settings; it does not replace the entire saved character library. When changing the portable schema, update writer, reader, migration behavior, version, and codec tests together.

`duel-preset-library.js` loads built-in matchup recipes from project JSON and keeps personal presets in a versioned `arena-duel.presets.v1` record supplied by the project storage adapter. Each saved entry contains an ID, name, update timestamp, and unchanged duel recipe. The library validates recipes on save and reload; controllers await file-write acknowledgement before showing success. `duel-preset-controller.js` owns the modal tile browser, JSON upload/download, naming conflicts, and load actions. Import adds a tile without applying it. A three- or four-fighter recipe remains intact in the library; its special **Load First Two Fighters** action makes a temporary two-fighter copy for the current UI. All new preset copy belongs in `translations.csv`.

### Localization: adding a language

All runtime UI copy belongs in `src/locales/translations.csv`. Its first column is a stable key; each remaining column is a locale. The current header is `key,en,zh-CN`. English is the required fallback. The `meta.language_name` row supplies each dropdown option's **native language name**. For example, to add Spanish:

```csv
key,en,zh-CN,es
meta.language_name,English,简体中文,Español
app.heading,Arena Duel,角色对决,Duelo en la arena
battle.winner,{name} wins,{name} 获胜,Gana {name}
```

The snippet shows the column shape; add the `es` value to **every row** of the actual CSV, keeping every existing key and column. Use a valid BCP 47 code (`es`, `fr`, `pt-BR`, etc.). Keep placeholders such as `{name}`, `{count}`, and `{seconds}` exactly aligned with the English value. Quote CSV fields containing commas, quotes, or line breaks; double embedded quotes (`""`). Save the file as UTF-8. `buildCatalog` rejects malformed rows, duplicate keys or locale columns, missing English, and placeholder mismatches. A blank non-English value falls back to English at runtime, though a complete translation is preferable.

No hard-coded `<option>` or locale list is needed in `index.html`: `app.js` loads the CSV through `loadI18n`; `createI18n` exposes `availableLocales`; `populateLanguageSelector` builds the global header dropdown from that list. On change, `i18n.setLocale` stores the code under `arena-duel.locale` and notifies subscribers. `app.js` then relocalizes static `data-i18n` text and accessibility/tooltip attributes, rerenders dynamic selection and settings views, and refreshes transition and battle labels. `dom-localizer.js` also updates `<html lang>` and the document title. Startup chooses a saved locale, then a matching browser language, then English. `matchLocale` has explicit Chinese mappings; add an explicit mapping there only if a new locale needs special alias or regional fallback behavior.

After adding a column, update the production catalog assertion in `tests/i18n.test.js`, which currently expects exactly `['en', 'zh-CN']`, and assert that the new language's rows are filled. Run `npm test`, then open the app and switch the header dropdown before and during a battle. Check headings, settings, tooltips, status messages, result text, title, and `<html lang>`. Add new UI strings as CSV rows with keys referenced by `data-i18n` attributes or `i18n.t(...)`; do not embed translated copy in JavaScript.

### Theme and styling

`theme-bootstrap.js` reads `arena-duel.theme` before paint. `theme-controller.js` handles `system`, `light`, and `dark`, responds to system changes, and swaps a single active stylesheet; `theme-view.js` localizes the selector. Only explicit `light` or `dark` preferences are saved. `src/styles/themes/light.css` and `dark.css` must expose the same semantic CSS custom properties. Shared CSS in `base.css`, `layout.css`, `selection.css`, `customization.css`, `battle.css`, `duel-presets.css`, and `responsive.css` should consume those properties. Add visual components to the appropriate shared stylesheet and define any new semantic color token in both palettes. Theme changes must preserve selection and battle state.

## Feature design rules

1. Put stable rule definitions in `config/` and numeric gameplay defaults in tracked `data/` JSON; keep user choices in project files through the settings store, and temporary combat state in the engine.
2. Add browser wiring in `app.js` only after the feature module has a clear interface. Prefer injecting collaborators into controllers and engine functions over importing global application state.
3. Route user input through controllers, rules through the engine/store, and output through views. Keep UI strings in the CSV and colors in theme variables.
4. Treat persisted and shared data as untrusted: normalize stored settings and validate imported files before changing live state. Version schemas when their shape changes.
5. Preserve stable character IDs, translation keys, and seat IDs where possible; saves and shared recipes depend on them.
6. Extend the relevant tests in `tests/` for rule changes, serialization, localization, or structural contracts. Run `npm test` and manually check the browser path for UI changes.

The README covers player-facing setup and controls. Keep this file aligned with the code whenever module ownership, data formats, or extension steps change.

### Project JSON storage

Gameplay defaults and user data are loaded from `data/` before the settings store and combat engine are created. `data/catalog.json` lists playable character IDs and built-in preset IDs. Each tracked `data/characters/factory/<id>.json` uses `arena-duel.character-default` version 1; exported defaults and overrides use version 2. The codec accepts both and fills missing War fields in older version-1 defaults. Each `stats` object is validated with the same shape and bounds as a duel fighter. `data/settings/factory-arena.json` supplies arena defaults. Tracked `data/presets/builtin/<id>.json` files are raw `arena-duel.duel` recipes, so the existing import/export path accepts them unchanged.

The Node server writes ignored player files: `data/characters/overrides/<id>.json`, `data/settings/match.json`, and `data/presets/personal/`. An override has precedence over the corresponding factory character file and becomes the reset baseline. The match file stores arena settings, advanced mode, and all seat values; character defaults are kept in the separate override files. Each personal recipe file contains only a duel recipe; `data/presets/personal/index.json` stores order, IDs, names, and update timestamps. `src/scripts/data/project-data-service.js` validates requests, restricts all paths to those known locations, compares SHA-256 revisions, and writes JSON through a temporary file and atomic rename. Stale writes return HTTP 409.

`src/scripts/data/selectable-storage.js` is the storage facade supplied to the settings store and preset library. It selects Browser storage for new browser origins, preserves Project files for existing origins with project player files, and remembers an explicit choice per origin. Browser mode uses the existing browser records and never sends gameplay writes to `/api/data`. Project mode delegates to `project-storage.js`, including its revision-checked writes and retry journal. Folder mode keeps a selected directory handle in IndexedDB and writes player files beneath that parent folder's `data/` directory. If permission is lost, it retains a browser journal and asks the player to reconnect; unsupported browsers cannot select folder mode. Backend journals have separate namespaces.

All modes expose synchronous `getItem` and promise-returning `setItem`, plus backup import/export, save-state subscriptions, and retry or conflict actions. Switching validates and copies the active `arena-duel.backup` version-1 data, reads the destination, merges independent setting values and preset IDs, asks about overlaps, and activates the destination only after the write succeeds. The source remains intact. A later mode switch or an external file edit uses the same merge rules. Folder files use the server's match, character-default, recipe, and preset-index formats; factory and built-in files remain app assets. A successful remote merge reloads the app so in-memory settings match the saved data. The Settings popover shows the active mode and data location; a separate dialog previews the backup JSON. Locale and theme remain per-browser.

`.vscode/tasks.json` provides **Arena Duel: Open & Save** using VS Code's `${execPath}` with `ELECTRON_RUN_AS_NODE=1`; `serve.cjs --open` opens an existing server only when its `/api/data/health` project identity matches this checkout. The same server remains available through `npm start`. A Live Server tab can save in Browser or Linked local folder mode without the project API. Switching to Project files uses the origin-checked, nonce-matched `postMessage` handoff. The target validates and writes through the existing backup API; the source tab navigates only after acknowledgment.

When adding a character, add its ID to the catalog, create and validate its factory JSON, connect its stats and controls to the panel and engine, and add migration and round-trip tests. When adding a built-in preset, add a valid duel JSON file, catalog ID, localized name, and a codec test. Keep factory files in Git and player files ignored.
