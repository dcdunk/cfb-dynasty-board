# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained file, `public/index.html` (~700 KB), for a College Football 27 dynasty-mode companion. No build and no package.json. Open it in a browser to run it. The only external requests are Google Fonts.

## Deploy

Live at https://cfbdynastyboard.com as a Cloudflare Worker serving static assets (`wrangler.jsonc`, directory `./public`). Pushing to `main` runs `.github/workflows/deploy.yml`: it runs `check.mjs`, and only if that passes it runs `wrangler deploy`. Anything in `public/` is published, so keep dev files out of it. `public/_redirects` keeps the old `/dynasty-board` URL working. `src/index.js` runs before assets (`run_worker_first`) and 301s `www.` to the main domain; everything else goes to `env.ASSETS`.

## Layout of the file

- Lines ~7-476: one `<style>` block. Colors are CSS tokens on `:root`, with dark mode under `prefers-color-scheme` and `[data-theme]` overrides.
- Lines ~477-645: static HTML for the five tabs (`#viewBoard`, `#viewRand`, `#viewCoach`, `#viewPipe`, `#viewHouse`) plus the team dossier drawer (`#dossier`, `#scrim`).
- Lines ~646-1661: one `<script>`, plain JS with no framework. UI is rendered by building HTML strings into `innerHTML`.

**Line 650 (`const DATA = [...]`) is ~540 KB on one line and line 1044 (`const MAP = {...}`) is ~56 KB.** Never `Read` or `cat` those lines whole. Inspect them with `sed -n 650p public/index.html | head -c 3000`, or by loading them in node. Edit them with a script, never by hand.

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

`check.mjs` is the test. It loads the page in headless Chrome with an empty profile, clicks through all five tabs, opens a dossier, searches, rolls, steps the pipeline map, and deals house rules. It fails on any JS error. It needs Node 22+ and Google Chrome, with no npm install. Run it after every change:

```bash
node check.mjs
```

`node check.mjs path/to/other.html` tests a different copy. When you add a feature, add a check for it in the `inPage` function. The user is a non-coder PM, so don't report a change as done until this passes.
