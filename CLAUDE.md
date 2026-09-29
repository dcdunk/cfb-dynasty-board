# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained file, `public/index.html` (~700 KB), for a College Football 27 dynasty-mode companion. No build and no package.json. Open it in a browser to run it. The only external requests are Google Fonts, plus Coach's AI model download, which starts the first time a visitor opens Coach.

## Deploy

Live at https://cfbdynastyboard.com as a Cloudflare Worker serving static assets (`wrangler.jsonc`, directory `./public`). Pushing to `main` runs `.github/workflows/deploy.yml`: it runs `check.mjs`, and only if that passes it runs `wrangler deploy`. Anything in `public/` is published, so keep dev files out of it. `public/_redirects` keeps the old `/dynasty-board` URL working. `src/index.js` runs before assets (`run_worker_first`) and 301s `www.` to the main domain; everything else goes to `env.ASSETS`.

## Layout of the file

- Lines ~10-708: one `<style>` block. Colors are CSS tokens on `:root`, with dark mode under `prefers-color-scheme` and `[data-theme]` overrides. The look follows the "Linear Design System" in Claude Design (dark surfaces, Inter + JetBrains Mono, lime accent), plus a light theme the system doesn't define. Rules: weights only 400/510/590, uppercase only on labels under 12px, radii 4 (badges) / 6 (controls) / 12 (cards, the max), borders instead of shadows. Primary buttons use `--cta`/`--on-cta` (lime with dark text in both themes); `--accent` is lime in dark and olive in light for text and bars. Colors that carry meaning (pipeline tiers `--t0..5`, map labels, errors, the CP coin) are deliberately outside the system. The system's rules live in a block at the end of the style tag. check.mjs verifies all three token blocks.
- Lines ~477-645: static HTML for the nine tabs (`#viewBoard`, `#viewDyn`, `#viewRand`, `#viewCoach`, `#viewPipe`, `#viewHouse`, `#viewRec`, `#viewSlide`, `#viewAb`) plus the team dossier drawer (`#dossier`, `#scrim`).
- Lines ~646-1661: one `<script>`, plain JS with no framework. UI is rendered by building HTML strings into `innerHTML`.

**Line 650 (`const DATA = [...]`) is ~540 KB on one line and line 1044 (`const MAP = {...}`) is ~56 KB.** Never `Read` or `cat` those lines whole. Inspect them with `sed -n 650p public/index.html | head -c 3000`, or by loading them in node. Edit them with a script, never by hand.

## Data model

`DATA` is an array of ~138 teams with short keys, e.g. `n` name, `nk` nickname, `ab` abbrev, `c` conference, `o/of/df` overall/offense/defense ratings, `p` prestige, `sl` "City, ST" location, `pl` recruiting pipelines as `[state, tier, weight]`, `st` coaching staff (flattened into `COACHES`), `h` hashtags. Look at a record before assuming a key's meaning. `hMap(regs, tiers?)` draws a region map; its clipPath ids are unique per call because split states (CA, TX, FL) break when two maps share ids and one is hidden. `MAP` holds US state SVG paths (`states`) plus recruiting regions (`reg`, `split`).

Every "Search a program" box uses the shared `combo(input, pick, current)` picker (ranking in `teamMatches`); don't reintroduce `<datalist>`.

Everything else is derived from `DATA` at load (`confs`, `COACHES`, `PIPES`, `PORDER`), so adding a team only means editing `DATA`.

## Tabs and their code

Each tab has a state block and a `*Draw()` render function. `showTab()` / `TABS` switches views. Navigation is two rows: four group tabs (`#tabGroups`, `GROUPS`: My Dynasty; Programs = Board, Pipelines, Coach Database, Randomizer; Plan = House Rules, Recruiting & NIL; Reference = Sliders, Abilities) and a sub-tab row (`#subtabs`, the `#tab*` buttons) showing only the current group's views, hidden for single-view groups. Each group reopens the view it was last on (`gLast`). A new tab needs a `TABS` entry, a `GROUPS` slot and a `.stab` button (add `hidden` unless it is in Programs).

