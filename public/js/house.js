// House Rules tab: built-in rules and presets, dealing, custom rules and presets, the rule editor.
/* ---- house rules ---- */
const HREG = [...Object.keys(MAP.reg), ...Object.keys(MAP.split)];
const stOf = t => (t.sl || "").split(", ").pop();
const regsIn = s => HREG.filter(p => MAP.split[p] ? MAP.split[p].s === s : MAP.reg[p].includes(s));
const homeRegs = t => regsIn(stOf(t));
const pipesAt = (t, min) => t.pl.filter(p => p[1] >= min).map(p => p[0]);
const and = a => a.length < 3 ? a.join(" and ") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const P4 = new Set(["SEC", "Big Ten", "Big 12", "ACC"]);
const isP4 = t => P4.has(t.c) || t.n === "Notre Dame";
const purist = t => { const a = pipesAt(t, 3); return a.length >= 3 ? [3, a] : [2, pipesAt(t, 2)]; };
const top3 = t => t.pl.filter(p => p[1] > 0).sort((a, b) => b[2] - a[2]).slice(0, 3).map(p => p[0]);
const footprint = t => [...new Set(DATA.filter(x => x.c === t.c).flatMap(x => regsIn(stOf(x))))];
const inState = t => DATA.filter(x => x !== t && stOf(x) === stOf(t) && x.c !== t.c).map(x => x.n);
const starCap = t => Math.min(4, Math.max(2, Math.floor(t.p) + 1));
function standard(t){
  const p = t.p;
  const pre = `${t.n} is a ${p.toFixed(1)}★ program. `;
  if (p >= 4.5) return pre + "Make the playoff in at least two of your first four seasons, then never miss it twice in a row, or you resign.";
  if (p >= 3.5) return pre + "Win 9 or more games by season three. After that, two straight seasons under 9 wins and you resign.";
  if (p >= 2) return pre + "Reach a bowl by season two. Miss a bowl twice in a row after that and you resign.";
  return pre + "Post a winning season by year four or you resign.";
}

const HCATS = [["ter","Recruiting territory"],["star","Star power"],["port","Transfer portal"],["ros","Roster & snaps"],
  ["nil","NIL"],["sch","Scheduling"],["job","Job security"],["game","Game day"]];
