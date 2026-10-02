// Rebuilds public/js/data/coaches.js: every coach's purchased abilities (by archetype) and specialty, from TeamCrafters'
// CFB 27 roster pages (owner's decision, Oct 2026). Run: node tools/coach-trees.mjs [roster]   (Node 22+, no npm).
// roster defaults to ROSTER below; use the newest one TeamCrafters doesn't mark as a preview. ~2.5 minutes: the coach
// list, then one "coach trees" page per team (all three coaches), 1 second apart. Raw pages cached in .tc-cache/ (git-ignored).
import fs from "node:fs";
import { join } from "node:path";
const ROSTER = process.argv[2] || "09-25-26";
const ROOT = join(import.meta.dirname, ".."), CACHE = join(ROOT, ".tc-cache", ROSTER); fs.mkdirSync(CACHE, { recursive: true });
const BASE = `https://www.teamcrafters.net/rosters/CFB27/${ROSTER}`, wait = ms => new Promise(r => setTimeout(r, ms));
async function get(url, file){
  const f = join(CACHE, file); if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } }); await wait(1000);
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  const s = await r.text(); fs.writeFileSync(f, s); return s;
}
const text = s => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "\n").split("\n").map(l => l.trim()
  .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")).filter(Boolean);

const list = await get(`${BASE}/coaches`, "coaches.html");
if (/not publicly released|preview roster/.test(list)) throw new Error(`${ROSTER} is a preview roster on TeamCrafters; pick a released one`);
const ver = /^\d\d-\d\d-\d\d$/.test(ROSTER) ? ROSTER.split("-").map(Number).join("/") : ROSTER;   // "09-25-26" -> "9/25/26"
// Coach rows: name, specialty, team page id, team label ("Georgia Bulldogs"). The page draws each coach twice (table and cards).
const spec = {}, teams = {};
for (const m of list.matchAll(/href="\/rosters\/CFB27\/[^/]+\/coaches\/\d+">([^<]+)<\/a><div class="mt-0\.5 text-xs text-content-faint">([^<]*)<\/div>[\s\S]{0,400}?href="\/rosters\/CFB27\/[^/]+\/(\d+)\/coach-trees">([^<]+)<\/a>/g)) {
  const [, name, sp, id, team] = m.map(x => x && text(x)[0] || x); teams[id] = team; spec[id + "|" + name] = sp;
}
console.log(Object.keys(teams).length, "teams,", Object.keys(spec).length, "coaches in the list");

// A team page lists each coach: role, name, archetype, ..., then per archetype "<Archetype> | n | categories | | k | abilities",
// then per category "<Category> | count" followed by count abilities: name, optional "Core" tag, description.
const ROLE = { "Head Coach": "HC", "Offensive Coordinator": "OC", "Defensive Coordinator": "DC" };
const out = [];
for (const [id, team] of Object.entries(teams)) {
  const L = text(await get(`${BASE}/${id}/coach-trees`, `${id}.html`));
  let c = null;
  for (let i = 0; i < L.length; i++) {
    if (ROLE[L[i]] && L[i + 2] && L[i + 3] === "Level") { c = { team, id, role: ROLE[L[i]], name: L[i + 1], tree: {} }; out.push(c); i += 3; continue; }
    if (!c || L[i + 2] !== "categories |" || L[i + 4] !== "abilities") continue;
    const arch = L[i], cats = +L[i + 1], ab = c.tree[arch] = []; i += 5;
    for (let k = 0; k < cats; k++) {
      const n = +L[i + 1]; i += 2;
      for (let j = 0; j < n; j++) { const core = L[i + 1] === "Core"; ab.push([L[i], core ? 1 : 0, L[i + (core ? 2 : 1)]]); i += core ? 3 : 2; }
    }
    i--;
  }
  process.stdout.write(`${team} `);
}
fs.writeFileSync(join(CACHE, "coaches.json"), JSON.stringify(out));

// Match to DATA staff: team by "Name Nickname", then coach by name, else by role (a renamed or generic coach).
const DATA = new Function(fs.readFileSync(join(ROOT, "public/js/data/teams.js"), "utf8").replace("const DATA =", "return"))();
const n = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
// TeamCrafters team labels that don't read as our "Name Nickname".
const TA = { "Delaware Fightin' Blue Hens":"Delaware", "Sacramento State University Hornets":"Sacramento State", "FIU Panthers":"Florida International",
  "Miami (FL) Hurricanes":"Miami", "Miami (OH) RedHawks":"Miami University", "South Florida Bulls":"USF", "Southern Miss Golden Eagles":"Southern Mississippi" };
const byTeam = {}; for (const c of out) (byTeam[n(TA[c.team] || c.team)] ||= []).push(c);
const A = [], AI = {}, C = {}, miss = [];
const idx = ([nm, core, d]) => AI[nm + "|" + d] ??= A.push([nm, d, core]) - 1;
for (const t of DATA) {
  const pool = byTeam[n(t.n + t.nk)] || byTeam[n(t.n)] || [];
  if (!pool.length) { miss.push(t.n + " (team)"); continue; }
  for (const s of t.st) {
    const c = pool.find(x => n(x.name) === n(s[1])) || pool.find(x => x.role === s[0]);
    if (!c) { miss.push(`${t.n}: ${s[1]}`); continue; }
    C[t.n + "|" + s[1]] = [spec[c.id + "|" + c.name] || "", Object.fromEntries(Object.entries(c.tree).map(([a, ab]) => [a, ab.map(idx)]))];
  }
}
const total = DATA.reduce((s, t) => s + t.st.length, 0);
console.log(`\n${Object.keys(C).length}/${total} coaches matched, ${A.length} distinct abilities.${miss.length ? " Missing: " + miss.join("; ") : ""}`);
if (Object.keys(C).length < total * 0.95) throw new Error("Too few coaches matched; not writing coaches.js");
fs.writeFileSync(join(ROOT, "public/js/data/coaches.js"),
  `// Generated by tools/coach-trees.mjs from TeamCrafters' CFB 27 ${ver} roster. Don't edit by hand.\n`
  + `// CTREE.c["Team|Coach"] = [specialty, {archetype: [ability index]}]; CTREE.a[i] = [name, description, core perk 1/0].\n`
  + `const CTREE = ${JSON.stringify({ v: ver, a: A, c: C })};\n`);
