# CFB 27 Dynasty Board

A free companion site for College Football 27 dynasty mode. Live at **[cfbdynastyboard.com](https://cfbdynastyboard.com)**. No account, no ads.

## What's on it

- **My Dynasty**: save the dynasties you're running (team, house rules, goal) and come back to them. Back up to a file, or keep them in step across devices with **Sync your devices** (a sync code or QR, no account).
- **Program Database**: all 138 teams, sortable and filterable. Open a team for its card: ratings, prestige, titles, NIL, stadium, staff, school grades and the full roster.
- **Program Pipelines**: each team's recruiting pipelines on a US map, and which programs own each region.
- **Coach Database**: every head coach and coordinator. Open one for their card: level, grade, age, specialty and every coach ability they've bought, by archetype.
- **Player Database**: every rostered player with all 53 EA ratings, filters by position, team, conference, class and dev trait. Open one for their player card.
- **Randomizer**: can't pick a team? Narrow the pool and roll.
- **House Rules**: self-imposed challenge rules for any program, from casual to hardcore, with your own rules and presets.
- **Recruiting & NIL**: a strategy for any program, whether you start there or take the job years in: its tier, budget, what to pitch, where to recruit and how to spend NIL.
- **Sliders**: Matt10's tested gameplay sliders for Heisman and All-American, with what changed in the latest version.
- **Abilities**: player physical and mental abilities by position and archetype (favorite the ones you build around), coach archetypes with costs and unlocks, and a planner for position changes.
- **Coach**: the headset button opens a chat. Tell it a program and how you want to play ("tough Florida dynasty with a created coach") and it builds a plan with house rules, a recruiting approach and sliders, which you can add to My Dynasty in one tap. Longer messages are read by Cloudflare Workers AI (free tier) to work out what you're asking; every answer still comes from the site's own data.

Search everything with **Ctrl/Cmd+K** or **/**. Press **?** for keyboard shortcuts.

**On phones** it works like an app: a bottom tab bar (pick your own four tabs under More, then Edit tab bar), lists as cards, and pop-ups as sheets you swipe down to close. Add it to your Home Screen for the full-screen version.

## Where the data comes from

- Player ratings: EA SPORTS' public College Football 27 ratings pages, refreshed weekly.
- Coach ability trees: [TeamCrafters](https://www.teamcrafters.net)' CFB 27 roster pages.
- Coach and player ability costs and unlock values: [prestonchoate.dev](https://prestonchoate.dev/cfb-data-mining)'s game-file research.
- Sliders: Matt10's published slider sets.

Not affiliated with EA SPORTS.

## Working on it

Plain HTML, CSS and JavaScript in `public/`, no build step and no npm. Open `public/index.html` in a browser, or see `CLAUDE.md` for how the files fit together.

```bash
node check.mjs
```

runs the full test suite in headless Chrome (needs Node 22+ and Chrome). Pushing to `main` runs it on GitHub and, if it passes, deploys to Cloudflare. To refresh data: `node tools/ea-ratings.mjs` (player ratings) and `node tools/coach-trees.mjs` (coach abilities), then `node check.mjs`.
