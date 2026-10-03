// Adds every roster player's archetype to public/js/data/teams.js, from TeamCrafters' CFB 27 team pages (owner's decision,
// Oct 2026, same source as tools/coach-trees.mjs). Run: node tools/player-archetypes.mjs [roster]   (Node 22+, no npm).
// roster defaults to ROSTER below. ~2.5 minutes: the coach list (for team page ids), then one team page per team, 1 second
// apart. Raw pages cached in .tc-cache/ (git-ignored). Writes r[6] = index into PARCH (a line added to teams.js) per player.
import fs from "node:fs";
import { join } from "node:path";
const ROSTER = process.argv[2] || "10-02-26";
const ROOT = join(import.meta.dirname, ".."), CACHE = join(ROOT, ".tc-cache", ROSTER); fs.mkdirSync(CACHE, { recursive: true });
const BASE = `https://www.teamcrafters.net/rosters/CFB27/${ROSTER}`, wait = ms => new Promise(r => setTimeout(r, ms));
async function get(url, file){
  const f = join(CACHE, file); if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } }); await wait(1000);
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  const s = await r.text(); fs.writeFileSync(f, s); return s;
}
const ent = s => s.replace(/<!-- -->/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

const list = await get(`${BASE}/coaches`, "coaches.html");
if (/not publicly released|preview roster/.test(list)) throw new Error(`${ROSTER} is a preview roster on TeamCrafters; pick a released one`);
const ver = ROSTER.split("-").map(Number).join("/");   // "10-02-26" -> "10/2/26"
const teams = {};
for (const m of list.matchAll(/href="\/rosters\/CFB27\/[^/]+\/(\d+)\/coach-trees">([^<]+)<\/a>/g)) teams[m[1]] ??= ent(m[2]).trim();
console.log(Object.keys(teams).length, "teams");

// Each player card on a team page: link to the player, name, then "<POS> #<jersey> • height • year [RS] • <Archetype>".
const tc = {};
for (const [id, team] of Object.entries(teams)) {
  const s = ent(await get(`${BASE}/${id}`, `team-${id}.html`)), ps = {};
  for (const p of s.split(/href="\/rosters\/CFB27\/[^/]+\/\d+\/(?=[a-z0-9-]+")/).slice(1)) {
    const m = p.match(/^([a-z0-9-]+)"[^>]*>(?:<[^>]+>)*([^<]+)<[\s\S]*?rounded">([A-Z]+)<\/span><span>#\d+<\/span>[\s\S]*?<span>•<\/span><span>([^<•]+)<\/span><\/div>/);
    if (m) ps[m[1]] ??= { name: m[2].replace(/\*$/, "").trim(), pos: m[3], arch: m[4].trim() };
  }
  tc[team] = Object.values(ps); process.stdout.write(`${team} ${tc[team].length}, `);
}

// Match to DATA: team by "Name Nickname" (TA for labels that differ), then player by name (position breaks ties).
const FILE = join(ROOT, "public/js/data/teams.js"), lines = fs.readFileSync(FILE, "utf8").split("\n");
const di = lines.findIndex(l => l.startsWith("const DATA = ")), DATA = JSON.parse(lines[di].slice(13, -1));
const n = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const TA = { "Delaware Fightin' Blue Hens":"Delaware", "Sacramento State University Hornets":"Sacramento State", "FIU Panthers":"Florida International",
  "Miami (FL) Hurricanes":"Miami", "Miami (OH) RedHawks":"Miami University", "South Florida Bulls":"USF", "Southern Miss Golden Eagles":"Southern Mississippi" };
const POS = { LE:"LEDG", RE:"REDG", MLB:"MIKE", LOLB:"WILL", ROLB:"SAM", HB:"HB" };
const byTeam = {}; for (const [t, ps] of Object.entries(tc)) byTeam[n(TA[t] || t)] = ps;
const P = [], PI = {}, miss = []; let hit = 0, total = 0;
for (const t of DATA) {
  const pool = byTeam[n(t.n + t.nk)] || byTeam[n(t.n)];
  if (!pool) miss.push(t.n + " (team)");
  for (const r of t.r) {
    r.length = 6; total++;
    const same = (pool || []).filter(x => n(x.name) === n(r[0])), x = same.find(x => (POS[x.pos] || x.pos) === r[1]) || same[0];
    if (x) { r[6] = PI[x.arch] ??= P.push(x.arch) - 1; hit++; }
  }
}
console.log(`\n${hit}/${total} players matched, ${P.length} archetypes: ${P.join(", ")}${miss.length ? ". Missing: " + miss.join("; ") : ""}`);
if (hit < total * 0.9) throw new Error("Too few players matched; not writing teams.js");
lines[di] = `const DATA = ${JSON.stringify(DATA)};`;
const pl = `const PARCH = ${JSON.stringify({ v: ver, a: P })};   // player archetypes (tools/player-archetypes.mjs): roster r[6] indexes PARCH.a`;
const pi = lines.findIndex(l => l.startsWith("const PARCH = "));
if (pi >= 0) lines[pi] = pl; else lines.splice(di + 1, 0, pl);
fs.writeFileSync(FILE, lines.join("\n"));
