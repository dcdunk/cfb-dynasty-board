# CFB 27 Dynasty Board

A companion site for College Football 27 dynasty mode. Live at **[cfbdynastyboard.com](https://cfbdynastyboard.com)**.

## What's on it

- **Board**: all 138 teams in a sortable table with ratings, prestige and conference filters. Click a team for its full dossier.
- **Randomizer**: can't pick a team? Filter the pool and roll for one.
- **Coaches**: searchable database of head coaches and coordinators.
- **Pipelines**: each team's recruiting pipelines on a US map.
- **House rules**: generates self-imposed challenge rules for your dynasty, from casual to hardcore. Build your own rules and presets too. Your setup is saved in your browser.

## Run it locally

The whole site is one file, `public/index.html`. Open it in a browser. There's nothing to install or build.

## Test

```bash
node check.mjs
```

Opens the site in headless Chrome, clicks through every tab, and checks the www redirect. Prints `PASS` or a list of what broke. Needs Node 22+ and Google Chrome.

## Deploy

Pushing to `main` deploys automatically. GitHub Actions runs the test first and only deploys if it passes. The site runs on Cloudflare Workers (config in `wrangler.jsonc`). Deploying needs two repo secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Layout

| Path | What it is |
|---|---|
| `public/` | Everything published to the site: the page, favicons, old-URL redirects |
| `src/index.js` | Small Worker that redirects `www` to the main domain |
| `check.mjs` | The test |
| `.github/workflows/deploy.yml` | Test-then-deploy pipeline |
| `CLAUDE.md` | Notes for Claude Code on how the code is organized |
