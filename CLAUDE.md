# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained file, `dynasty-board.html` (~700 KB), for a College Football 27 dynasty-mode companion. No build, no package.json, no git, no tests. Open it in a browser to run it. The only external requests are Google Fonts.

## Layout of the file

- Lines ~7-476: one `<style>` block. Colors are CSS tokens on `:root`, with dark mode under `prefers-color-scheme` and `[data-theme]` overrides.
- Lines ~477-645: static HTML for the five tabs (`#viewBoard`, `#viewRand`, `#viewCoach`, `#viewPipe`, `#viewHouse`) plus the team dossier drawer (`#dossier`, `#scrim`).
- Lines ~646-1661: one `<script>`, plain JS with no framework. UI is rendered by building HTML strings into `innerHTML`.

**Line 647 (`const DATA = [...]`) is ~540 KB on one line and line 1041 (`const MAP = {...}`) is ~56 KB.** Never `Read` or `cat` those lines whole. Inspect them with `sed -n 647p dynasty-board.html | head -c 3000`, or by loading them in node. Edit them with a script, never by hand.

## Data model

`DATA` is an array of ~138 teams with short keys, e.g. `n` name, `nk` nickname, `ab` abbrev, `c` conference, `o/of/df` overall/offense/defense ratings, `p` prestige, `sl` "City, ST" location, `pl` recruiting pipelines as `[state, tier, weight]`, `st` coaching staff (flattened into `COACHES`), `h` hashtags. Look at a record before assuming a key's meaning. `MAP` holds US state SVG paths (`states`) plus recruiting regions (`reg`, `split`).

Everything else is derived from `DATA` at load (`confs`, `COACHES`, `PIPES`, `PORDER`), so adding a team only means editing `DATA`.

## Tabs and their code

Each tab has a state block and a `*Draw()` render function. `showTab()` / `TABS` switches views.

| Tab | Purpose | Main functions |
|---|---|---|
| Board | Sortable team table (`COLS`), conference chips, search | `rowsFor`, `draw`, `openTeam`/`body` (dossier) |
| Randomizer | Filtered random team roll (`RG`, `rSel`) | `rPool`, `rDraw`, `rollIt` |
| Coaches | Sortable staff table (`CCOLS`) | `cDraw` |
| Pipelines | Recruiting pipeline map per team | `buildMap`, `paintMap`, `pDraw`, `pSet` |
| House rules | Generates self-imposed challenge rules for a team | `hDraw`, `hDeal`, `hApplyPreset`, `hToggleRule`, `hText` |

House rules are the most intricate part: `HRULES` (built-in rules, each with category `c` from `HCATS` and strain level `l` 1-3), `HPRE` presets, `HSTRICT` difficulty weights, `HTOK` text tokens filled per team by `fillTok`, and `HMAPS` region helpers. User-created rules/presets live in `HU` and merge in via `huSync`.

## Persistence

`localStorage` only, wrapped in try/catch:
- `house-v1`: current House rules state (`hSave`/`hLoad`)
- `house-custom-v1`: user-made rules and presets (`huSave`/`huLoad`)

Changing the shape of either object breaks saved data for existing users. Bump the key or keep the loaders tolerant (they already filter unknown rule ids).

## Verifying changes

There is no test suite. After any JS edit, at minimum syntax-check the script block (adjust line numbers if the file shifted):

```bash
sed -n '647,1660p' dynasty-board.html > /tmp/app.js && node --check /tmp/app.js
```

Then open the file in the browser pane and click through all five tabs plus the dossier, checking the console for errors. The user is a non-coder PM and expects changes to be tested before being reported done.