const HCATN = Object.fromEntries(HCATS);
/* c: category, l: strain 1-3, x: rule text for a program, w: does it apply, reg: regions to shade on the map */
const HRULES = [
  {id:"ter-pipe", c:"ter", n:"Pipeline purist", l:2, w:t => purist(t)[1].length >= 2, reg:t => purist(t)[1],
    x:t => { const [k, a] = purist(t); return `High school offers go only to regions where ${t.n} holds a Tier ${k} pipeline or better: ${and(a)}.`; }},
  {id:"ter-home", c:"ter", n:"Home-state only", l:3, w:t => homeRegs(t).length > 0, reg:homeRegs,
    x:t => `Every high school signee comes from ${t.n}'s home state: ${and(homeRegs(t))}.`},
  {id:"ter-top3", c:"ter", n:"Big three", l:3, w:t => top3(t).length === 3, reg:top3,
    x:t => `Recruit only in your three strongest pipelines: ${and(top3(t))}.`},
  {id:"ter-foot", c:"ter", n:"Conference footprint", l:2, w:t => t.c !== "Independent", reg:footprint,
    x:t => `Recruit only in regions that host a ${t.c} school (${footprint(t).length} of 42 regions, shaded below).`},
  {id:"ter-local", c:"ter", n:"Stay local", l:1, w:t => homeRegs(t).length > 0, reg:homeRegs,
    x:t => `At least half of every signing class comes from ${and(homeRegs(t))}.`},
  {id:"ter-cap", c:"ter", n:"Border control", l:1, w:t => pipesAt(t, 1).length > 0, reg:t => pipesAt(t, 1),
    x:t => `No more than three signees per class from regions where ${t.n} has no pipeline. Your pipelines are shaded below.`},
  {id:"ter-flag", c:"ter", n:"Plant a flag", l:2, w:() => true,
    x:() => `Each offseason, pick one region where you have no pipeline and sign at least three players from it.`},

  {id:"star-none", c:"star", n:"No blue-chips", l:3, w:() => true,
    x:() => `No 4★ or 5★ high school recruits. Win with 3★ players and below.`},
  {id:"star-cap", c:"star", n:"Earn your stars", l:2, w:t => t.p < 4,
    x:t => `No recruit above ${starCap(t)}★ while your prestige sits below ${starCap(t)}★. ${t.n} is at ${t.p.toFixed(1)}★ today.`},
  {id:"star-one", c:"star", n:"One five-star", l:1, w:() => true,
    x:() => `Sign at most one 5★ recruit per class.`},
  {id:"star-half", c:"star", n:"Balanced class", l:1, w:() => true,
    x:() => `No more than half of any signing class can be rated 4★ or better.`},
  {id:"star-gems", c:"star", n:"Diamonds in the rough", l:2, w:() => true,
    x:() => `Every class includes at least three recruits rated 2★ or lower.`},
  {id:"star-scout", c:"star", n:"Scouted only", l:1, w:() => true,
    x:() => `Only offer recruits you have fully scouted. No offers on star rating alone.`},
  {id:"star-small", c:"star", n:"Small class", l:2, w:() => true,
    x:() => `Sign no more than 18 high school recruits per class.`},

  {id:"port-none", c:"port", n:"Closed portal", l:3, w:() => true,
    x:() => `No incoming transfers. Every player on the roster signed with you out of high school.`},
  {id:"port-patch", c:"port", n:"Patch the holes", l:1, w:() => true,
    x:() => `Up to three transfers a year, and only at positions where your projected starter is under 75 OVR.`},
  {id:"port-up", c:"port", n:"Step-up transfers", l:2, w:() => true,
    x:t => isP4(t) ? `Transfers must come from Group of Five or FCS programs. No power-conference transfers.`
                   : `Transfers must come from FCS programs. No players leaving FBS schools.`},
  {id:"port-poach", c:"port", n:"No poaching", l:1, w:t => t.c !== "Independent",
    x:t => `Never sign a transfer who played last season for a ${t.c} school.`},
  {id:"port-only", c:"port", n:"Portal program", l:2, w:() => true,
    x:() => `Cap high school signees at 8 per class. The rest of the roster is built through the portal.`},
  {id:"port-vet", c:"port", n:"Veterans only", l:1, w:() => true,
    x:() => `Transfers must be juniors or seniors. No freshman or sophomore transfers.`},

  {id:"ros-red", c:"ros", n:"Redshirt rule", l:1, w:() => true,
    x:() => `Every freshman under 70 OVR redshirts his first season.`},
  {id:"ros-sen", c:"ros", n:"Seniority", l:2, w:() => true,
    x:() => `When two players are within 3 OVR of each other, the older one starts.`},
  {id:"ros-qb", c:"ros", n:"Homegrown QB", l:2, w:() => true,
    x:() => `Your starting QB must be a player you signed out of high school.`},
  {id:"ros-auto", c:"ros", n:"Auto depth chart", l:1, w:() => true,
    x:() => `Use the auto-generated depth chart all season. No manual edits.`},
  {id:"ros-kids", c:"ros", n:"Play the kids", l:2, w:() => true,
    x:() => `At least two freshmen or redshirt freshmen start every season.`},
  {id:"ros-cut", c:"ros", n:"No cuts", l:1, w:() => true,
    x:() => `Never cut a player. Every signee stays until he graduates or leaves on his own.`},
  {id:"ros-thin", c:"ros", n:"Thin roster", l:3, w:() => true,
    x:() => `Carry no more than 75 players. Depth is a luxury you don't get.`},

  {id:"nil-half", c:"nil", n:"Half budget", l:2, w:() => true,
    x:t => `Spend no more than half of ${t.n}'s ${fmt(t.nt)} NIL budget (${fmt(Math.round(t.nt / 2))}) each year.`},
  {id:"nil-zero", c:"nil", n:"Amateur hour", l:3, w:() => true,
    x:() => `Zero NIL offers. Recruit on your pitch, playing time and the program alone.`},
  {id:"nil-flat", c:"nil", n:"Flat scale", l:1, w:() => true,
    x:() => `Every recruit in a class gets the same NIL offer, regardless of stars.`},
  {id:"nil-nobid", c:"nil", n:"No bidding wars", l:1, w:() => true,
    x:() => `Never raise an NIL offer after you make it.`},
  {id:"nil-cap", c:"nil", n:"Hard cap", l:2, w:() => true,
    x:t => `No single NIL offer above 10% of your budget (${fmt(Math.round(t.nt / 10))} of ${fmt(t.nt)}).`},

  {id:"sch-fcs", c:"sch", n:"No cupcakes", l:1, w:() => true,
    x:() => `No FCS opponents on the schedule.`},
  {id:"sch-road", c:"sch", n:"Road warrior", l:2, w:() => true,
    x:() => `Play one nonconference road game against a power-conference team every season.`},
  {id:"sch-state", c:"sch", n:"In-state bragging rights", l:1, w:t => inState(t).length > 0,
    x:t => { const a = inState(t); return `Play at least one in-state school from outside the ${t.c} every season: ${and(a.slice(0, 5))}${a.length > 5 ? " or another" : ""}.`; }},
  {id:"sch-gaunt", c:"sch", n:"Gauntlet", l:3, w:() => true,
    x:() => `Every nonconference opponent must be a power-conference program.`},
  {id:"sch-hh", c:"sch", n:"Home and home", l:1, w:() => true,
    x:() => `No buy games. Every nonconference series is a home-and-home.`},

  {id:"job-std", c:"job", n:"Meet the standard", l:2, w:() => true, x:standard},
  {id:"job-hot", c:"job", n:"Hot seat", l:2, w:() => true,
    x:() => `Two straight losing seasons and you resign.`},
  {id:"job-lifer", c:"job", n:"Lifer", l:2, w:() => true,
    x:t => `Never leave ${t.n}. You retire here, whatever offers come in.`},
  {id:"job-climb", c:"job", n:"Climb the ladder", l:2, w:t => t.p < 5,
    x:t => `After season two, accept the first head coaching offer from a program with more prestige than ${t.n}.`},
  {id:"job-coord", c:"job", n:"Earn the headset", l:3, w:() => true,
    x:t => `Start as a coordinator at ${t.n}. You can't take a head coaching job until your fourth season.`},
  {id:"job-five", c:"job", n:"Five and out", l:1, w:() => true,
    x:() => `Stay exactly five seasons, then take the best offer on the table.`},

  {id:"game-heis", c:"game", n:"Heisman or bust", l:3, w:() => true,
    x:() => `Play every game on Heisman difficulty.`},
  {id:"game-4th", c:"game", n:"Play the percentages", l:1, w:() => true,
    x:() => `Go for it only on 4th and 2 or shorter past midfield. Punt or kick every other time.`},
  {id:"game-cheese", c:"game", n:"No money plays", l:1, w:() => true,
    x:() => `Never call the same play twice in a row.`},
  {id:"game-mercy", c:"game", n:"Mercy rule", l:1, w:() => true,
    x:() => `Pull your starters when you lead by 28 or more in the fourth quarter.`},
  {id:"game-side", c:"game", n:"One side of the ball", l:2, w:() => true,
    x:() => `Play offense only. The CPU handles every defensive snap.`},
  {id:"game-sim", c:"game", n:"Sim the gimmes", l:1, w:() => true,
    x:() => `Simulate any game against a team rated 10 or more points below you overall.`},
  {id:"game-qb", c:"game", n:"Ride your QB", l:2, w:() => true,
    x:() => `Never bench your starting QB midseason unless he's injured.`}
];
const HR = Object.fromEntries(HRULES.map(r => [r.id, r]));
const HPRE = [
  {id:"purist", n:"Pipeline purist", b:"Recruit only where your name already carries weight, and patch holes sparingly.",
    r:["ter-pipe","star-scout","port-patch","ros-red","nil-nobid","game-4th"]},
  {id:"home", n:"Hometown hero", b:"Build it with local kids, schedule the in-state rival and never leave.",
    r:["ter-home","star-gems","port-poach","ros-kids","sch-state","job-lifer"]},
  {id:"money", n:"Moneyball", b:"No blue-chips and half the budget. Win with the players everyone else passed on.",
    r:["ter-flag","star-none","port-up","ros-auto","nil-half","game-sim"]},
  {id:"old", n:"Old school", b:"Before the portal and NIL: redshirts, seniors and a handshake.",
    r:["ter-local","star-small","port-none","ros-sen","nil-zero","sch-hh","game-cheese"]},
  {id:"portal", n:"Portal era", b:"Reload every winter through the portal, then chase a bigger job.",
    r:["star-one","port-only","ros-cut","nil-cap","sch-road","job-climb"]},
  {id:"blue", n:"Blue-blood burden", b:"Every Saturday is a referendum. Brutal schedule, Heisman difficulty, real expectations.",
    r:["ter-foot","star-half","port-vet","nil-flat","sch-gaunt","job-std","game-heis"]},
  {id:"real", n:"Realism", b:"A light touch that makes the sim behave more like real college football.",
    r:["ter-cap","star-one","port-patch","ros-red","nil-nobid","sch-fcs","job-hot","game-mercy"]},
  {id:"carousel", n:"Coaching carousel", b:"Start with a headset, not a whistle, and recruit your conference's backyard.",
    r:["ter-foot","star-cap","port-vet","sch-road","job-coord","game-side"]}
];
/* ---- custom rules and presets (saved in this browser) ---- */
const unesc = s => { const d = document.createElement("textarea"); d.innerHTML = s; return d.value; };
const HTOK = [
  ["{school}", "School", t => t.n], ["{nickname}", "Nickname", t => t.nk], ["{conference}", "Conference", t => t.c],
  ["{home}", "Home-state regions", t => and(homeRegs(t)) || "your home state"],
  ["{pipelines}", "Strong pipelines", t => and(purist(t)[1]) || "your pipelines"],
  ["{nil}", "NIL budget", t => fmt(t.nt)], ["{prestige}", "Prestige", t => t.p.toFixed(1) + "★"],
  ["{stadium}", "Stadium", t => t.sn || "your stadium"]
];
const HMAPS = [["", "No map", null], ["home", "Home state", homeRegs], ["pipe", "Tier 3+ pipelines (Tier 2+ if fewer than three)", t => purist(t)[1]],
  ["any", "Every pipeline", t => pipesAt(t, 1)], ["top3", "Three strongest pipelines", top3], ["foot", "Conference footprint", footprint]];