| Tab | Purpose | Main functions |
|---|---|---|
| Board | Sortable team table (`COLS`), conference chips, search | `rowsFor`, `draw`, `openTeam`/`body` (dossier) |
| My Dynasty | Saved dynasties (`D`, `dyn-v1`): a snapshot of a team + its House rules ids + source label. Created from House rules ("Save to My Dynasty", `#hdyn`) or the tab button (`dAdd`). The view shows the rules read-only, then `recBody(t, true)` (the Recruiting & NIL plan, renumbered, with every pipeline). "Edit rules in House Rules" loads it into `H` with `H.dyn` set, and House rules shows "Update dynasty" (`#hdupd`) while the team matches. Archive/restore flips `arch`; no delete | `dDraw`, `dAdd`, `hDyn` |
| Randomizer | Filtered random team roll (`RG`, `rSel`) | `rPool`, `rDraw`, `rollIt` |
| Coaches | Sortable staff table (`CCOLS`) | `cDraw` |
| Pipelines | Recruiting pipeline map per team | `buildMap`, `paintMap`, `pDraw`, `pSet` |
| House rules | Generates self-imposed challenge rules for a team | `hDraw`, `hDeal`, `hApplyPreset`, `hToggleRule`, `hText` |
| Recruiting & NIL | Program-level, year-agnostic strategy (users may take a job in year 5): prestige band (`ARCH`), NIL rank, lasting vs earned grades (`GLAST`), tier-colored pipelines, checklist. Deliberately avoids this save's roster/uncommitted NIL. Follows the House rules team unless the `#rLink` toggle is off (saved in `rec-v1`). Mechanics cited on the page; `recHours` interpolates between the only two published points | `recDraw`, `recPick` |
| Abilities (tab button `#tabAb`) | Player/Coach toggle (`abM`). Player: physical abilities by position and archetype (`ABARCH`, descriptions in `ABPHYS`), plus the 16 mental abilities (`ABMENT`). Ability names, the mental list and Field Flip were verified against the CFB 27 game files (Sept 2026); archetype lists come from CollegeFootball.gg minus Battering Ram (not in the game). A leading `?` in an `ABPHYS` description means only the icon was found in the game files. Unlock ratings are deliberately left out until confirmed for CFB 27. Descriptions are our own writing. Coach side: 13 coach archetypes in `CARCH` (unlock, perk, cost, branches of tiered abilities; `pos:true` means bought per position group and is drawn as one card per group in `CPOS`, each priced for that group (the K/P card shows the K/P discount)). Each upgrade row shows its own CP cost (no archetype-level cost row or branch totals, per the owner), parsed from the `cost` text by `cCost`/`cTierCost`. K/P discounts are per ability, written as `(K/P: Hot Hand 10, Locked In 15)`; there is no blanket K/P discount (check.mjs pins the game-file values). Names/unlocks from CollegeFootball.gg, costs and values from prestonchoate.dev game-file data, which wins when they disagree. Icons are the real CFB 27 art extracted from the game files, served from `public/ab/` (`p` player, `c` coach ability, `a` archetype badge = game frame + glyph; Program Builder uses the raised-hands glyph per owner). `ABICO`/`CICO` list which names have one; always use real icons, and the game files win over websites. Coach answers player and coach ability questions via `pAbil` (`cFind` for coach abilities), checked before players and plans | `abDraw`, `cDrawAb`, `pAbil` |
| Coach (headset button in the masthead opens a right sidebar, not a tab; above 900px it pushes the page via `body.coach-on` margin instead of covering it, below it goes full screen) | Chat named Coach that turns plain text ("tough Florida dynasty, created coach") into a plain-prose reply from site data: house rules (`pRules`), recruiting band, coach, sliders. Chat only: no cards, buttons or tab changes (user asked). Keyword parsing only (`PDIFF`, `PPRE`, `PRULE`, `pFindTeams`, longest team name wins). Relative requests (`PDOWN`/`PUP`, amount from `pAmt`) step the last plan one rule at a time via `pStep`, never touching rules the user named (`keep`); fresh plans are fitted to their difficulty label by `pFit`. Replies show What changed and a data-driven Why it's hard (`pWhy`). `PONLY` lists the territory rules that truly restrict regions. `pEdit` handles rule-level edits by name (remove/swap/add/explain via `pFindRules`, category nudges via `PCATW`) and undo (`P.past`); `pLeague` handles league-wide questions (rankings via `pScope`/`PCONF`, compare two teams, best players nationally, pipelines by state or region). Both run before `pAbil`. `PABSTOP` stops abbreviations that are English words ("most") from matching teams. Messy input: `PALIAS` fan nicknames, `pFuzzy` typo fallback (edit distance, skips `PWORDS` and words from rule/preset/ability names, shows a "Reading X as Y" note), `pAmbig` asks "Which one?" for Miami/UT and replays the question, `pHelp` gives team-specific suggestions when nothing matched. Follow-ups: handlers set `P.last` (players/staff/roadmap/stat/league/compare/plan) and `pFollow` repeats that kind of question for a new team or conference ("what about Michigan?", "and their defense?"). `pRoadmap` projects departures from class year (FR 4, SO 3, JR 2, SR 1 seasons left; starters per group in `PSTART`) with holes and recruiting priorities (`PROAD` triggers). `pStat` answers one team's number with national and conference rank. `pFilters`/`pFiltered` stack numeric, NIL-rank, title and pipeline filters with the conference scope. Challenges: `PCHAL` (no team named) → `pChallenges` offers 3 of 5 data-driven challenge types with goals; a number or team name picks one (`P.choices`, `pTakeChallenge`) and the plan shows a Your goal section. Memory: `P.pref` remembers the last difficulty asked for; `pSave`/`pLoad` persist the chat; "start over" or the Clear button calls `pClear`. **`coach-cases.mjs` is the Coach conversation suite, run by check.mjs; add a case for every Coach bug you fix.** The AI (WebLLM + Llama 3.2 3B, ~1.8 GB from jsDelivr/Hugging Face, runs on the visitor's GPU, no API) has no toggle: `pAiLoad` starts it the first time Coach opens (never on page load), skipped without WebGPU, with data saver on, or when `window.__noAI` is set (check.mjs sets it so CI never downloads the model); it rephrases `P.facts` and must not add facts. Roster questions (best/top N/fastest/by position, or a player named) answer from `t.r` via `pPlayers`/`pFindPlayer`; staff questions from `t.st` via `pStaff`/`pFindCoach`. Plans, roster and staff answers always use the templated reply even with AI on (the model dropped and renamed rules); the AI only answers what the template cannot. `TYEARS` holds national title seasons from NCAA.com (counts must equal `t.ti`; check.mjs enforces it; USC 2004 counted as won by owner decision). check.mjs never loads the model | `pPlan`, `pRender`, `pAsk`, `pWrite` |
| Sliders | Matt10's slider sets, hand-transcribed from his forum image (`SLDIFF`, `SLPEN`, `SLFIX`). Rows with a third value are highlighted as changed from the previous version (old value only in the cell's hover title). Update the version, date and `#slNew` notes when he posts a new set | `slDraw` |

