// Rebuilds every roster and team rating (DATA t.r, o/of/df, roster averages ap/ao/ad) and public/js/data/ratings.js from the game's main-menu roster.
// Run: node tools/game-rosters.mjs ["<Documents>/EA SPORTS College Football 27/saves/ROSTER-Official"]   (Node 22+, no npm)
// ROSTER-Official is the official roster the main menu uses (no dynasty coach boosts or progression). It's only read.
// Format: FBCHUNKS header, then one zlib stream of tagged fields (3-byte tag = 4 six-bit chars, 1-byte type, value).
// Players are a run of records with tags like PFNA/PLNA (names), POVR, PSPD...; teams are records with TDNA/TGID.
import fs from "node:fs";
import zlib from "node:zlib";
import { join } from "node:path";
import { homedir } from "node:os";
const FILE = process.argv[2] || join(homedir(), "Documents/EA SPORTS College Football 27/saves/ROSTER-Official");
const ROOT = join(import.meta.dirname, ".."), TEAMS = join(ROOT, "public/js/data/teams.js"), RATS = join(ROOT, "public/js/data/ratings.js");

// ---- reader
const raw = fs.readFileSync(FILE);
let d; for (let i = 0; i < 512 && !d; i++) if (raw[i] === 0x78) try { d = zlib.inflateSync(raw.subarray(i)); } catch {}
if (!d) throw new Error("Couldn't find the roster data in " + FILE);
const tagOf = s => { let v = 0; for (const ch of s.padEnd(4, " ")) v = (v << 6) | ((ch.charCodeAt(0) - 32) & 0x3f); return Buffer.from([v >> 16 & 255, v >> 8 & 255, v & 255]); };
const name = v => { let s = ""; for (let i = 3; i >= 0; i--) s += String.fromCharCode(((v >> (i * 6)) & 0x3f) + 32); return s.trim(); };
let p = 0;
const int = () => { let b = d[p++], neg = b & 0x40, v = b & 0x3f, sh = 6; while (b & 0x80) { b = d[p++]; v += (b & 0x7f) * 2 ** sh; sh += 7; } return neg ? -v : v; };
const str = () => { const n = int(), s = d.subarray(p, p + n - 1).toString("latin1"); p += n; return s; };
function value(t){
  if (t === 0) return int();
  if (t === 1) return str();
  if (t === 2) { const n = int(); p += n; return null; }
  if (t === 3) return record();
  if (t === 4) { const st = d[p++], n = int(), a = []; for (let i = 0; i < n; i++) a.push(value(st)); return a; }
  if (t === 0xa) { p += 4; return d.readFloatBE(p - 4); }
  throw new Error(`Unknown field type ${t} at ${p - 1}`);
}
function record(){ const o = {}; while (d[p] !== 0) { const k = name((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]); p += 3; o[k] = value(d[p++]); } p++; return o; }
// A run of records that each contain `key`, starting at the first record holding it (found by trying start offsets just before it).
function run(key){
  const at = d.indexOf(tagOf(key));
  for (let s = Math.max(0, at - 3000); s <= at; s++) {
    p = s;
    try { const r = record(); if (key in r && p > at) { const out = [r]; for (;;) { const q = p; try { const x = record(); if (!(key in x)) break; out.push(x); } catch { p = q; break; } } return out; } } catch {}
  }
  throw new Error("No records with " + key);
}
const players = run("PFNA"), teams = run("TDNA");

// ---- game codes -> site values
const POS = ["QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT", "LEDG", "REDG", "DT", "SAM", "MIKE", "WILL", "CB", "FS", "SS", "K", "P"];
const YR = ["FR", "SO", "JR", "SR"];
const STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
  "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
// PLTY (player type) -> archetype name in PARCH.
const ARCH = {0:"Pocket Passer", 2:"Backfield Creator", 3:"Dual Threat", 4:"Pure Runner", 5:"Contact Seeker", 6:"East/West Playmaker", 7:"Backfield Threat",
  10:"Elusive Bruiser", 12:"Blocking", 13:"Utility", 14:"Speedster", 15:"Route Artist", 17:"Elusive Route Runner", 18:"Gritty Possession", 19:"Gadget",
  20:"Contested Specialist", 22:"Pure Blocker", 23:"Vertical Threat", 24:"Physical Route Runner", 25:"Gritty Possession", 26:"Pure Possession", 27:"Pass Protector",
  28:"Raw Strength", 30:"Agile", 31:"Pass Protector", 32:"Raw Strength", 34:"Agile", 35:"Pass Protector", 37:"Raw Strength", 38:"Agile", 39:"Speed Rusher",
  40:"Power Rusher", 41:"Pure Power", 42:"Edge Setter", 43:"Gap Specialist", 44:"Pure Power", 45:"Speed Rusher", 46:"Power Rusher", 48:"Signal Caller",
  49:"Lurker", 50:"Thumper", 51:"Signal Caller", 52:"Lurker", 53:"Thumper", 54:"Bump and Run", 55:"Boundary", 56:"Zone", 57:"Field", 58:"Coverage Specialist",
  59:"Hybrid", 60:"Box Specialist", 61:"Accurate", 62:"Power"};