const HSTR = ["", "Light", "Moderate", "Heavy"];
const fillTok = (txt, t) => HTOK.reduce((s, [k, , f]) => s.split(k).join(esc(f(t))), esc(txt));
const mkRule = u => { const m = HMAPS.find(x => x[0] === u.m);
  return {id:u.id, c:u.c, n:esc(u.n), l:u.l, u:true, w:() => true, x:t => fillTok(u.t, t), reg:u.c === "ter" && m && m[2] ? m[2] : null}; };
const HU = {rules:[], presets:[]};
const huOk = u => u && typeof u.id === "string" && HCATN[u.c] && [1,2,3].includes(u.l) && u.n && u.t;
function huSync(){
  for (let i = HRULES.length - 1; i >= 0; i--) if (HRULES[i].u) HRULES.splice(i, 1);
  HU.rules.forEach(u => HRULES.push(mkRule(u)));
  for (const k in HR) delete HR[k];
  HRULES.forEach(r => HR[r.id] = r);
}
function huLoad(){
  try {
    const s = JSON.parse(localStorage.getItem("house-custom-v1") || "null");
    if (s) { HU.rules = (s.rules || []).filter(huOk); HU.presets = (s.presets || []).filter(p => p && p.id && p.n && Array.isArray(p.r)); }
  } catch (e) {}
  huSync();
}
function huSave(){ try { localStorage.setItem("house-custom-v1", JSON.stringify(HU)); } catch (e) {} }
const presetOf = id => HPRE.find(x => x.id === id) || HU.presets.find(x => x.id === id);
const isUserPre = id => HU.presets.some(x => x.id === id);
let HF = null, HPS = null, HDEL = "";
const HSTRICT = {cas:{n:"Casual", k:4, w:[0,3,1,0]}, std:{n:"Standard", k:6, w:[0,2,3,1]}, hard:{n:"Hardcore", k:8, w:[0,0,2,3]}};
const H = {team:"UCLA", rules:[], lock:new Set(), mode:"preset", pre:"purist", strict:"std", rprog:false, src:"", edited:false, note:"", dyn:""};
const hT = () => DATA.find(x => x.n === H.team);
const catIx = id => HCATS.findIndex(c => c[0] === HR[id].c);
const hSort = () => H.rules.sort((a, b) => catIx(a) - catIx(b));
const strainOf = ids => ids.reduce((s, id) => s + HR[id].l, 0);
const strainLbl = s => s === 0 ? ["None", 0] : s <= 6 ? ["Casual", 1] : s <= 11 ? ["Standard", 2] : s <= 16 ? ["Hardcore", 3] : ["Brutal", 4];
const meter = s => `<span class="meter" aria-hidden="true">${[1,2,3,4].map(i => `<i class="${strainLbl(s)[1] >= i ? "f" : ""}"></i>`).join("")}</span>`;
const pips = l => `<span class="pips" role="img" aria-label="Strain ${l} of 3">${[1,2,3].map(i => `<i class="${l >= i ? "f" : ""}"></i>`).join("")}</span>`;
const pickW = (list, w) => {
  const tot = list.reduce((s, r) => s + (w ? w[r.l] : 1), 0);
  if (!tot) return null;
  let x = Math.random() * tot;
  for (const r of list) { x -= w ? w[r.l] : 1; if (x < 0) return r; }
  return list[list.length - 1];
};
function hPickIn(cat, t, not){
  const ok = HRULES.filter(r => r.c === cat && r.w(t) && r.id !== not);
  const w = H.mode === "random" ? HSTRICT[H.strict].w : null;
  return (pickW(ok, w) || pickW(ok, null) || {}).id;
}
function hSave(){
  try { localStorage.setItem("house-v1", JSON.stringify({team:H.team, rules:H.rules, lock:[...H.lock], mode:H.mode,
    pre:H.pre, strict:H.strict, rprog:H.rprog, src:H.src, edited:H.edited, dyn:H.dyn})); } catch (e) {}
}
function hLoad(){
  try {
    const s = JSON.parse(localStorage.getItem("house-v1") || "null");
    if (!s || !DATA.some(t => t.n === s.team)) return false;
    Object.assign(H, s, {rules:(s.rules || []).filter(id => HR[id]), lock:new Set((s.lock || []).filter(id => HR[id]))});
    return true;
  } catch (e) { return false; }
}