House rules are the most intricate part: `HRULES` (built-in rules, each with category `c` from `HCATS` and strain level `l` 1-3), `HPRE` presets, `HSTRICT` difficulty weights, `HTOK` text tokens filled per team by `fillTok`, and `HMAPS` region helpers. User-created rules/presets live in `HU` and merge in via `huSync`.

## Persistence

`localStorage` only, wrapped in try/catch:
- `house-v1`: current House rules state (`hSave`/`hLoad`)
- `house-custom-v1`: user-made rules and presets (`huSave`/`huLoad`)
- `dyn-v1`: saved dynasties `{list:[{id,name,team,rules,src,made,arch}], cur, arch}`; the loader drops unknown teams
- `coach-v1`: Coach transcript (last 60 messages), current plan, undo history (10), last team, preferred difficulty (`pSave`/`pLoad`). Plans store the team by name; `pDe` drops unknown rule ids.

Changing the shape of either object breaks saved data for existing users. Bump the key or keep the loaders tolerant (they already filter unknown rule ids).

## Verifying changes

`check.mjs` is the test. It loads the page in headless Chrome with an empty profile, clicks through all nine tabs, opens a dossier, searches, rolls, steps the pipeline map, deals house rules, and spot-checks slider values. It fails on any JS error. It needs Node 22+ and Google Chrome, with no npm install. Run it after every change:

```bash
node check.mjs
```

`node check.mjs path/to/other.html` tests a different copy. When you add a feature, add a check for it in the `inPage` function. The user is a non-coder PM, so don't report a change as done until this passes.
