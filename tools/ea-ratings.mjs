// Rebuilds public/js/data/ratings.js from EA's College Football 27 ratings pages (the current ratings week).
// Run: node tools/ea-ratings.mjs   (Node 22+, no npm). ~2.5 minutes: one request per team, 1 second apart.
// Team ids/labels come from tools/ea-teams.json (EA's own team list; a few labels are EA url names, e.g. "U Mass").
// Matching to DATA rosters: same team, same name (accents and Jr./III ignored); then a unique same-last-name,
// same-position fallback for nicknames (Cam = Cameron). Players EA doesn't list get no extended ratings.
import fs from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dirname, ".."), CACHE = join(ROOT, ".ea-cache"); fs.mkdirSync(CACHE, { recursive: true });
const UA = { headers: { "user-agent": "Mozilla/5.0" } }, wait = ms => new Promise(r => setTimeout(r, ms));
const page = await (await fetch("https://www.ea.com/games/ea-sports-college-football/ratings", UA)).text();
const B = page.match(/"buildId":"([^"]+)"/)?.[1]; if (!B) throw new Error("Couldn't find EA's buildId; their page layout changed.");
// EA url names: "Texas A&M" may be texas-am or texas-a-m, so try both spellings.
const slugs = l => [...new Set(["", "-"].map(amp => l.toLowerCase().replace(/&/g, amp).replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")))];
const all = [];
for (const [id, label] of JSON.parse(fs.readFileSync(join(import.meta.dirname, "ea-teams.json")))) {
  // Each team's download is cached in .ea-cache for this build, so a rerun after a failure only fetches what's missing.
  const cf = join(CACHE, `${B}-${id}.json`); let items = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf)) : null;
  for (const s of items ? [] : slugs(label)) {
    const r = await fetch(`https://www.ea.com/_next/data/${B}/en/games/ea-sports-college-football/ratings/teams-ratings/${s}/${id}.json?franchiseSlug=ea-sports-college-football&pageType=teams-ratings&slug1=${s}&slug2=${id}`, UA);
    if (r.ok) { items = (await r.json()).pageProps.ratingsEntries.items; fs.writeFileSync(cf, JSON.stringify(items)); }
    await wait(1000); if (items) break;
  }
  if (!items) throw new Error(`EA team ${label} (${id}) not found under ${slugs(label).join(" or ")}; fix its url name in tools/ea-teams.json`);
  all.push(...items.map(p => ({ first: p.firstName, last: p.lastName, pos: p.position?.shortLabel, ovr: p.overallRating, ht: p.height, wt: p.weight,
    town: p.homeTown, st: p.homeState, num: p.jerseyNum, it: p.iteration?.label, team: p.team?.label, stats: Object.fromEntries(Object.entries(p.stats).map(([k, v]) => [k, v?.value ?? v])) })));
  process.stdout.write(`${label} ${items.length}  `);
}
fs.writeFileSync(join(CACHE, "ea-players.json"), JSON.stringify(all));
// Match to DATA.
const DATA = new Function(fs.readFileSync(join(ROOT, "public/js/data/teams.js"), "utf8").replace("const DATA =", "return"))();
const TA = { "Cal":"California", "Connecticut":"UConn", "FIU":"Florida International", "FAU":"Florida Atlantic", "Miami (Ohio)":"Miami University",
  "Middle Tennessee State":"Middle Tennessee", "Southern Miss":"Southern Mississippi", "UMass":"UMass", "U Mass":"UMass", "Hawaii":"Hawai'i" };
const SUF = /^(jr|sr|ii|iii|iv|v)\.?$/i;
const n = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter((w, i, a) => !(i === a.length - 1 && i > 0 && SUF.test(w))).join("").replace(/[^a-z0-9]/g, "");
const last = s => n(s.trim().split(/\s+/).filter((w, i) => !(i > 0 && SUF.test(w))).pop() || "");
const byTeam = {}; for (const p of all) (byTeam[TA[p.team] || p.team] ||= []).push(p);
const K = Object.keys(all[0].stats).filter(k => k !== "overall" && k !== "runningStyle"), P = {}; let matched = 0;
const row = p => [p.ovr, p.ht, p.wt, p.num, (p.town || "") + (p.st ? ", " + p.st : ""), K.map(k => String(Math.min(99, Math.max(0, p.stats[k] ?? 0))).padStart(2, "0")).join("")];
for (const t of DATA) {
  const pool = [...(byTeam[t.n] || [])], o = P[t.n] = {}, rest = [];
  if (!pool.length) console.warn(`\nNo EA team for ${t.n}: add it to TA in tools/ea-ratings.mjs`);
  for (const r of t.r) { const i = pool.findIndex(p => n(p.first + " " + p.last) === n(r[0])); if (i >= 0) { o[r[0]] = row(pool[i]); pool.splice(i, 1); matched++; } else rest.push(r); }
  for (const r of rest) { const c = pool.filter(p => last(p.first + " " + p.last) === last(r[0]) && p.pos === r[1]);
    if (c.length === 1 && rest.filter(x => last(x[0]) === last(r[0]) && x[1] === r[1]).length === 1) { o[r[0]] = row(c[0]); pool.splice(pool.indexOf(c[0]), 1); matched++; } }
}
const it = all[0].it?.replace(" Ratings", "") || "Current";
fs.writeFileSync(join(ROOT, "public/js/data/ratings.js"), `// EA SPORTS College Football 27 player ratings (${it}), matched to DATA rosters by team + exact roster name.
// One line, built by tools/ea-ratings.mjs: p[team][name] = [ovr, height in, weight lb, jersey, hometown, ratings] where ratings is k.length two-digit numbers in k order.
// Loaded only when the Player Database needs it (plRatings). Rebuild it, never edit by hand.
const RATINGS = ${JSON.stringify({ it, k: K, p: P })};
`);
console.log(`\nEA players ${all.length}, matched ${matched}, ratings week "${it}". Wrote public/js/data/ratings.js. Run node check.mjs next.`);