function hApplyPreset(id){
  const p = presetOf(id), t = hT(); if (!p) return;
  H.pre = id; H.rules = p.r.filter(r => HR[r] && HR[r].w(t)); H.lock.clear();
  H.src = (isUserPre(id) ? "Your preset · " : "Preset · ") + p.n; H.edited = false; H.note = "";
  const gone = p.r.filter(r => HR[r] && !HR[r].w(t));
  if (gone.length) H.note = `${and(gone.map(r => HR[r].n))} doesn't fit ${t.n}, so this preset runs without it.`;
}
function hDeal(){
  if (H.rprog) { const pool = DATA; H.team = pool[Math.floor(Math.random() * pool.length)].n; $("#hq").value = H.team; }
  const t = hT(), cfg = HSTRICT[H.strict];
  const kept = H.rules.filter(id => H.lock.has(id) && HR[id].w(t));
  const used = new Set(kept.map(id => HR[id].c));
  const rest = HCATS.map(c => c[0]).filter(c => !used.has(c) && c !== "ter" && c !== "star").sort(() => Math.random() - .5);
  const cats = ["ter", "star"].filter(c => !used.has(c)).concat(rest).slice(0, Math.max(0, cfg.k - kept.length));
  H.rules = kept.concat(cats.map(c => hPickIn(c, t)).filter(Boolean));
  H.lock = new Set(kept); H.pre = ""; H.src = "Random deal · " + cfg.n; H.edited = false; H.note = "";
}
function hSetTeam(n){
  if (!DATA.some(t => t.n === n) || n === H.team) return;
  H.team = n; const t = hT(), sw = [];
  H.rules = H.rules.map(id => {
    if (HR[id].w(t)) return id;
    const nu = hPickIn(HR[id].c, t, id); H.lock.delete(id);
    sw.push(nu ? `${HR[id].n} → ${HR[nu].n}` : `${HR[id].n} dropped`); return nu;
  }).filter(Boolean);
  H.note = sw.length ? `Swapped for ${t.n}: ${sw.join(", ")}.` : "";
  hDraw();
}

