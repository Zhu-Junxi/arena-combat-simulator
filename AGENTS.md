# Contributor rules for Arena Duel

Read `architecture.md` before changing combat, fighter settings, or saved formats. Keep gameplay rules in the engine, persistent choices in the settings store, and DOM work in views and controllers.

## Playable character tuning

- Give every playable fighter the same first-view structure: Health, Movement Speed, and exactly three signature controls that affect its gameplay. Choose signature controls that explain its main choices; do not add artificial mechanics to satisfy the count.
- Put remaining gameplay controls in the collapsed Detailed Tuning disclosure. Put purely visual controls in a labeled Visual Settings group there. Keep the disclosure separate from Advanced Tuning's numeric-limit behavior, and preserve its open state across panel rerenders.
- A locked roster placeholder needs no tuning until it becomes playable.
- Connect every tunable value end to end: immutable control config and factory JSON default, bounded store normalization and mutation, controller input, localized panel label/help, frozen match snapshot, engine consumption, saved-data migration, duel recipe validation, and focused tests. A control without a proven combat or visual consumer must not appear in the panel.
- Preserve stable character IDs and existing saved values. Bump versioned formats when their shape changes, accept supported older formats with defaults for new fields, and test invalid imports, reset, save/reload, recipe round trip, and at least one observable combat effect per new gameplay control.

Run `npm test` after code changes when Node is available. For panel changes, also check both languages, keyboard disclosure behavior, and a narrow viewport.

## Project gameplay JSON

Read `data/catalog.json` before adding a playable fighter or built-in preset. A playable fighter needs a versioned `data/characters/factory/<id>.json` file with `format: "arena-duel.character-default"`, `version: 1`, its stable `characterId`, and a `stats` object accepted by the duel codec. Keep roster labels and combat mechanics in code. Add its ID to the catalog and connect factory settings to the store, panel, engine, import/export codec, and focused tests. Factory files are tracked; in-app changes belong only in ignored override files.

Built-in presets live at `data/presets/builtin/<id>.json` as directly importable `arena-duel.duel` recipes. Add the ID to the catalog and a localized display name. Personal recipes live separately under `data/presets/personal/`; `index.json` stores only ID, name, and timestamp. Do not embed recipes or tunable factory numbers in JavaScript.

The local server owns writes to `data/settings/match.json`, `data/characters/overrides/<id>.json`, and `data/presets/personal/`. Preserve versioned formats, validate with shared codecs, check file revisions, and write through atomic rename. A character override beats its factory file; reset uses the effective default. The browser adapter uses localStorage as a fallback and pending-save journal, retains unsaved edits after 409, and may synchronize only against the same recorded revision. Never show a saved confirmation before the server acknowledges it. Theme and language remain browser preferences. Update README and architecture when a file shape or precedence rule changes.