// Rating tags in RATINGS.k order.
const RTAG = {acceleration:"PACC", agility:"PAGI", jumping:"PJMP", stamina:"PSTA", strength:"PSTR", awareness:"PAWR", bCVision:"PBCV", blockShedding:"PBSG",
  breakSack:"PBSK", breakTackle:"PBKT", carrying:"PCAR", catchInTraffic:"PLCI", catching:"PCTH", changeOfDirection:"PELU", deepRouteRunning:"PDRR",
  finesseMoves:"PFMS", hitPower:"PLHT", impactBlocking:"PLIB", injury:"PINJ", jukeMove:"PLJM", kickAccuracy:"PKAC", kickPower:"PKPR", kickReturn:"PKRT",
  leadBlock:"PLBK", manCoverage:"PLMC", mediumRouteRunning:"PMRR", passBlock:"PPBK", passBlockFinesse:"PPBF", passBlockPower:"PPBS", playAction:"PPLA",
  playRecognition:"PLPR", powerMoves:"PLPM", press:"PLPE", pursuit:"PLPU", release:"PLRL", runBlock:"PRBK", runBlockFinesse:"PRBF", runBlockPower:"PRBS",
  shortRouteRunning:"SRRN", spectacularCatch:"PLSC", speed:"PSPD", spinMove:"PLSM", stiffArm:"PLSA", tackle:"PTAK", throwAccuracyDeep:"PTAD",
  throwAccuracyMid:"PTAM", throwAccuracyShort:"PTAS", throwOnTheRun:"PTOR", throwPower:"PTHP", throwUnderPressure:"PTUP", toughness:"PTGH",
  trucking:"PLTR", zoneCoverage:"PLZC"};
// Game team names that differ from the site's.
const TEAM = {"App St.":"Appalachian State", "C. Michigan":"Central Michigan", "C. Carolina":"Coastal Carolina", "E. Michigan":"Eastern Michigan",
  "FIU":"Florida International", "FLA Atlantic":"Florida Atlantic", "Ga Southern":"Georgia Southern", "Jax State":"Jacksonville State",
  "Miami (OH)":"Miami University", "MTSU":"Middle Tennessee", "Mississippi St":"Mississippi State", "New Mexico St.":"New Mexico State",
  "NIU":"Northern Illinois", "San Diego St.":"San Diego State", "Southern Miss":"Southern Mississippi", "Massachusetts":"UMass",
  "Washington St.":"Washington State", "W. Kentucky":"Western Kentucky", "W. Michigan":"Western Michigan", "Kennesaw St.":"Kennesaw State",
  "NDSU":"North Dakota State", "Sac State":"Sacramento State"};
const OFF = ["QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT"];

// ---- write
const src = fs.readFileSync(TEAMS, "utf8"), lines = src.split("\n");
const [DATA, PARCH] = new Function(src + ";return [DATA, PARCH]")();
const RAT = new Function(fs.readFileSync(RATS, "utf8") + ";return RATINGS")();
const teamOf = {}; for (const t of teams) teamOf[t.TGID] = TEAM[t.TDNA] || t.TDNA;
const byTeam = {}; for (const r of players) (byTeam[teamOf[r.TGID]] ??= []).push(r);
const two = v => String(Math.max(0, Math.min(99, v | 0))).padStart(2, "0");
const avg = a => a.length ? +(a.reduce((s, r) => s + r[3], 0) / a.length).toFixed(2) : 0;
const P = {}; let n = 0;
const teamRec = {}; for (const t of teams) teamRec[TEAM[t.TDNA] || t.TDNA] = t;
for (const t of DATA) {
  const ps = byTeam[t.n]; if (!ps) throw new Error(`${t.n} isn't in the roster file`);
  const tr = teamRec[t.n]; t.o = tr.TROV; t.of = tr.TROF; t.df = tr.TRDE; // team overall / offense / defense
  P[t.n] = {};
  t.r = ps.sort((a, b) => (b.POVR || 0) - (a.POVR || 0) || (b.PSPD || 0) - (a.PSPD || 0)).map(r => {
    const nm = `${r.PFNA} ${r.PLNA}`, a = PARCH.a.indexOf(ARCH[r.PLTY || 0]), st = STATES[r.PHSN || 0];
    P[t.n][nm] = [r.POVR || 0, r.PHGT || 0, (r.PWGT || 0) + 160, r.PJEN || 0, st ? `${r.PHTN}, ${st}` : r.PHTN || "",
      RAT.k.map(k => two(r[RTAG[k]] || 0)).join("")];
    n++;
    return [nm, POS[r.PPOS || 0], YR[r.PYEA || 0] + (r.PRSD === 3 ? "*" : ""), r.POVR || 0, r.PROL || 0, r.PSPD || 0, ...(a >= 0 ? [a] : [])];
  });
  t.ap = avg(t.r); t.ao = avg(t.r.filter(r => OFF.includes(r[1]))); t.ad = avg(t.r.filter(r => !OFF.includes(r[1]) && r[1] !== "K" && r[1] !== "P"));
}
const i = lines.findIndex(l => l.startsWith("const DATA = "));
lines[i] = "const DATA = " + JSON.stringify(DATA) + ";";
fs.writeFileSync(TEAMS, lines.join("\n"));
const rl = fs.readFileSync(RATS, "utf8").split("\n"), j = rl.findIndex(l => l.startsWith("const RATINGS = "));
rl[0] = "// EA SPORTS College Football 27 player ratings from the game's main-menu roster (saves/ROSTER-Official), matched to DATA rosters by team + roster name.";
rl[1] = "// One line, built by tools/game-rosters.mjs: p[team][name] = [ovr, height in, weight lb, jersey, hometown, ratings] where ratings is k.length two-digit numbers in k order.";
rl[j] = "const RATINGS = " + JSON.stringify({ it: "game roster", k: RAT.k, p: P }) + ";";
fs.writeFileSync(RATS, rl.join("\n"));
console.log(`${n} players on ${DATA.length} teams from ${FILE}.`);