const IC = {
  lock:`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`,
  open:`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"/></svg>`,
  roll:`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M12 1.5v3h-3"/></svg>`,
  x:`<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13"/></svg>`
};
const tiersOf = t => Object.fromEntries(t.pl.filter(p => p[1] > 0).map(p => [p[0], p[1]]));
const STNAME = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"Washington, D.C.",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};
// National title seasons from NCAA.com FBS championship history (https://www.ncaa.com/history/football/fbs). USC 2004 is counted as won (site owner's call; NCAA.com marks it vacated).
// Counts match the game's t.ti for every team; update both when a new champion is crowned.
const TYEARS = {"Texas A&M":[1919,1939],"Indiana":[2025],"Ohio State":[1942,1954,1957,1961,1968,1970,2002,2014,2024],"Michigan":[1901,1902,1903,1904,1918,1923,1933,1948,1997,2023],"Georgia":[1980,2021,2022],"Alabama":[1925,1926,1930,1961,1964,1965,1973,1978,1979,1992,2009,2011,2012,2015,2017,2020],"LSU":[1908,1958,2003,2007,2019],"Clemson":[1981,2016,2018],"Florida State":[1993,1999,2013],"Auburn":[1957,2010],"Florida":[1996,2006,2008],"Texas":[1963,1969,1970,2005],"USC":[1931,1932,1962,1967,1972,1974,1978,2003,2004],"Miami":[1983,1987,1989,1991,2001],"Oklahoma":[1950,1955,1956,1974,1975,1985,2000],"Tennessee":[1951,1998],"Nebraska":[1970,1971,1994,1995,1997],"Washington":[1991],"Colorado":[1990],"Georgia Tech":[1917,1928,1990],"Notre Dame":[1919,1924,1929,1930,1943,1946,1947,1949,1964,1966,1973,1977,1988],"Penn State":[1911,1912,1982,1986],"BYU":[1984],"Pittsburgh":[1910,1916,1918,1937,1976],"Michigan State":[1952,1965,1966],"Arkansas":[1964],"Minnesota":[1934,1935,1936,1940,1941,1960],"Ole Miss":[1960],"Syracuse":[1959],"Iowa":[1958],"UCLA":[1954],"Maryland":[1953],"Army":[1914,1944,1945],"TCU":[1938],"Illinois":[1919,1923,1927],"Stanford":[1926],"California":[1920,1921,1922],"Rutgers":[1869]};
const tYears = t => (TYEARS[t.n] || []).map(String);
let hMapN = 0;
function hMap(regs, tiers){
  // clipPaths go in one <defs> at the top of the svg (see buildMap in pipelines.js for why).
  let defs = "";
  const on = new Set(regs), k = ++hMapN, fill = r => !tiers ? "" : ` style="fill:${tiers[r] != null ? `var(--t${tiers[r]})` : "var(--accent-soft)"}"`;
  const shapes = Object.entries(MAP.states).map(([s, d]) => {
    const split = Object.entries(MAP.split).filter(([, v]) => v.s === s);
    if (!split.length) {
      const lit = [...on].find(p => !MAP.split[p] && (MAP.reg[p] || []).includes(s));
      return `<path class="hs${lit ? " on" : ""}" d="${d}"${lit ? fill(lit) : ""}/>`;
    }
    defs += `<clipPath id="hcp${k}-${s}"><path d="${d}"/></clipPath>`;
    return `<path class="hs" d="${d}"/><g clip-path="url(#hcp${k}-${s})">` +
      split.map(([p, v]) => `<polygon class="hp${on.has(p) ? " on" : ""}"${on.has(p) ? fill(p) : ""} points="${v.pts.map(q => q.join(",")).join(" ")}"/>`).join("") + `</g>`;
  }).join("");
  const shown = [...new Set([...on].map(r => tiers && tiers[r] != null ? tiers[r] : -1))].sort((a, b) => b - a);
  const legend = tiers ? `<div class="hleg">${shown.map(x => x < 0 ? `<span><i class="sw" style="background:var(--accent-soft)"></i>No pipeline</span>`
    : `<span><i class="sw" style="background:var(--t${x})"></i>${TIERN[x]}</span>`).join("")}</div>` : "";
  return `<figure class="hmap" style="margin:12px 0 0"><svg viewBox="0 0 959 593" role="img" aria-label="Map of allowed recruiting regions"><defs>${defs}</defs>${shapes}<g class="bd">${MAP.borders}</g></svg><figcaption>Shaded: where you may recruit (${on.size} of 42 regions)</figcaption>${legend}</figure>`;
}
function preBtn(p, ok, ps){
  const on = H.pre === p.id && !H.edited && /^(Preset|Your preset) · /.test(H.src);
  return `<button class="pre" type="button" data-pre="${p.id}" aria-pressed="${on}">
      <b>${esc(p.n)}</b><span class="meter-wrap" title="${strainLbl(ps)[0]}">${meter(ps)}</span><span class="pb">${p.b ? esc(p.b) + " " : ""}<span style="color:var(--faint)">&middot; ${ok.length} ${ok.length === 1 ? "rule" : "rules"}</span></span></button>`;
}
function hDraw(){
  hSort();
  const t = hT(), s = strainOf(H.rules), [sl] = strainLbl(s);
  document.querySelectorAll("#hseg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.hm === H.mode));
  $("#hPre").hidden = H.mode !== "preset"; $("#hRnd").hidden = H.mode !== "random";
  $("#hPre").innerHTML = HPRE.map(p => {
    const ok = p.r.filter(r => HR[r].w(t)), ps = strainOf(ok);
    return preBtn(p, ok, ps);
  }).join("") + (HU.presets.length ? `<h3 class="uph">Your presets</h3>` + HU.presets.map(p => {
    const ok = p.r.filter(r => HR[r] && HR[r].w(t)), ps = strainOf(ok);
    return `<div class="uprow">${preBtn(p, ok, ps)}<div class="updel">${HDEL === p.id
      ? `<button class="chip" type="button" data-pdel="${p.id}" data-yes="1">Delete</button><button class="chip" type="button" data-pkeep="1">Keep</button>`
      : `<button class="ib" type="button" data-pdel="${p.id}" aria-label="Delete preset ${esc(p.n)}" title="Delete preset">${IC.x}</button>`}</div></div>`;
  }).join("") : "");
  $("#hstrict").innerHTML = Object.entries(HSTRICT).map(([k, v]) =>
    `<button class="chip" type="button" data-s="${k}" aria-pressed="${H.strict === k}">${v.n}<small class="mono">${v.k} rules</small></button>`).join("");
  $("#hrprog").setAttribute("aria-pressed", H.rprog);
  $("#hdeal").textContent = H.src.startsWith("Random") ? "Deal again" : "Deal house rules";
  if ($("#hq") !== document.activeElement) $("#hq").value = H.team;

  const rows = H.rules.map(id => {
    const r = HR[id], lk = H.lock.has(id), alt = HRULES.some(q => q.c === r.c && q.id !== id && q.w(t));
    const reg = r.reg ? r.reg(t) : null;
    return `<li class="rule" data-id="${id}">
      <div><span class="rcat">${HCATN[r.c]}</span>
        <div class="rttl">${r.n} ${pips(r.l)}${r.u ? `<span class="ctag">Custom</span>` : ""}${lk ? `<span class="lkt">Locked</span>` : ""}</div>
        <p>${r.x(t)}</p>${reg && reg.length ? hMap(reg, tiersOf(t)) : ""}</div>
      <div class="racts">
        <button class="ib" type="button" data-act="lock" aria-pressed="${lk}" aria-label="${lk ? "Unlock" : "Lock"} ${r.n}" title="${lk ? "Unlock" : "Lock so dealing again keeps it"}">${lk ? IC.lock : IC.open}</button>
        <button class="ib" type="button" data-act="roll" aria-label="Reroll ${r.n}" title="Swap for another ${HCATN[r.c].toLowerCase()} rule"${alt ? "" : " disabled"}>${IC.roll}</button>
        <button class="ib" type="button" data-act="del" aria-label="Remove ${r.n}" title="Remove">${IC.x}</button>
      </div></li>`;
  }).join("");
  $("#hbook").innerHTML = `
    <div class="bhead">
      <span class="kick">House rules${H.src ? " · " + esc(H.src) : ""}${H.edited ? " (edited)" : ""}</span>
      <h2 class="bname">${t.n}</h2>
      <div class="bsub"><b>${t.nk}</b> &nbsp;&middot;&nbsp; ${t.c} &nbsp;&middot;&nbsp; ${t.sl} &nbsp;&middot;&nbsp; ${t.p.toFixed(1)}★ prestige &nbsp;&middot;&nbsp; ${fmt(t.nt)} NIL</div>
      <div class="strain"><span class="lbl">Difficulty</span>${meter(s)}<b>${sl}</b><span class="sub">${H.rules.length} ${H.rules.length === 1 ? "rule" : "rules"}${H.lock.size ? `, ${H.lock.size} locked` : ""}</span></div>
    </div>
    <div class="bfoot">
      <button class="ghost" type="button" id="hcopy"${H.rules.length ? "" : " disabled"}>Copy rules</button>
      <button class="ghost" type="button" id="hclear"${H.rules.length ? "" : " disabled"}>Clear</button>
      <button class="ghost" type="button" id="hpsave"${H.rules.length && !HPS ? "" : " disabled"}>Save as preset</button>
      ${isUserPre(H.pre) && H.edited && H.rules.length ? `<button class="ghost" type="button" id="hpupd">Update &ldquo;${esc(presetOf(H.pre).n)}&rdquo;</button>` : ""}
      <button class="ghost${hDyn() ? "" : " pri"}" type="button" id="hdyn">Save to My Dynasty</button>
      ${hDyn() && hDyn().rules.join() !== H.rules.join() ? `<button class="ghost pri" type="button" id="hdupd">Update dynasty &ldquo;${esc(hDyn().name)}&rdquo;</button>` : ""}
      ${H.note ? `<span class="bnote">${H.note}</span>` : ""}
    </div>
    ${HPS ? `<form class="psave" id="hps" novalidate>
      <div class="hfrow"><label class="hfl" for="hpsN">Preset name</label><input class="hfi" id="hpsN" maxlength="32" value="${esc(HPS.n)}" placeholder="e.g. West Coast grind" autocomplete="off"></div>
      <div class="hfrow"><label class="hfl" for="hpsB">Description <span>(optional)</span></label><input class="hfi" id="hpsB" maxlength="120" value="${esc(HPS.b)}" placeholder="One line on what this dynasty is about" autocomplete="off"></div>
      <p class="herr" id="hpsE">${HPS.err || ""}</p>
      <div class="hfbtn"><button class="ghost pri" type="submit">Save preset</button><button class="ghost" type="button" id="hpsX">Cancel</button>
        <span class="hsmall" style="margin:0">Saves these ${H.rules.length} rules in this browser.</span></div>
    </form>` : ""}
    ${H.rules.length ? `<ul class="rules">${rows}</ul>` : `<div class="bempty">No rules yet. Pick a preset, deal a random set, or add rules from the library below.</div>`}`;

  $("#hlibs").textContent = `Rule library · ${HRULES.length} rules${HU.rules.length ? ` (${HU.rules.length} custom)` : ""} · create your own`;
  $("#hlibin").innerHTML = HCATS.map(([c, cn]) => `<div class="lgrp"><h3>${cn}</h3>${HRULES.filter(r => r.c === c).map(r => {
    const ok = r.w(t), inb = H.rules.includes(r.id), occ = H.rules.some(id => HR[id].c === c);
    const lbl = !ok ? "Doesn't fit" : inb ? "Remove" : occ ? "Swap in" : "Add";
    const act = `<button class="chip" type="button" data-lib="${r.id}" aria-pressed="${inb}"${ok ? "" : " disabled"}>${lbl}</button>` + (!r.u ? "" : HDEL === r.id
      ? `<button class="chip" type="button" data-rdel="${r.id}" data-yes="1">Delete</button><button class="chip" type="button" data-rkeep="1">Keep</button>`
      : `<button class="chip" type="button" data-redit="${r.id}">Edit</button><button class="chip" type="button" data-rdel="${r.id}">Delete</button>`);
    return `<div class="lrow"><div><b>${r.n}</b> ${pips(r.l)}${r.u ? `<span class="ctag">Custom</span>` : ""}<p>${ok ? r.x(t) : `Doesn't apply to ${t.n}.`}</p></div>
      <div class="lact">${act}</div></div>`;
  }).join("")}</div>`).join("") + `<p class="hsmall" style="padding:0 18px 14px">One rule per category. Adding a rule swaps out the one already in that category.</p>`;
  hfPreview();
  hSave();
}
function hText(){
  const t = hT();
  return [`House rules: ${t.n} ${t.nk} (${t.c})`, `${H.src || "Custom"}${H.edited ? " (edited)" : ""} · Difficulty: ${strainLbl(strainOf(H.rules))[0]}`, ""]
    .concat(H.rules.map((id, i) => `${i + 1}. ${unesc(HR[id].n)} [${HCATN[HR[id].c]}]: ${unesc(HR[id].x(t))}`)).join("\n");
}

$("#hseg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; H.mode = b.dataset.hm; hDraw(); });
$("#hPre").addEventListener("click", e => { const b = e.target.closest("[data-pre]"); if (!b) return;
  hApplyPreset(b.dataset.pre); hDraw(); const f = $(`#hPre [data-pre="${b.dataset.pre}"]`); if (f) f.focus();
  if (matchMedia("(max-width:860px)").matches) $("#hbook").scrollIntoView({behavior:"smooth", block:"start"}); });
$("#hstrict").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; H.strict = b.dataset.s; hDraw(); $(`#hstrict [data-s="${H.strict}"]`).focus(); });
$("#hrprog").addEventListener("click", () => { H.rprog = !H.rprog; hDraw(); $("#hrprog").focus(); });
$("#hdeal").addEventListener("click", () => { hDeal(); hDraw();
  if (matchMedia("(max-width:860px)").matches) $("#hbook").scrollIntoView({behavior:"smooth", block:"start"}); });
$("#hteamr").addEventListener("click", () => hSetTeam(DATA.filter(x => x.n !== H.team)[Math.floor(Math.random() * (DATA.length - 1))].n));
combo($("#hq"), hSetTeam, () => H.team);
$("#hbook").addEventListener("click", e => {
  if (e.target.closest("#hclear")) { H.rules = []; H.lock.clear(); H.pre = ""; H.src = ""; H.edited = false; H.note = ""; hDraw(); return; }
  if (e.target.closest("#hcopy")) {
    const b = $("#hcopy"), txt = hText();
    const fallback = () => {
      let ta = $("#hcopyta");
      if (!ta) { ta = document.createElement("textarea"); ta.id = "hcopyta"; ta.readOnly = true; ta.setAttribute("aria-label", "House rules text"); $("#hbook").appendChild(ta); }
      ta.value = txt; ta.focus(); ta.select(); b.textContent = "Select and copy the text below";
    };
    try { navigator.clipboard.writeText(txt).then(() => { b.textContent = "Copied"; setTimeout(() => { if (b.isConnected) b.textContent = "Copy rules"; }, 1600); }, fallback); }
    catch (err) { fallback(); }
    return;
  }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const id = a.closest(".rule").dataset.id, t = hT();
  if (a.dataset.act === "lock") { H.lock.has(id) ? H.lock.delete(id) : H.lock.add(id); }
  else if (a.dataset.act === "roll") {
    const nu = hPickIn(HR[id].c, t, id); if (!nu) return;
    H.rules[H.rules.indexOf(id)] = nu; H.lock.delete(id); H.edited = true; H.note = "";
    hDraw(); const f = $(`#hbook [data-id="${nu}"] [data-act="roll"]`); if (f) f.focus(); return;
  }
  else { H.rules = H.rules.filter(x => x !== id); H.lock.delete(id); H.edited = true; H.note = ""; }
  hDraw();
  const f = $(`#hbook [data-id="${id}"] [data-act="${a.dataset.act}"]`); if (f) f.focus();
});
function hToggleRule(id, forceAdd){
  const c = HR[id].c;
  if (H.rules.includes(id)) { if (forceAdd) return; H.rules = H.rules.filter(x => x !== id); H.lock.delete(id); }
  else { H.rules = H.rules.filter(x => { const same = HR[x].c === c; if (same) H.lock.delete(x); return !same; }).concat(id); }
  if (!H.src) H.src = "Custom"; H.edited = H.src !== "Custom"; H.note = "";
}
$("#hlibin").addEventListener("click", e => {
  const ed = e.target.closest("[data-redit]"), dl = e.target.closest("[data-rdel]");
  if (e.target.closest("[data-rkeep]")) { HDEL = ""; hDraw(); return; }
  if (ed) { hfOpen(HU.rules.find(u => u.id === ed.dataset.redit)); return; }
  if (dl) {
    const id = dl.dataset.rdel;
    if (!dl.dataset.yes) { HDEL = id; hDraw(); const k = $("#hlibin [data-rkeep]"); if (k) k.focus(); return; }
    HU.rules = HU.rules.filter(u => u.id !== id); huSave(); huSync(); HDEL = "";
    if (H.rules.includes(id)) { H.rules = H.rules.filter(x => x !== id); H.lock.delete(id); H.edited = !!H.src && H.src !== "Custom"; }
    if (HF && HF.id === id) hfClose();
    hDraw(); return;
  }
  const b = e.target.closest("[data-lib]"); if (!b || b.disabled) return;
  const id = b.dataset.lib; hToggleRule(id);
  hDraw(); const f = $(`#hlibin [data-lib="${id}"]`); if (f) f.focus();
});
/* ---- custom rule editor ---- */
function hfOpen(u){
  HF = u ? {id:u.id, n:u.n, c:u.c, l:u.l, t:u.t, m:u.m || "", err:""} : {id:"", n:"", c:"ter", l:2, t:"", m:"", err:""};
  const f = $("#hform");
  f.innerHTML = `<form class="hf" id="hf" novalidate>
    <h3>${HF.id ? "Edit custom rule" : "New custom rule"}</h3>
    <div class="hfgrid">
      <div class="hfrow"><label class="hfl" for="hfN">Rule name</label><input class="hfi" id="hfN" maxlength="40" placeholder="e.g. Coastal only" autocomplete="off"></div>
      <div class="hfrow"><label class="hfl" for="hfC">Category</label><select class="hfi" id="hfC">${HCATS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
    </div>
    <div class="hfrow"><span class="hfl" id="hfLl">Strain</span>
      <div class="seg hfseg" role="group" aria-labelledby="hfLl">${[1,2,3].map(l => `<button type="button" data-l="${l}" aria-pressed="false">${pips(l)} ${HSTR[l]}</button>`).join("")}</div></div>
    <div class="hfrow"><label class="hfl" for="hfT">Rule text</label>
      <textarea class="hfi" id="hfT" maxlength="280" rows="3" placeholder="e.g. Sign at least five players from {home} in every class."></textarea>
      <div class="toks"><span class="hfl" style="margin:0">Insert</span>${HTOK.map(([k, n]) => `<button class="chip" type="button" data-tok="${k}" title="Fills in the program's ${n.toLowerCase()}">${n}</button>`).join("")}</div>
      <span class="hsmall" style="margin:0">Inserted fields fill in for whichever program you pick, like the built-in rules.</span></div>
    <div class="hfrow" id="hfMw"><label class="hfl" for="hfM">Shade on the map</label>
      <select class="hfi" id="hfM">${HMAPS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
    <div class="hfprev"><span class="hfl" id="hfPl"></span><ul class="rules" id="hfP"></ul></div>
    <p class="herr" id="hfE" role="alert"></p>
    <div class="hfbtn">
      <button class="ghost pri" type="submit" data-go="add">Save and add to rulebook</button>
      <button class="ghost" type="submit" data-go="save">Save to library</button>
      <button class="ghost" type="button" id="hfX">Cancel</button>
    </div></form>`;
  $("#hfN").value = HF.n; $("#hfC").value = HF.c; $("#hfT").value = HF.t; $("#hfM").value = HF.m;
  f.hidden = false; $("#hnew").hidden = true; $("#hlib").open = true;
  hfPreview();
  f.scrollIntoView({behavior:"smooth", block:"start"}); $("#hfN").focus({preventScroll:true});
}
function hfClose(){ HF = null; $("#hform").hidden = true; $("#hform").innerHTML = ""; $("#hnew").hidden = false; }
function hfPreview(){
  if (!HF || !$("#hfP")) return;
  const t = hT(), r = mkRule({id:"", c:HF.c, n:HF.n || "Untitled rule", l:HF.l, t:HF.t || "Your rule text shows up here.", m:HF.m});
  const reg = r.reg ? r.reg(t) : null;
  $("#hfMw").hidden = HF.c !== "ter";
  document.querySelectorAll("#hf [data-l]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.l === HF.l));
  $("#hfPl").textContent = `Preview for ${t.n}`;
  $("#hfP").innerHTML = `<li class="rule"><div><span class="rcat">${HCATN[r.c]}</span>
    <div class="rttl">${r.n} ${pips(r.l)}<span class="ctag">Custom</span></div><p>${r.x(t)}</p>${reg && reg.length ? hMap(reg, tiersOf(t)) : ""}</div></li>`;
  $("#hfE").textContent = HF.err || "";
}
$("#hnew").addEventListener("click", () => hfOpen(null));
$("#hform").addEventListener("input", e => {
  if (!HF) return;
  const id = e.target.id;
  if (id === "hfN") HF.n = e.target.value; else if (id === "hfT") HF.t = e.target.value;
  else if (id === "hfC") HF.c = e.target.value; else if (id === "hfM") HF.m = e.target.value; else return;
  HF.err = ""; hfPreview();
});
$("#hform").addEventListener("change", e => { if (e.target.id === "hfC" || e.target.id === "hfM") { HF[e.target.id === "hfC" ? "c" : "m"] = e.target.value; hfPreview(); } });
$("#hform").addEventListener("click", e => {
  if (!HF) return;
  const l = e.target.closest("[data-l]"), tk = e.target.closest("[data-tok]");
  if (e.target.closest("#hfX")) { hfClose(); $("#hnew").focus(); return; }
  if (l) { HF.l = +l.dataset.l; hfPreview(); return; }
  if (tk) {
    const ta = $("#hfT"), a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a, k = tk.dataset.tok;
    if (ta.value.length + k.length > 280) return;
    ta.value = ta.value.slice(0, a) + k + ta.value.slice(b); HF.t = ta.value;
    ta.focus(); ta.setSelectionRange(a + k.length, a + k.length); hfPreview();
  }
});
$("#hform").addEventListener("submit", e => {
  e.preventDefault(); if (!HF) return;
  const go = e.submitter ? e.submitter.dataset.go : "add";
  const n = HF.n.trim(), txt = HF.t.trim();
  if (!n || !txt) { HF.err = !n && !txt ? "Give the rule a name and some rule text." : !n ? "Give the rule a name." : "Write the rule text."; hfPreview(); $(!n ? "#hfN" : "#hfT").focus(); return; }
  const u = {id:HF.id || "u-" + Date.now().toString(36), c:HF.c, n, l:HF.l, t:txt, m:HF.c === "ter" ? HF.m : ""};
  const i = HU.rules.findIndex(x => x.id === u.id);
  if (i >= 0) HU.rules[i] = u; else HU.rules.push(u);
  huSave(); huSync();
  if (i >= 0 && H.rules.includes(u.id) && !H.rules.every(x => HR[x].c !== u.c || x === u.id)) {
    H.rules = H.rules.filter(x => x === u.id || HR[x].c !== u.c);   /* category changed onto an occupied slot */
  }
  if (go === "add") hToggleRule(u.id, true);
  hfClose(); hDraw();
  H.note = ""; const row = $(`#hlibin [data-lib="${u.id}"]`);
  if (go === "add") { $("#hbook").scrollIntoView({behavior:"smooth", block:"start"}); }
  else if (row) { row.scrollIntoView({behavior:"smooth", block:"center"}); row.focus({preventScroll:true}); }
});

/* ---- saving presets ---- */
$("#hbuild").addEventListener("click", () => {
  {
    H.rules = []; H.lock.clear(); H.pre = ""; H.src = "Custom"; H.edited = false;
    H.note = "Add rules from the library below, or create your own, then save the set as a preset.";
    H.mode = "preset"; hDraw(); $("#hlib").open = true; $("#hlib").scrollIntoView({behavior:"smooth", block:"start"});
  }
});
$("#hPre").addEventListener("click", e => {
  if (e.target.closest("[data-pkeep]")) { HDEL = ""; hDraw(); return; }
  const d = e.target.closest("[data-pdel]"); if (!d) return;
  const id = d.dataset.pdel;
  if (!d.dataset.yes) { HDEL = id; hDraw(); const k = $("#hPre [data-pkeep]"); if (k) k.focus(); return; }
  HU.presets = HU.presets.filter(p => p.id !== id); huSave(); HDEL = "";
  if (H.pre === id) { H.pre = ""; H.src = "Custom"; H.edited = false; }
  hDraw();
});
$("#hbook").addEventListener("click", e => {
  if (e.target.closest("#hdyn")) { dAdd(); showTab("dyn"); window.scrollTo({top:0}); return; }
  if (e.target.closest("#hdupd")) { const d = hDyn(); d.rules = [...H.rules]; d.src = H.src; dSave(); H.note = `Updated “${esc(d.name)}”.`; hDraw(); return; }
  if (e.target.closest("#hpsave")) { HPS = {n:"", b:"", err:""}; hDraw(); $("#hpsN").focus(); return; }
  if (e.target.closest("#hpsX")) { HPS = null; hDraw(); return; }
  if (e.target.closest("#hpupd")) {
    const p = HU.presets.find(x => x.id === H.pre); if (!p) return;
    p.r = [...H.rules]; huSave(); H.edited = false; H.src = "Your preset · " + p.n; H.note = `Updated “${esc(p.n)}”.`; hDraw();
  }
});
$("#hbook").addEventListener("input", e => {
  if (!HPS) return;
  if (e.target.id === "hpsN") { HPS.n = e.target.value; HPS.err = ""; $("#hpsE").textContent = ""; }
  if (e.target.id === "hpsB") HPS.b = e.target.value;
});
$("#hbook").addEventListener("submit", e => {
  if (e.target.id !== "hps") return;
  e.preventDefault();
  const n = HPS.n.trim();
  if (!n) { HPS.err = "Name the preset to save it."; $("#hpsE").textContent = HPS.err; $("#hpsN").focus(); return; }
  if (HPRE.concat(HU.presets).some(p => p.n.toLowerCase() === n.toLowerCase())) { HPS.err = "A preset with that name already exists. Pick another name."; $("#hpsE").textContent = HPS.err; $("#hpsN").focus(); return; }
  const p = {id:"up-" + Date.now().toString(36), n, b:HPS.b.trim(), r:[...H.rules]};
  HU.presets.push(p); huSave(); HPS = null;
  H.pre = p.id; H.src = "Your preset · " + n; H.edited = false; H.mode = "preset";
  H.note = `Saved “${esc(n)}” to your presets.`;
  hDraw();
});
