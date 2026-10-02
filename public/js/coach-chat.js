// Coach: the chat sidebar (planner, rule edits, league questions, challenges, roadmap, follow-ups, optional on-device AI).
// Coach: templated answers for ability questions ("what abilities does a Speed Rusher get?", "what does Dot! do?").
const ABPOSW = {QB:"quarterback", HB:"running back|halfback|rb", FB:"fullback", WR:"receiver|wideout", TE:"tight end", OL:"lineman|offensive line|ol",
  DL:"defensive line|edge|dt|de", LB:"linebacker", CB:"corner", S:"safety", "K/P":"kicker|punter|k|p"};
function pAbil(q){
  const aq = /\babilit(y|ies)\b|archetype/i.test(q), s = abNorm(q);
  const arch = ABARCH.filter(a => s.includes(abNorm(a[1])));
  const ps = arch.filter(a => new RegExp(`\\b(${a[0].replace("/", "\\/")}|${ABPOSW[a[0]]})s?\\b`, "i").test(q));
  // An archetype name alone is often an everyday word ("recruiting power", "zone defense"): it needs its position or the word ability/archetype.
  const hit = ps.length ? ps : aq ? arch : [];
  if (hit.length && (aq || /\b(get|gets|have|has)\b/i.test(q)))
    return pMd(hit.map(([p, n, ab]) => [`### ${n} ${p}`, ...ab.map(x => `- **${x}:** ${abDesc(x)}`)].join("\n")).join("\n"));
  const n = abFind(q);
  if (n && (aq || /what (is|does)|unlock|who gets|which/i.test(q))) {
    const who = abWho(n);
    return pMd([`### ${n}`, `- ${abDesc(n)}`, n in ABMENT ? "- Mental ability: any player can have it, it isn't tied to an archetype." : who.length ? `- Archetypes with it: ${who.join(", ")}.` : "- It's in the game files, but which archetype gets it isn't confirmed yet.",
      ...(/unlock/i.test(q) && !(n in ABMENT) ? ["- It unlocks in Bronze, Silver, Gold and Platinum tiers as the player's key ratings rise. The board doesn't list the exact ratings yet."] : [])].join("\n"));
  }
  const c = cFind(q), ca = CARCH.filter(x => abNorm(q).includes(abNorm(x.n))).sort((a, b) => b.n.length - a.n.length)[0];
  if (c && (aq || /what (is|does)|unlock|coach/i.test(q)))
    return pMd([`### ${c[2]}`, `- ${c[3]}`, `- Coach ability: ${c[0].n} archetype, ${c[1]}.`, `- Unlock: ${c[0].u}.`].join("\n"));
  if (ca && /\b(archetype|abilit(y|ies)|unlock|perk)\b/i.test(q))
    return pMd([`### ${ca.n} (coach archetype)`, `- **Unlock:** ${ca.u}.`, ...(ca.perk ? [`- **Perk:** ${ca.perk}.`] : []), `- **Cost:** ${ca.cost}.`,
      ...ca.br.map(([b, ab]) => `- **${b}:** ${ab.map(x => x[0]).join(", ")}.`)].join("\n"));
  return "";
}

/* ---- dynasty planner: keyword planner over the site's own data, with an optional in-browser AI model for wording ---- */
// The planner never invents facts: every number comes from DATA/HRULES/ARCH/SLDIFF. The AI (WebLLM, runs on the visitor's GPU)
// only rephrases those facts and answers follow-ups from them. Without WebGPU or with AI off, the templated reply stands alone.
const PDIFF = [["hard", /\b(hard|harder|tough|tougher|brutal|hardcore|difficult|challeng\w*|insane|nightmare|grind)\b/], ["cas", /\b(casual|easy|easier|light|relaxed|chill)\b/]];
const PPRE = [["money", /moneyball|no blue.?chips?|walk.?ons?|underdog/], ["old", /old.?school|no portal and no nil|classic/], ["portal", /portal era|portal program/],
  ["blue", /blue.?blood/], ["home", /hometown|home.?grown|local kids/], ["real", /realis(m|tic)|sim.?like/], ["carousel", /carousel|coordinator|headset/]];
// PNEG: "don't want to use", "without", "avoid", "no", "skip", "ban" a few words before the topic.
const PNEG = "(?:\\bno|\\bnot? (?:use|using|touch|take)|don'?t (?:want to |wanna )?(?:use|touch|take|need)|do not (?:want to )?(?:use|touch|take|need)|won'?t (?:use|touch|take)|never (?:use|touch|take)|without(?: using)?|avoid(?:ing)?|skip(?:ping)?|ban(?:ning)?|stay(?:ing)? out of|stay away from)(?: (?:the|any|a|my|of))*";
const pNeg = topic => new RegExp(`${PNEG} ${topic}`);
const PRULE = [["port-none", new RegExp(`no (transfer|portal)|closed portal|${pNeg("(?:transfer )?(?:portal|transfers?)").source}`)], ["ter-home", /in.?state|home state only|only local|recruit local/],
  ["nil-zero", new RegExp(`no nil|zero nil|no money|${pNeg("(?:nil|money|nil money|nil budget)").source}`)], ["nil-half", /half (the )?(nil|budget)|low budget/], ["star-none", new RegExp(`no (5|five).?stars?|no blue.?chips?|${pNeg("(?:5|five).?stars?|blue.?chips?").source}`)],
  ["game-heis", /heisman difficulty|on heisman/], ["job-coord", /start as (a )?coordinator|earn the headset/], ["sch-gaunt", /tough schedule|gauntlet|hardest schedule/]];
// The game difficulty the user plays on ("I play on All-American"). Not the house rules' strain level.
const PGD = [["fr", /\bfreshman\b/], ["var", /\bvarsity\b/], ["aa", /\ball.?american\b/], ["heis", /\bheisman\b(?! (or bust|trophy|winner|race|candidate))/]];
const PGDN = {fr:"Freshman", var:"Varsity", aa:"All-American", heis:"Heisman"};
const pGameDiff = s => (PGD.find(([, re]) => re.test(s)) || [])[0] || null;
// Rules a plan must not use (the user plays on a lower difficulty than "Heisman or bust" asks for). Set by pPlan.
const pBan = id => (P.ban || []).includes(id);
const PNK = (() => { const c = {}; DATA.forEach(t => { const k = norm(t.nk); c[k] = (c[k] || 0) + 1; }); return c; })();
// Abbreviations that are ordinary words ("most" = Missouri State) never count as a team mention.
const PABSTOP = new Set(["most", "ball", "mass", "wake", "app", "miss", "ill", "usa", "bay", "tem", "pur", "cal", "ark"]);
// Fan nicknames and shorthand. Ambiguous ones ("miami", "ut") are handled by pAmbig instead.
const PALIAS = {"Alabama":["bama","roll tide","the tide"], "Miami":["the u","canes","miami fl","miami florida"], "Miami University":["miami oh","miami ohio"],
  "Florida State":["noles"], "Georgia":["dawgs","uga"], "Texas":["horns","hook em"], "Texas A&M":["a&m","a and m","aggieland"], "Oklahoma":["ou","boomer sooner"],
  "Tennessee":["vols"], "Arkansas":["hogs"], "Nebraska":["huskers"], "Notre Dame":["irish","domers"], "Ohio State":["bucks"], "Syracuse":["cuse"],
  "Michigan State":["sparty"], "Washington State":["wazzu"], "Michigan":["umich","mich"], "Mississippi State":["miss state"], "Ole Miss":["mississippi"],
  "LSU":["bayou bengals"], "Penn State":["penn st"], "Virginia Tech":["hokies"], "North Carolina":["unc","carolina"], "South Carolina":["gamecocks"]};
const PALIASN = Object.fromEntries(Object.entries(PALIAS).flatMap(([n, xs]) => xs.map(x => [x, n])));
// Words Coach uses that must never be "corrected" into a team name.
const PWORDS = new Set("about above after again their there these those which while would could should dynasty rebuild tough tougher casual harder easier lighter little less more most much make build start coach coaches coaching created custom player players roster ratings rating rated overall offense defense prestige budget titles title national champion championship pipeline pipelines region regions state states recruit recruiting recruits house rules rule remove swap switch change replace explain transfer transfers portal schedule difficulty hardcore brutal standard heisman sliders slider compare versus against better stronger best worst fastest quickest speed biggest smallest highest lowest program programs school schools teams conference country nation college football first second third where what when who why how does tell show please thanks thank great awesome right wrong other another".split(" "));
// Words from house rule, preset and ability names ("Patch the holes") are never typos for a team ("Noles").
let PNAMEW_ = null;
const PNAMEW = () => PNAMEW_ || (PNAMEW_ = new Set([...HRULES.map(r => r.n), ...HPRE.map(p => p.n), ...(typeof ABPHYS === "object" ? Object.keys(ABPHYS) : []),
  ...(typeof ABMENT === "object" ? (Array.isArray(ABMENT) ? ABMENT.map(x => x[0] || x.n || x) : Object.keys(ABMENT)) : [])].flatMap(n => norm(unesc(String(n))).split(/[^a-z0-9]+/))));
function lev(a, b){
  const d = Array.from({length:a.length + 1}, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : Infinity);
  return d[a.length][b.length];
}
// Typo fallback: one or two words within 1 edit (2 for long names) of a team name, unique nickname or alias.
function pFuzzy(q){
  const w = norm(q).replace(/[^a-z0-9& ]+/g, " ").split(/\s+/).filter(Boolean), grams = [];
  w.forEach((x, i) => { grams.push(x); if (w[i + 1]) grams.push(x + " " + w[i + 1]); });
  const keys = DATA.flatMap(t => [[norm(t.n).replace(/[^a-z0-9& ]+/g, " ").trim(), t], ...(PNK[norm(t.nk)] === 1 ? [[norm(t.nk), t]] : [])])
    .filter(k => k[0].length >= 5);
  let best = null;
  for (const g of grams) {
    if (g.length < 5 || g.split(" ").some(x => PWORDS.has(x) || PNAMEW().has(x))) continue;
    for (const [k, t] of keys) { const d = lev(g, k), lim = k.length >= 8 ? 2 : 1;
      if (d && d <= lim && (!best || d < best[2] || (d === best[2] && k.length > best[3]))) best = [t, g, d, k.length]; }
  }
  return best ? {t:best[0], typed:best[1]} : null;
}
function pFindTeams(q){
  const v = " " + norm(q).replace(/[^a-z0-9&]+/g, " ") + " ", hits = [];
  for (const t of DATA) {
    const keys = [norm(t.n).replace(/[^a-z0-9&]+/g, " ")];
    if (PNK[norm(t.nk)] === 1) keys.push(norm(t.nk));
    if (t.ab.length >= 2 && !PABSTOP.has(norm(t.ab))) keys.push(norm(t.ab));
    keys.push(...(PALIAS[t.n] || []));
    for (const k of keys) { const i = v.indexOf(" " + k + " "); if (i >= 0) hits.push([t, k.length, i]); }
  }
  hits.sort((a, b) => b[1] - a[1]);
  const out = [];   // longest match wins, so "Georgia Tech" beats "Georgia"
  for (const [t, len, i] of hits) if (!out.some(o => o[0] === t || (i < o[2] + o[1] && o[2] < i + len))) out.push([t, len, i]);
  if (!out.length) { const f = pFuzzy(q); if (f) { P.fuzzy = f; return [f.t]; } }
  return out.sort((a, b) => a[2] - b[2]).map(o => o[0]);
}
function pRules(t, strict, pre, force){
  if (pre) return presetOf(pre).r.filter(id => HR[id] && HR[id].w(t) && !force.some(f => HR[f].c === HR[id].c)).concat(force);
  const want = {cas:1, std:2, hard:3}[strict], k = HSTRICT[strict].k, used = new Set(force.map(f => HR[f].c));
  const cats = ["ter", "star", "port", "nil", "ros", "sch", "job", "game"].filter(c => !used.has(c)).slice(0, Math.max(0, k - force.length));
  return force.concat(cats.map(c => {
    const ok = HRULES.filter(r => r.c === c && !r.u && r.w(t) && !pBan(r.id));
    const best = Math.min(...ok.map(r => Math.abs(r.l - want)));
    const pool = ok.filter(r => Math.abs(r.l - want) === best);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
  }).filter(Boolean)).sort((a, b) => catIx(a) - catIx(b));
}
const P = {ban:[], last:null, choices:null, past:[], pref:null, pending:null, fuzzy:null, team:null, plan:null, facts:"", busy:false};
const pLog = $("#pLog");
function pSay(who, html){ const d = document.createElement("div"); d.className = "pm " + who; d.innerHTML = html; pLog.append(d); pLog.scrollTop = who === "bot" ? d.offsetTop - pLog.offsetTop - 8 : pLog.scrollHeight; return d; }
const PHELP = pMd(["I'm Coach. Tell me a program and how you want to play it, for example:", '- "Tough Florida dynasty with a created coach"', '- "Casual Oregon rebuild"', '- "Former powerhouse back to glory"',
  "Or ask about the league:", '- "Florida vs Florida State"', '- "Best QB in the SEC"', '- "Best rebuild jobs in the Big Ten"',
  "I'll suggest house rules, a recruiting approach and sliders from this site's data. Then say \"make it harder\", \"no transfers\" and so on."].join("\n"));
// Relative requests ("a little less difficult", "much harder") nudge the last plan rule by rule instead of re-rolling it.
const PDOWN = /\b(easier|lighter|softer|less (difficult|hard|tough|brutal|strict|challenging|punishing|intense)|not (as|so) (hard|tough|difficult|brutal)|tone (it )?down|dial (it )?back|ease (it )?(up|off)|too (hard|tough|difficult|much|brutal))\b/;
const PUP = /\b(harder|tougher|more (difficult|challenging|brutal|punishing|intense)|crank (it )?up|turn (it )?up|too easy|not (hard|tough) enough)\b/;
const pAmt = s => /\b(a (little|bit|touch|tad)|slightly|little)\b/.test(s) ? 1 : /\b(much|way|a lot|lots|significantly|drastically)\b/.test(s) ? 4 : 2;
const PTARGET = {cas:1, std:2, hard:3};
// One notch easier (dir -1) or harder (+1). Never touches rules the user asked for by name (keep).
function pStep(rules, t, dir, keep = []){
  const fits = r => !r.u && r.w(t) && !rules.includes(r.id) && !pBan(r.id), nm = id => unesc(HR[id].n), free = rules.filter(id => !keep.includes(id));
  if (dir < 0) {
    const id = [...free].sort((a, b) => HR[b].l - HR[a].l)[0]; if (!id) return null;
    const alt = HRULES.filter(r => r.c === HR[id].c && fits(r) && r.l < HR[id].l).sort((a, b) => b.l - a.l)[0];
    return alt ? {rules:rules.map(x => x === id ? alt.id : x), note:`Swapped **${nm(id)}** for the lighter **${nm(alt.id)}**`}
      : {rules:rules.filter(x => x !== id), note:`Dropped **${nm(id)}**`};
  }
  const used = new Set(rules.map(id => HR[id].c));
  const cat = rules.length < 8 && HCATS.map(c => c[0]).find(c => !used.has(c) && HRULES.some(r => r.c === c && fits(r)));
  if (cat) { const r = HRULES.filter(x => x.c === cat && fits(x)).sort((a, b) => Math.abs(a.l - 2) - Math.abs(b.l - 2))[0];
    return {rules:rules.concat(r.id), note:`Added **${nm(r.id)}**`}; }
  for (const id of [...free].sort((a, b) => HR[a].l - HR[b].l)) {
    const alt = HRULES.filter(r => r.c === HR[id].c && fits(r) && r.l > HR[id].l).sort((a, b) => a.l - b.l)[0];
    if (alt) return {rules:rules.map(x => x === id ? alt.id : x), note:`Swapped **${nm(id)}** for the tougher **${nm(alt.id)}**`};
  }
  return null;
}
// Nudge a fresh rule set until its strain label matches the difficulty asked for (Hardcore used to land on Brutal).
function pFit(rules, t, strict, keep){
  for (let i = 0; i < 12; i++) {
    const d = strainLbl(strainOf(rules))[1] - PTARGET[strict]; if (!d) break;
    const st = pStep(rules, t, d > 0 ? -1 : 1, keep); if (!st) break; rules = st.rules;
  }
  return rules.sort((a, b) => catIx(a) - catIx(b));
}
function pPlan(q){
  const s = norm(q), teams = pFindTeams(q);
  if (/\b(random|surprise|any team|pick (a|one) for me)\b/.test(s)) teams.unshift(DATA[Math.floor(Math.random() * DATA.length)]);
  const t = teams[0] || P.team;
  if (!t) return null;
  const gd = pGameDiff(s) || (P.plan && t === P.plan.t ? P.plan.gd : null);
  // Playing below Heisman means "Heisman or bust" contradicts what they told us, unless they asked for Heisman rules.
  P.ban = gd && gd !== "heis" && !/heisman (or bust|difficulty)/.test(s) ? ["game-heis"] : [];
  const heard = teams.length || PDIFF.some(([, re]) => re.test(s)) || PPRE.some(([, re]) => re.test(s)) || PRULE.some(([, re]) => re.test(s))
    || /creat\w* (a )?coach|custom coach|own coach|rebuild/.test(s) || PDOWN.test(s) || PUP.test(s);
  if (!heard) return null;
  const prev = P.plan && t === P.plan.t ? P.plan : null, dir = PDOWN.test(s) ? -1 : PUP.test(s) ? 1 : 0;
  const s2 = s.replace(PDOWN, " ").replace(PUP, " ");   // "less difficult" must not also read as "difficult"
  const said = PDIFF.find(([, re]) => re.test(s2));
  if (said) P.pref = said[0];                              // remembered for the next program you plan
  let strict = (said || [prev ? prev.strict : P.pref || "std"])[0];
  const pre = (PPRE.find(([, re]) => re.test(s)) || [null])[0];
  const force = [...new Set(PRULE.filter(([, re]) => re.test(s)).map(x => x[0]))].filter(id => HR[id].w(t));
  const created = /creat\w* (a )?coach|custom coach|my own coach|own coach|create a coach/.test(s) || (P.plan && t === P.team && P.plan.created);
  const keep = [...new Set([...(prev ? prev.keep || [] : []), ...force])].filter(id => !pBan(id)), rebuild = /rebuild/.test(s) || !!(prev && prev.rebuild);
  const fix = rs => rs.filter(id => !pBan(id));   // a newly stated game difficulty drops rules it contradicts
  // A title goal when they bring up titles or ask for a challenge: the first one ever, or the first in a long time.
  const goalOf = () => {
    if (!/\b(titles?|championships?|natty|natties|never won|challenge|goal)\b/.test(s)) return null;
    const yrs = Math.max(3, {cas:7, std:5, hard:3}[strict] || 5), last = tYears(t).slice(-1)[0];
    return t.ti ? {goalName:"Back on top", goal:`Win ${t.n}'s first national title since ${last} within ${yrs} seasons.`}
      : {goalName:"First title", goal:`Win the first national title in ${t.n} history within ${yrs} seasons.`};
  };
  if (prev && dir && !pre) {
    let rules = fix(prev.rules).filter(id => !force.some(f => HR[f].c === HR[id].c)).concat(force); const notes = [];
    for (let i = 0; i < pAmt(s); i++) { const st = pStep(rules, t, dir, keep); if (!st) break; rules = st.rules; notes.push(st.note); }
    const lvl = strainLbl(strainOf(rules))[1];
    return {...prev, gd, created, keep, rebuild, rules:rules.sort((a, b) => catIx(a) - catIx(b)), strict:lvl <= 1 ? "cas" : lvl === 2 ? "std" : "hard",
      change:{notes:notes.length ? notes : [dir < 0 ? "Already as light as the rules allow" : "Already as tough as the rules allow"], from:strainOf(prev.rules)}};
  }
  // A follow-up like "no transfers" edits the last plan in place instead of re-rolling every rule.
  if (prev && strict === prev.strict && !pre) {
    const rules = fix(prev.rules).filter(id => !force.some(f => HR[f].c === HR[id].c)).concat(force).sort((a, b) => catIx(a) - catIx(b));
    return {...prev, ...(goalOf() || {}), gd, created, keep, rebuild, rules, change:force.length ? {notes:force.map(f => `Added **${unesc(HR[f].n)}**`), from:strainOf(prev.rules)} : null};
  }
  const rules = pre ? pRules(t, strict, pre, force) : pFit(pRules(t, strict, pre, force), t, strict, keep);
  return {t, strict, gd, ...(goalOf() || {}), pre:pre || (prev && strict === prev.strict ? prev.pre : null), rules:fix(rules), created, keep, rebuild,
    change:prev ? {notes:[`New ${HSTRICT[strict].n.toLowerCase()} rule set`], from:strainOf(prev.rules)} : null};
}
// Coach replies are a tiny markdown subset: "### title", "- bullet", "**bold**". Escaped before formatting.
function pMd(s){
  const out = []; let ul = false;
  const inl = x => esc(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  for (const raw of s.split("\n")) {
    const l = raw.trim(), b = l.match(/^(?:[-*•]|\d+\.)\s+(.*)/), hd = l.match(/^#{1,6}\s*(.*)|^\*\*([^*]+)\*\*:?$/);
    if (!b && ul) { out.push("</ul>"); ul = false; }
    if (!l || /^([-*•]|\d+\.)$/.test(l)) continue;
    if (hd) { const x = (hd[1] ?? hd[2]).replace(/^[#*\s]+|[#*:\s]+$/g, ""); if (x) out.push(`<h4>${inl(x)}</h4>`); }
    else if (b && /^[-*•#\s.]*$/.test(b[1])) continue;
    else if (b) { if (!ul) { out.push("<ul>"); ul = true; } out.push(`<li>${inl(b[1])}</li>`); }
    else out.push(`<p>${inl(l)}</p>`);
  }
  if (ul) out.push("</ul>");
  return out.join("");
}
// Territory rules that restrict recruiting to a set of regions. Stay local and Border control only set quotas, so they don't count.
const PONLY = ["ter-pipe", "ter-home", "ter-top3", "ter-foot"];
// Recruiting advice that respects the plan's house rules: drop band advice a rule forbids, add a rule-aware tip instead.
const PRTIP = {
  "star-none":[/[45]★|long shots/, () => "Build with 3★ and below: scout early and sign high-potential players you can develop."],
  "star-cap":[/[45]★|long shots/, t => `Stay at ${starCap(t)}★ and below until prestige catches up.`],
  "star-one":[/5★|long shots/, () => "Save your one 5★ spot for a premium position like QB or edge rusher."],
  "star-half":[/[45]★ talent at every/, () => "Keep at least half of each class at 3★ or below."],
  "star-small":[/long shots/, () => "Small classes: offer fewer recruits and close on the ones you want most."],
  "nil-zero":[/NIL/, () => "No NIL: win recruits with playing time, pipelines and your strongest pitch grades."],
  "nil-half":[/NIL/, () => "Half budget: save NIL for two or three difference makers."],
  "nil-cap":[/NIL/, () => "Hard NIL cap: spread offers thin and let bidding wars go."],
  "nil-flat":[/NIL/, () => "Flat NIL scale: you can't outbid for a star, so sell the program instead."],
  "nil-nobid":[/outbid|bidding/, () => "Walk away from bidding wars."],
  "port-none":[/portal|transfer/, () => "No transfers: sign full classes and redshirt freshmen to build depth."],
  "port-only":[/portal|transfer/, () => "Portal program: most starters come from transfers, so keep high school classes small."]
};
function pRecTips(t, rules, archTxt){
  const on = rules.map(id => [id, PRTIP[id]]).filter(x => x[1]), ter = rules.find(id => PONLY.includes(id));
  const drop = on.map(x => x[1][0]).concat(ter ? [/national/i] : []);
  const tips = archTxt.split(/(?<=\.)\s+/).filter(s => !drop.some(re => re.test(s)));
  on.forEach(([, [, f]]) => tips.push(f(t)));
  if (ter) tips.push(`**Allowed regions (${plain(HR[ter].n)}):** ${and(HR[ter].reg(t))}`);
  return tips;
}
// Rule text is written for the House rules tab; drop its references to the map, which the chat doesn't show.
const plain = x => unesc(x.replace(/<[^>]+>/g, "")).replace(/,? shaded below/g, "").replace(/ Your pipelines are shaded below\./g, "");
// "Why it's hard": consequences computed from this program's data, so the plan explains itself.
function pWhy({t, rules, rebuild}){
  const out = [], nr = NILRANK.indexOf(t.n) + 1, or = [...DATA].sort((a, b) => b.o - a.o).indexOf(t) + 1, has = id => rules.includes(id);
  if (rebuild) out.push(`Rebuild: ${t.n} is #${or} of ${DATA.length} in overall rating (${t.o}).`);
  const ter = rules.find(id => PONLY.includes(id));
  if (ter) { const ok = HR[ter].reg(t), lost = pipesAt(t, 1).filter(r => !ok.includes(r));
    out.push(`${plain(HR[ter].n)} limits recruiting to ${ok.length} region${ok.length === 1 ? "" : "s"}${lost.length ? ` and shuts you out of ${lost.length} of ${t.n}'s ${pipesAt(t, 1).length} pipelines` : ""}.`); }
  if (has("nil-zero")) out.push(`You give up a NIL budget ranked #${nr} of ${DATA.length} (${fmt(t.nt)}).`);
  if (has("nil-half")) out.push(`Half budget drops you from ${fmt(t.nt)} to ${fmt(Math.floor(t.nt / 2))}, about where #${NILRANK.findIndex(n => DATA.find(x => x.n === n).nt <= t.nt / 2) + 1} sits.`);
  if (has("port-none")) out.push(`No transfers: every one of the ${t.r.length} roster spots has to come from high school recruiting.`);
  if (has("game-heis")) out.push("Heisman is the game's hardest difficulty.");
  return out.length ? ["### Why it's hard", ...out.map(x => `- ${x}`)] : [];
}
function pRender(p){
  const {t, strict, pre, rules, created} = p, s = strainOf(rules), [sl] = strainLbl(s);
  const [, arch, archTxt] = ARCH.find(a => t.p >= a[0]), nr = NILRANK.indexOf(t.n) + 1;
  const pl = t.pl.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 3);
  const hc = (t.st || []).find(c => c[0] === "HC"), sld = SLDIFF[p.gd === "heis" || (!p.gd && strict === "hard") ? "heis" : "aa"];
  const label = pre ? presetOf(pre).n : HSTRICT[strict].n;
  const hcS = hc ? `${hc[1]} (level ${hc[2]}, ${hc[4]})` : "the head coach";
  const coach = rules.includes("job-coord")   // Earn the headset: you're a coordinator, not the head coach
    ? `${created ? "Your created coach starts" : "You start"} as a coordinator on ${hcS}'s staff. No head coaching job until your fourth season.`
    : created
    ? `You replace ${hc ? `${hc[1]} (level ${hc[2]}, ${hc[4]}, pipeline ${hc[5] || "none"})` : "the current head coach"}. A created coach doesn't inherit that level or pipeline, so the program's own pipelines carry recruiting early on. Pair it with the Earn the headset rule if you want to start as a coordinator.`
    : hc ? `You coach as ${hc[1]}: level ${hc[2]}, ${hc[4]}, grade ${hc[3]}${hc[5] ? `, pipeline ${hc[5]}` : ""}.` : "";
  const recT = pRecTips(t, rules, archTxt);
  const html = pMd([`### ${t.n} ${t.nk}`, `- ${t.c} · ${t.p}★ prestige · ${t.o} overall · NIL rank #${nr} of ${DATA.length}`,
    ...(p.goal ? [`### Your goal · ${p.goalName}`, `- ${p.goal}`] : []),
    ...(p.change ? ["### What changed", ...p.change.notes.map(x => `- ${x}`), `- **Difficulty:** ${strainLbl(p.change.from)[0]} (${p.change.from} pts) to ${sl} (${s} pts)`] : []),
    `### House rules · ${pre ? label + " · " : ""}${sl} (${s} pts)`, ...rules.map(id => `- **${plain(HR[id].n)}:** ${plain(HR[id].x(t))}`),
    ...pWhy(p), `### Recruiting · ${arch}`, ...recT.map(x => `- ${x}`), ...(rules.some(id => PONLY.includes(id)) ? [] : [`- **Best pipelines:** ${pl.length ? and(pl.map(x => x[0])) : "thin, so recruit close to home"}`]),
    ...(coach ? [`### ${created && !rules.includes("job-coord") ? "Created coach" : "Your coach"}`, `- ${coach}`] : []), `### Sliders`, `- Matt10's ${sld.n} set${p.gd && p.gd !== "aa" && p.gd !== "heis" ? ` (closest to ${PGDN[p.gd]}: his sets cover All-American and Heisman)` : p.gd ? `, for the ${PGDN[p.gd]} difficulty you play on` : ""}`].join("\n"));
  P.facts = [`Program: ${t.n} ${t.nk}, ${t.c}, prestige ${t.p} stars, overall ${t.o} (offense ${t.of}, defense ${t.df}), NIL budget ${fmt(t.nt)}. NIL rank: #${nr} of ${DATA.length} (always call it "NIL rank"). National titles: ${tYears(t).join(", ") || "none"}.`,
    `Challenge: ${label}. House rules (list all ${rules.length}): ` + rules.map(id => `${unesc(HR[id].n)}: ${unesc(HR[id].x(t).replace(/<[^>]+>/g, ""))}`).join(" | "),
    `Recruiting (already adjusted to the house rules, which always win): ${recT.join(" ").replace(/\*\*/g, "")} Top pipelines: ${pl.map(x => `${x[0]} ${TIERN[x[1]]}`).join(", ") || "none"}.`,
    coach.replace(/<[^>]+>/g, ""), `Coaching staff: ${staffLine(t)}`, `Sliders: Matt10's ${sld.n} set.`].join("\n");
  return html;
}
// Fallen powerhouses: 3+ titles in the game's data but prestige 4★ or lower. Most titles first, then lowest prestige.
function pGlory(){
  const xs = DATA.filter(t => t.ti >= 3 && t.p <= 4).sort((a, b) => b.ti - a.ti || a.p - b.p).slice(0, 3);
  P.facts = "Former powerhouses on the board (national titles, current prestige, overall):\n" + xs.map(t => `${t.n} ${t.nk} (${t.c}): ${t.ti} titles (${tYears(t).join(", ")}), ${t.p} stars, ${t.o} overall`).join("\n");
  return pMd(["### Fallen powerhouses", ...xs.map(t => `- **${t.n}:** ${t.ti} national titles, last in ${tYears(t).slice(-1)[0]}. Now ${t.p}★ and ${t.o} overall.`),
    `Name one, like "${xs[0].n} back to glory", and I'll build the plan.`].join("\n"));
}
const PLEAGUE = "Every program (name | conference | prestige stars | overall | national title seasons):\n" + DATA.map(t => `${t.n} | ${t.c} | ${t.p} | ${t.o} | ${tYears(t).join(" ") || "none"}`).join("\n");
// Player questions answer straight from the roster (t.r rows: [name, pos, year, ovr, dev 0-3, speed]).
const PPOS = [["LEDG", /\b(ledgs?|left edges?)\b/], ["REDG", /\b(redgs?|right edges?)\b/], ["SAM", /\b(sam (line)?backers?|sam lbs?)\b/],
  ["MIKE", /\b(mlbs?|mike (line)?backers?|mike lbs?)\b/], ["WILL", /\b(will (line)?backers?|will lbs?|wlbs?)\b/], ["FS", /\b(fs|free safet(y|ies))\b/], ["SS", /\b(ss|strong safet(y|ies))\b/],
  ["QB", /\b(qbs?|quarterbacks?)\b/], ["RB", /\b(rbs?|hbs?|running backs?|halfbacks?)\b/], ["WR", /\b(wrs?|receivers?|wideouts?)\b/],
  ["TE", /\b(tes?|tight ends?)\b/], ["OL", /\b(ol|o-line|offensive line\w*|tackles?|guards?|centers?|linem[ae]n)\b/], ["DL", /\b(dl|d-line|defensive line\w*|edge|pass rushers?|dts?|defensive ends?)\b/],
  ["LB", /\b(lbs?|linebackers?)\b/], ["CB", /\b(cbs?|corners?|cornerbacks?)\b/], ["S", /\b(safet(y|ies))\b/], ["K", /\b(kickers?|k)\b/], ["P", /\b(punters?|p)\b/]];
// DL, LB and S cover several position chips.
const PGRPS = {DL:["LEDG", "REDG", "DT"], LB:["SAM", "MIKE", "WILL"], S:["FS", "SS"]};
const pGrp = g => PGRPS[g] || POSG.find(x => x[0] === g)[1];
const pRow = (p, t) => `**${p[0]}**${t ? ` (${t.n})` : ""} · ${p[1]} · ${p[2]} · ${p[3]} OVR · ${p[5]} speed${p[4] ? ` · ${DEVN[p[4]]} dev` : ""}`;
function pPlayers(q, t){
  const s = norm(q), pos = PPOS.find(([, re]) => re.test(s)), grp = pos && pGrp(pos[0]);
  const fast = /fastest|quickest|speed/.test(s), n = Math.min(15, +(s.match(/\btop (\d+)/) || [])[1] || (/players|guys|stars\b|roster/.test(s) ? 5 : 1));
  const xs = (grp ? t.r.filter(p => grp.includes(p[1])) : t.r.slice()).sort((a, b) => fast ? b[5] - a[5] || b[3] - a[3] : b[3] - a[3] || b[5] - a[5]).slice(0, n);
  const what = `${n > 1 ? `Top ${n}` : fast ? "Fastest" : "Best"}${pos ? " " + pos[0] : n > 1 ? " players" : " player"}${n > 1 && fast ? " by speed" : ""}`;
  P.team = t;
  P.facts = `${t.n} ${t.nk} roster, ${what.toLowerCase()} (name, position, class year, overall rating, speed, development trait):\n` + xs.map(p => pRow(p).replace(/\*\*/g, "")).join("\n")
    + `\nTop 10 overall on the roster: ` + [...t.r].sort((a, b) => b[3] - a[3]).slice(0, 10).map(p => `${p[0]} ${p[1]} ${p[3]}`).join(", ");
  return pMd([`### ${t.n} · ${what}`, ...xs.map(p => `- ${pRow(p)}`), ...(xs.length ? [] : ["- No players at that position on the roster."])].join("\n"));
}
// Coaching staff (t.st rows: [role, name, level, grade, archetype, pipeline, ...]).
const PROLE = {HC:"Head coach", OC:"Offensive coordinator", DC:"Defensive coordinator"};
const sRow = (c, t) => `**${PROLE[c[0]]}:** ${c[1]}${t ? ` (${t.n})` : ""} · level ${c[2]} · ${c[3]} grade · ${c[4]}${c[5] ? ` · pipeline ${c[5]}` : ""}`;
const staffLine = t => (t.st || []).map(c => sRow(c).replace(/\*\*/g, "")).join("; ");
function pStaff(q, t){
  const s = norm(q), role = /\b(oc|offensive coordinator)\b/.test(s) ? "OC" : /\b(dc|defensive coordinator)\b/.test(s) ? "DC" : /\bhead coach\b|\bhc\b/.test(s) ? "HC" : null;
  const xs = (t.st || []).filter(c => !role || c[0] === role);
  P.team = t; P.facts = `${t.n} ${t.nk} coaching staff: ${staffLine(t)}`;
  return pMd([`### ${t.n} · ${role ? PROLE[role] : "Coaching staff"}`, ...xs.map(c => `- ${sRow(c)}`), ...(xs.length ? [] : ["- No staff listed for this program."])].join("\n"));
}
const pFindCoach = q => { const v = " " + norm(q).replace(/[^a-z0-9' .-]+/g, " ") + " ";
  for (const t of DATA) for (const c of t.st || []) if (v.includes(" " + norm(c[1]) + " ")) return [t, c]; return null; };
// A full player name anywhere in the question ("tell me about Jadan Baugh").
function pFindPlayer(q){
  const v = " " + norm(q).replace(/[^a-z0-9' .-]+/g, " ") + " ";
  for (const t of DATA) for (const p of t.r) if (v.includes(" " + norm(p[0]) + " ") || v.includes(" " + norm(p[0]) + "?")) return [t, p];
  return null;
}
/* ---- rule-level editing: remove / swap / add / explain a rule by name, undo ---- */
// House rule names mentioned in the text, longest first ("One five-star" before "One side of the ball" can't collide).
function pFindRules(q){
  const v = " " + norm(q).replace(/[^a-z0-9]+/g, " ") + " ", out = [];
  for (const r of [...HRULES].filter(r => !r.u).sort((a, b) => b.n.length - a.n.length)) {
    const k = " " + norm(unesc(r.n)).replace(/[^a-z0-9]+/g, " ").trim() + " ", i = v.indexOf(k);
    if (i >= 0 && !out.some(o => i < o[1] + o[2] && o[1] < i + k.length)) out.push([r.id, i, k.length]);
  }
  return out.sort((a, b) => a[1] - b[1]).map(o => o[0]);
}
const PCATW = [["nil", /\bnil|money|budget\b/], ["port", /portal|transfer/], ["ter", /territory|region|pipeline rule|where (i|you) recruit/],
  ["star", /\bstars?\b|blue.?chip|class size/], ["ros", /roster|depth|playing time/], ["sch", /schedul/], ["job", /\bjob|hot seat|coaching career/], ["game", /game.?day|difficulty rule|sim\b/]];
const nmR = id => unesc(HR[id].n);
// Why a rule matters for this program, from the data (falls back to its category and weight).
function pRuleWhy(id, t){
  const w = pWhy({t, rules:[id], rebuild:false}).slice(1).map(x => x.replace(/^- /, ""));
  return w.length ? w : [`It fills the ${HCATN[HR[id].c].toLowerCase()} slot at weight ${HR[id].l} of 3 (${HSTR[HR[id].l].toLowerCase()}).`];
}
function pEdit(q){
  const s = norm(q), p = P.plan, t = p ? p.t : P.team || hT(), named = pFindRules(q);
  if (/^(undo|go back|revert|undo that|take that back|back)\b/.test(s)) {
    if (!P.past.length) return pMd("### Undo\n- Nothing to undo yet.");
    const was = P.plan; P.plan = P.past.pop(); P.team = P.plan.t;
    return pRender({...P.plan, change:{notes:["Undid the last change"], from:was ? strainOf(was.rules) : strainOf(P.plan.rules)}});
  }
  const explain = /\b(why|what (is|does|do)|explain|meaning|mean|tell me about|how does)\b/.test(s);
  if (named.length && explain) {
    const id = named[0], r = HR[id], inPlan = p && p.rules.includes(id);
    P.facts = `House rule ${nmR(id)} (${HCATN[r.c]}, weight ${r.l} of 3): ${plain(r.x(t))}`;
    return pMd([`### ${nmR(id)}`, `- **Rule:** ${plain(r.x(t))}`, `- **Category:** ${HCATN[r.c]} · weight ${r.l} of 3 (${HSTR[r.l]})`,
      ...(r.w(t) ? [] : [`- Doesn't apply to ${t.n}.`]),
      ...(inPlan ? [`- **Why it's in your plan:** ${pRuleWhy(id, t).join(" ")}`] : p ? [`- Not in your current plan. Say "add ${nmR(id)}" to use it.`] : [])].join("\n"));
  }
  // A new plan request ("Moneyball at Temple with Closed portal") belongs to pPlan, not an edit of the current plan.
  const other = pFindTeams(q)[0]; if (p && ((other && other !== p.t) || /\b(dynasty|rebuild)\b/.test(s))) return null;
  if (!p) return named.length ? pMd(`### ${nmR(named[0])}\n- Build a plan first, like "tough ${hT().n} dynasty", then I can change its rules.`) : null;
  const remove = /\b(remove|drop|delete|get rid of|lose|ditch|without|cut|take out|no more)\b/.test(s), swap = /\b(swap|replace|change|switch|instead|different)\b/.test(s),
    add = /\b(add|include|use|put in|throw in|with)\b/.test(s), dir = PDOWN.test(s) ? -1 : PUP.test(s) ? 1 : 0;
  const cat = !named.length && dir && (PCATW.find(([, re]) => re.test(s)) || [])[0];
  let rules = [...p.rules], keep = [...(p.keep || [])]; const notes = [];
  if (named.length && swap && named.length >= 2 && p.rules.includes(named[0])) {         // "swap Seniority for Redshirt rule"
    const [a, b] = named; rules = rules.filter(x => x !== a && HR[x].c !== HR[b].c).concat(b); keep = keep.filter(x => x !== a).concat(b);
    notes.push(`Swapped **${nmR(a)}** for **${nmR(b)}**`);
  } else if (named.length && (swap || remove) && p.rules.includes(named[0])) {
    const a = named[0];
    if (remove && !swap) { rules = rules.filter(x => x !== a); keep = keep.filter(x => x !== a); notes.push(`Removed **${nmR(a)}**`); }
    else { const alt = HRULES.filter(r => r.c === HR[a].c && !r.u && r.w(t) && !rules.includes(r.id)).sort((x, y) => Math.abs(x.l - HR[a].l) - Math.abs(y.l - HR[a].l))[0];
      if (!alt) return pMd(`### ${nmR(a)}\n- No other ${HCATN[HR[a].c].toLowerCase()} rule fits ${t.n}. Say "remove ${nmR(a)}" to drop it.`);
      rules = rules.map(x => x === a ? alt.id : x); keep = keep.filter(x => x !== a); notes.push(`Swapped **${nmR(a)}** for **${nmR(alt.id)}** (same category, closest weight)`); }
  } else if (named.length && (add || swap) && !p.rules.includes(named[0])) {
    const b = named[0]; if (!HR[b].w(t)) return pMd(`### ${nmR(b)}\n- Doesn't apply to ${t.n}.`);
    const out = rules.find(x => HR[x].c === HR[b].c); rules = rules.filter(x => x !== out).concat(b); keep.push(b);
    notes.push(out ? `Replaced **${nmR(out)}** with **${nmR(b)}**` : `Added **${nmR(b)}**`);
  } else if (named.length && remove) return pMd(`### ${nmR(named[0])}\n- It isn't in your plan.`);
  else if (cat) {                                                                           // "make the NIL rule lighter"
    const cur = rules.find(x => HR[x].c === cat);
    const alt = HRULES.filter(r => r.c === cat && !r.u && r.w(t) && !rules.includes(r.id) && (cur ? (dir < 0 ? r.l < HR[cur].l : r.l > HR[cur].l) : true))
      .sort((x, y) => dir < 0 ? y.l - x.l : x.l - y.l)[0];
    if (!alt && cur && dir < 0) { rules = rules.filter(x => x !== cur); notes.push(`Dropped **${nmR(cur)}**, the lightest ${HCATN[cat].toLowerCase()} rule`); }
    else if (!alt) return pMd(`### ${HCATN[cat]}\n- Already as ${dir < 0 ? "light" : "tough"} as it gets for ${t.n}.`);
    else { rules = cur ? rules.map(x => x === cur ? alt.id : x) : rules.concat(alt.id); keep = keep.filter(x => x !== cur).concat(alt.id);
      notes.push(cur ? `Swapped **${nmR(cur)}** for the ${dir < 0 ? "lighter" : "tougher"} **${nmR(alt.id)}**` : `Added **${nmR(alt.id)}**`); }
  } else return null;
  P.past.push(p);
  P.plan = {...p, rules:rules.sort((a, b) => catIx(a) - catIx(b)), keep, change:{notes, from:strainOf(p.rules)}};
  return pRender(P.plan);
}

/* ---- league-wide questions: filter/sort all programs, compare two, best players nationally ---- */
const PCONF = [["SEC", /\bsec\b/], ["Big Ten", /\bbig (ten|10)\b|\bb1g\b/], ["Big 12", /\bbig (12|twelve)\b/], ["ACC", /\bacc\b/], ["American", /\bamerican\b|\baac\b/],
  ["Pac-12", /\bpac.?12\b/], ["Mountain West", /\bmountain west\b|\bmwc\b/], ["Conference USA", /\bconference usa\b|\bc.?usa\b/], ["Sun Belt", /\bsun belt\b/], ["MAC", /\bmac\b/], ["Independent", /\bindependents?\b/]];
const PREGS = [...new Set(DATA.flatMap(t => t.pl.map(p => p[0])))];
function pScope(s){
  const c = PCONF.filter(([, re]) => re.test(s)).map(x => x[0]);
  if (c.length) return [DATA.filter(t => c.includes(t.c)), and(c)];
  if (/\b(p4|power (4|four|conference))\b/.test(s)) return [DATA.filter(isP4), "Power 4"];
  if (/\b(g5|group of (5|five))\b/.test(s)) return [DATA.filter(t => !isP4(t)), "Group of Five"];
  return [DATA, "FBS"];
}
const orank = t => [...DATA].sort((a, b) => b.o - a.o).indexOf(t) + 1;
const tLine = t => `**${t.n}** (${t.c}) · ${t.o} OVR · ${t.p}★ · NIL #${NILRANK.indexOf(t.n) + 1} · ${t.ti} title${t.ti === 1 ? "" : "s"}`;
// Numeric and yes/no filters over programs. Returns [[predicate, label], ...].
function pFilters(s){
  const F = [], M = {o:/overall|ovr|rated|rating/, of:/offen[cs]e/, df:/defen[cs]e/, p:/prestige|stars?|★/};
  const lt = /\b(under|below|less than|lower than|beneath|at most|no more than)\b/, ge = /\b(over|above|more than|higher than|at least|or better|or higher|\+)/;
  for (const [k, re] of Object.entries(M)) {
    const m = s.match(new RegExp(`(${re.source})\\s*(?:rating\\s*)?(${lt.source}|${ge.source})\\s*(\\d+(?:\\.\\d)?)|(${lt.source}|${ge.source})\\s*(\\d+(?:\\.\\d)?)\\s*(?:${re.source})`));
    if (!m) continue;
    const g = m.filter(Boolean), op = g.find(x => lt.test(x) || ge.test(x)), v = +g.find(x => /^\d+(\.\d)?$/.test(x)), isLt = lt.test(op);
    const nm = {o:"overall", of:"offense", df:"defense", p:"prestige"}[k];
    F.push([t => isLt ? t[k] < v : t[k] >= v, `${nm} ${isLt ? "under" : "at least"} ${v}${k === "p" ? "★" : ""}`]);
  }
  const top = s.match(/\btop[- ]?(\d+) (?:in )?nil|nil (?:rank(?:ed)? )?(?:in the )?top[- ]?(\d+)/), bot = s.match(/\bbottom[- ]?(\d+) (?:in )?nil/);
  if (top) { const v = +(top[1] || top[2]); F.push([t => NILRANK.indexOf(t.n) < v, `top-${v} NIL budget`]); }
  if (bot) { const v = +bot[1]; F.push([t => NILRANK.indexOf(t.n) >= DATA.length - v, `bottom-${v} NIL budget`]); }
  if (/\b(with|have|has|had|won|and|plus) (a |any |at least one )?(national )?(title|championship)|title winners?|champions\b/.test(s) && !/most (national )?titles/.test(s)) F.push([t => t.ti > 0, "at least one national title"]);
  if (/\b(no|without|never won a|zero) (national )?(titles?|championships?)/.test(s)) F.push([t => t.ti === 0, "no national titles"]);
  return F;
}
// A filtered list, sorted by the metric asked about (or overall).
function pFiltered(s, xs, where, labels, n){
  const key = /\bnil|budget|money/.test(s) && !/top[- ]?\d+ (in )?nil|bottom[- ]?\d+ (in )?nil/.test(s) ? "nt" : /offen/.test(s) ? "of" : /defen/.test(s) ? "df" : /prestige/.test(s) ? "p" : /titles/.test(s) ? "ti" : "o";
  const low = /\b(worst|lowest|weakest|poorest|cheapest|least|smallest)\b/.test(s);
  xs = [...xs].sort((a, b) => low ? a[key] - b[key] : b[key] - a[key]);
  const shown = xs.slice(0, Math.max(n, 12)); P.last = {kind:"league", q:s};
  P.facts = `Programs matching ${where}, ${labels.join(", ")} (${xs.length}):\n` + shown.map(t => tLine(t).replace(/\*\*/g, "")).join("\n");
  return pMd([`### ${where} · ${labels.join(" · ")}`, `- ${xs.length} program${xs.length === 1 ? "" : "s"} match${xs.length === 1 ? "es" : ""}${xs.length > shown.length ? `, top ${shown.length} shown` : ""}.`,
    ...shown.map(t => `- ${tLine(t)}${key === "of" ? ` · ${t.of} off` : key === "df" ? ` · ${t.df} def` : ""}`), ...(xs.length ? [] : ["- Try loosening one of the filters."])].join("\n"));
}
function pLeague(q){
  const s = norm(q), teams = pFindTeams(q), n = Math.min(15, +(s.match(/\btop (\d+)/) || [])[1] || 5);
  // Compare two programs.
  if (teams.length >= 2 && /\b(vs\.?|versus|compare|compared|or|against|better)\b/.test(s)) {
    const [a, b] = teams, best = t => [...t.r].sort((x, y) => y[3] - x[3])[0], hc = t => (t.st || []).find(c => c[0] === "HC");
    const row = (lbl, f, hi = true) => { const x = f(a), y = f(b); const w = x === y ? "" : (hi ? x > y : x < y) ? ` · edge ${a.n}` : ` · edge ${b.n}`; return `- **${lbl}:** ${x} vs ${y}${w}`; };
    P.team = a; P.last = {kind:"compare", a}; P.facts = [a, b].map(t => `${t.n}: ${tLine(t).replace(/\*\*/g, "")}; best player ${pRow(best(t)).replace(/\*\*/g, "")}; head coach ${hc(t) ? hc(t)[1] : "unknown"}`).join("\n");
    return pMd([`### ${a.n} vs ${b.n}`, row("Overall", t => t.o), row("Offense", t => t.of), row("Defense", t => t.df), row("Prestige", t => t.p),
      row("NIL rank", t => NILRANK.indexOf(t.n) + 1, false), row("National titles", t => t.ti), row("Tier 3+ pipelines", t => pipesAt(t, 3).length),
      `### Best players`, `- ${pRow(best(a), a)}`, `- ${pRow(best(b), b)}`,
      `### Head coaches`, ...[a, b].map(t => hc(t) ? `- ${sRow(hc(t), t)}` : `- ${t.n}: none listed`)].join("\n"));
  }
  const [pool, where] = pScope(s), league = /\b(in the country|nationally|in the nation|in (the )?(fbs|college football)|any team|who has|which team|what team|across|in the (sec|acc|big|pac|mac|sun|mountain|american|conference)|overall)\b/.test(s)
    || PCONF.some(([, re]) => re.test(s)) || /\b(p4|g5|power (4|four)|group of (5|five))\b/.test(s);
  // Best players across many teams ("best QB in the SEC", "who has the fastest receiver").
  const pos = PPOS.find(([, re]) => re.test(s));
  if (!teams.length && league && (pos || /\bplayers?\b/.test(s)) && /\b(best|top|fastest|highest|who has)\b/.test(s)) {
    const grp = pos && pGrp(pos[0]), fast = /fastest|speed/.test(s);
    const xs = pool.flatMap(t => t.r.filter(p => !grp || grp.includes(p[1])).map(p => [p, t])).sort((a, b) => fast ? b[0][5] - a[0][5] || b[0][3] - a[0][3] : b[0][3] - a[0][3] || b[0][5] - a[0][5]).slice(0, n);
    P.last = {kind:"league", q:s}; P.facts = `Top players (${where}):\n` + xs.map(([p, t]) => pRow(p, t).replace(/\*\*/g, "")).join("\n");
    return pMd([`### ${fast ? "Fastest" : "Best"} ${pos ? pos[0] : "players"} · ${where}`, ...xs.map(([p, t]) => `- ${pRow(p, t)}`)].join("\n"));
  }
  // In a pipeline question, "Texas" or "Alabama" means the place, not the team.
  const place = x => Object.values(STNAME).some(nm => norm(nm) === norm(x.n)) || PREGS.some(r => norm(r) === norm(x.n));
  if (teams.length && !(/pipeline/.test(s) && teams.every(place))) return null;
  // Filters that stack with the conference scope and each other: "SEC teams under 80 overall with a Texas pipeline".
  const F = pFilters(s), st = /pipeline/.test(s) && Object.entries(STNAME).find(([, nm]) => new RegExp(`\\b${norm(nm)}\\b`).test(s));
  const regs = /pipeline/.test(s) ? PREGS.filter(r => s.includes(norm(r))) : [], where2 = regs.length ? regs : st ? regsIn(st[0]) : [];
  const min = +(s.match(/\btier (\d)/) || [])[1] || 1, plbl = regs.length ? and(regs) : st ? STNAME[st[0]] : "";
  if (where2.length && F.length) F.push([t => t.pl.some(p => where2.includes(p[0]) && p[1] >= min), `${plbl} pipeline${min > 1 ? ` tier ${min}+` : ""}`]);
  if (F.length) return pFiltered(s, pool.filter(t => F.every(f => f[0](t))), where, F.map(f => f[1]), n);
  // Pipelines: "who has a tier 5 pipeline in Texas", "best pipeline in Metro Atlanta".
  if (/pipeline/.test(s)) {
    if (!where2.length) return null;
    const xs = pool.map(t => [t, Math.max(0, ...t.pl.filter(p => where2.includes(p[0])).map(p => p[1]))]).filter(x => x[1] >= min).sort((a, b) => b[1] - a[1] || b[0].o - a[0].o);
    const lbl = plbl; P.last = {kind:"league", q:s};
    P.facts = `Programs with a pipeline in ${lbl}: ` + xs.slice(0, 25).map(([t, tr]) => `${t.n} tier ${tr}`).join(", ");
    return pMd([`### ${lbl} pipelines${min > 1 ? ` · Tier ${min}+` : ""}${where !== "FBS" ? ` · ${where}` : ""}`, `- ${xs.length} program${xs.length === 1 ? "" : "s"}. Strongest first:`,
      ...xs.slice(0, Math.max(n, 8)).map(([t, tr]) => `- **${t.n}** · Tier ${tr} (${TIERN[tr]}) · ${t.o} OVR`)].join("\n"));
  }
  // Rankings over programs.
  const M = [["rebuild", /rebuild|turn ?around|fixer.?upper|sleeping|potential|upside/], ["rec", /recruit\w*|pipelines? (strength|power)|best pipelines\b/], ["nil", /\bnil|budget|money|richest|poorest|cheapest/], ["titles", /titles?|championships?/],
    ["prestige", /prestige|brand|blue.?blood/], ["of", /offen[cs]e/], ["df", /defen[cs]e/], ["o", /\b(best|worst|top|strongest|weakest|highest|lowest|rated|overall|good|bad)\b/]];
  const m = M.find(([, re]) => re.test(s)); if (!m || !(league || /\b(team|teams|program|programs|school|schools|which|who)\b/.test(s))) return null;
  const low = /\b(worst|lowest|weakest|poorest|cheapest|least|bottom|smallest|bad)\b/.test(s), key = m[0];
  // Rebuild pick: a budget that ranks well above the roster (money to fix it), then prestige.
  // Rebuilds leave out the top third of rosters in scope, then rank by money and brand relative to the roster.
  const cut = [...pool].sort((a, b) => b.o - a.o)[Math.floor(pool.length / 3)]?.o ?? 0, pool2 = key === "rebuild" ? pool.filter(t => t.o < cut) : pool;
  // Recruiting power: prestige, NIL rank and Tier 3+ pipelines, the three things the game's recruiting pitch leans on.
  const recS = t => t.p * 10 + (DATA.length - NILRANK.indexOf(t.n)) * .25 + pipesAt(t, 3).length * 3;
  const score = key === "rec" ? recS : key === "rebuild" ? t => (orank(t) - (NILRANK.indexOf(t.n) + 1)) + t.p * 10 : key === "nil" ? t => t.nt : t => t[key === "titles" ? "ti" : key];
  const xs = [...pool2].sort((a, b) => low ? score(a) - score(b) : score(b) - score(a)).slice(0, n);
  const title = {rec:low ? "Weakest recruiting power" : "Strongest recruiting power", rebuild:"Best rebuild jobs", nil:low ? "Smallest NIL budgets" : "Biggest NIL budgets", titles:"Most national titles", prestige:low ? "Lowest prestige" : "Highest prestige",
    of:low ? "Weakest offenses" : "Best offenses", df:low ? "Weakest defenses" : "Best defenses", o:low ? "Lowest rated" : "Highest rated"}[key];
  P.facts = `${title} (${where}):\n` + xs.map(t => tLine(t).replace(/\*\*/g, "")).join("\n"); P.last = {kind:"league", q:s};
  return pMd([`### ${title} · ${where}`, ...(key === "rebuild" ? [`- Skips the top third of rosters (${cut}+ overall), then ranks by how far the NIL budget outranks the roster, plus prestige: money and a brand to fix a weaker team.`] : []),
    ...(key === "rec" ? ["- Ranked by prestige, NIL budget and the number of Tier 3+ recruiting pipelines."] : []),
    ...xs.map(t => `- ${tLine(t)}${key === "rec" ? ` · ${pipesAt(t, 3).length} Tier 3+ pipelines` : key === "rebuild" ? ` · roster #${orank(t)}, NIL #${NILRANK.indexOf(t.n) + 1}` : key === "of" ? ` · ${t.of} off` : key === "df" ? ` · ${t.df} def` : ""}`)].join("\n"));
}
// Names that point at more than one program: ask instead of guessing.
const PAMB = [[/\bmiami\b(?! (university|oh\b|ohio|fl\b|florida|hurricanes|redhawks))/, ["Miami", "Miami University"], /\bthe u\b|hurricanes|redhawks/],
  [/\but\b/, ["Texas", "Tennessee", "Utah"], null]];
function pAmbig(q){
  const s = norm(q);
  for (const [re, names, skip] of PAMB) if (re.test(s) && !(skip && skip.test(s))) return {re, opts:names.map(n => DATA.find(t => t.n === n)).filter(Boolean)};
  return null;
}
// When nothing matched: suggest what Coach can do, aimed at the team in play if there is one.
function pHelp(t){
  if (!t) return PHELP;
  const riv = DATA.filter(x => x !== t && x.c === t.c).sort((a, b) => Math.abs(a.o - t.o) - Math.abs(b.o - t.o))[0];
  return pMd([`I didn't follow that. About ${t.n} you can ask:`, `- "Tough ${t.n} dynasty" or "casual ${t.n} rebuild"`, `- "Best players at ${t.n}" or "best QB?"`,
    `- "${t.n} coaching staff"`, ...(riv ? [`- "${t.n} vs ${riv.n}"`] : []), ...(P.plan ? [`- "Remove ${unesc(HR[P.plan.rules[0]].n)}", "make it easier" or "undo"`] : [])].join("\n"));
}
/* ---- challenge suggestions: three data-driven dynasty challenges, pick one by number or name ---- */
const PCHAL = /\b(challenges?|suggest|recommend|surprise me|ideas?|what (team|program|school) should i|give me (a|an|some) (dynasty|team|program)|good dynasty|fun dynasty|interesting dynasty|dynasty ideas?)\b/;
const pick = xs => xs[Math.floor(Math.random() * xs.length)];
function pChallenges(q = ""){
  const s = norm(q), noTi = /\b(never won|no (national )?(titles?|championships?)|without a (title|championship)|zero titles|first (ever )?(title|championship|natty))\b/.test(s);
  const OK = t => !noTi || t.ti === 0, D = DATA.filter(OK);
  const nr = t => NILRANK.indexOf(t.n) + 1, g5 = D.filter(t => !isP4(t));
  const cut = [...DATA].sort((a, b) => b.o - a.o)[Math.floor(DATA.length / 3)].o;
  const rb = D.filter(t => t.o < cut).sort((a, b) => ((orank(b) - nr(b)) + b.p * 10) - ((orank(a) - nr(a)) + a.p * 10)).slice(0, 5);
  const all = [
    () => { const t = pick(D.filter(t => t.ti >= 3 && t.p <= 4).sort((a, b) => b.ti - a.ti || a.p - b.p).slice(0, 4)); if (!t) return null;
      return {name:"Back to glory", t, q:`${t.n} dynasty rebuild`, why:`${t.ti} national titles, the last in ${tYears(t).slice(-1)[0]}, but only ${t.p}★ today.`,
        goal:`Win the ${t.c === "Independent" ? "most games of your career" : t.c} within five seasons and bring home ${t.n}'s first national title since ${tYears(t).slice(-1)[0]}.`}; },
    () => { const t = pick(g5.sort((a, b) => a.nt - b.nt).slice(0, 8)); if (!t) return null;
      return {name:"Moneyball", t, q:`moneyball at ${t.n}`, why:`NIL budget #${nr(t)} of ${DATA.length} (${fmt(t.nt)}), ${t.o} overall.`,
        goal:`Win the ${t.c === "Independent" ? "a bowl game" : t.c} with no blue-chip recruits and half of an already tiny budget.`}; },
    () => { const t = pick(D.filter(t => t.p >= 5)); if (!t) return null;
      return {name:"Blue-blood burden", t, q:`blue blood ${t.n} dynasty`, why:`${t.p}★ prestige and ${t.ti} titles: anything short of a title is a failure.`,
        goal:`Win a national title within three seasons on Heisman difficulty against a brutal schedule, or you're fired.`}; },
    () => { const t = pick(rb); if (!t) return null;
      return {name:"Money-pit rebuild", t, q:`tough ${t.n} dynasty rebuild`, why:`Roster #${orank(t)} but NIL #${nr(t)}: the money is there, the players aren't.`,
        goal:`Top-25 finish by season three and a playoff berth by season five.`}; },
    () => { const t = pick(g5.filter(t => t.p <= 2)); if (!t) return null;
      return {name:"Climb the carousel", t, q:`coaching carousel ${t.n} dynasty`, why:`${t.p}★ ${t.c} program, ${t.o} overall: nobody's first choice.`,
        goal:`Start as a coordinator at ${t.n}, earn the head job, then get hired by a Power 4 program.`}; },
    () => { const t = pick(DATA.filter(t => t.ti === 0).sort((a, b) => b.o - a.o).slice(0, 8)); if (!t) return null;
      return {name:"First title", t, q:`tough ${t.n} dynasty`, why:`${t.o} overall and ${t.p}★, but no national title in program history.`,
        goal:`Win the first national title in ${t.n} history within five seasons.`}; }];
  const xs = all.sort(() => Math.random() - .5).map(f => f()).filter(Boolean).slice(0, 3);
  P.choices = xs;
  P.facts = "Challenge options:\n" + xs.map((c, i) => `${i + 1}. ${c.name}: ${c.t.n}. ${c.why} Goal: ${c.goal}`).join("\n");
  return pMd([`### ${xs.length === 3 ? "Three" : xs.length} dynasty challenges${noTi ? " · programs without a national title" : ""}`, ...xs.flatMap((c, i) => [`- **${i + 1}. ${c.name}: ${c.t.n}** · ${c.why} **Goal:** ${c.goal}`]),
    'Reply with a number or the team to build that plan, or say "more ideas".'].join("\n"));
}
function pTakeChallenge(c){
  const plan = pPlan(c.q); if (!plan) return null;
  if (P.plan) P.past.push(P.plan);
  P.team = plan.t; P.plan = {...plan, goal:c.goal, goalName:c.name}; return pRender(P.plan);
}
/* ---- roster roadmap: who leaves when, where the holes are, what to recruit ---- */
// Eligibility left from class year (redshirt * already used): FR 4, SO 3, JR 2, SR 1. Starters per group approximate a base 11 + specialists.
const PSTART = {QB:1, RB:1, WR:3, TE:1, OL:5, LEDG:1, REDG:1, DT:2, SAM:1, MIKE:1, WILL:1, CB:2, FS:1, SS:1, K:1, P:1};
const PROAD = /\broadmap\b|roster (plan|outlook|needs|holes)|plan (my|the|our)? ?(first )?(\d+ |two |three |four )?(seasons?|years?)\b|who (is|are|'s) (leaving|graduating)|graduat|departures|losing (the most|seniors)|\bholes\b|positions? of need|needs? at|what (positions?|should i) (to )?recruit|recruiting (needs|priorities)|seniors? leaving/;
const yrsLeft = y => ({FR:4, SO:3, JR:2, SR:1})[String(y).replace("*", "")] || 1;
function pRoadmap(q, t){
  const s = norm(q), N = Math.min(4, +(s.match(/\b(\d) (seasons?|years?)/) || [])[1] || {two:2, three:3, four:4}[(s.match(/\b(two|three|four) (seasons?|years?)/) || [])[1]] || 3);
  const groups = POSG.filter(g => g[1]).map(([name, ps]) => ({name, ps, all:t.r.filter(p => ps.includes(p[1])).sort((a, b) => b[3] - a[3])}));
  const out = [`### ${t.n} · ${N}-season roster roadmap`, `- Based on class years in the Year 1 preseason roster. Early NFL departures and transfers aren't modeled, so real holes can be bigger.`], pri = {};
  for (let k = 1; k <= N; k++) {
    const leave = t.r.filter(p => yrsLeft(p[2]) === k), holes = [];
    for (const g of groups) {
      const n = PSTART[g.name] || 1, starters = g.all.slice(0, n), lost = starters.filter(p => yrsLeft(p[2]) <= k && yrsLeft(p[2]) > k - 1);
      const left = g.all.filter(p => yrsLeft(p[2]) > k), next = left[n - 1];
      if (!lost.length && left.length >= n) continue;
      // Share of the unit lost, plus raw bodies lost (4 of 5 linemen beats 1 of 1 back), plus thin depth. Later seasons count a bit less.
      const score = lost.length / n * 2 + lost.length * .5 + (left.length < n ? 1.5 : left.length < 2 * n ? .5 : 0);
      pri[g.name] = (pri[g.name] || 0) + score / (1 + (k - 1) * .5);
      holes.push([score, `**${g.name}:** ${lost.length ? `lose ${lost.length} of ${n} starter${n > 1 ? "s" : ""} (${lost.map(p => `${p[0]} ${p[3]}`).join(", ")})` : "starters stay"}${left.length < n ? `, only ${left.length} left on the roster` : next ? `, next up ${next[0]} ${next[3]}` : ""}`]);
    }
    holes.sort((a, b) => b[0] - a[0]);
    out.push(`### After season ${k}`, `- **Leaving:** ${leave.length} players, ${groups.reduce((c, g) => c + g.all.slice(0, PSTART[g.name] || 1).filter(p => yrsLeft(p[2]) === k).length, 0)} of them starters`,
      ...(holes.length ? holes.slice(0, 4).map(x => `- ${x[1]}`) : ["- No starter losses."]));
  }
  const order = Object.entries(pri).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  out.push("### Recruiting priorities", `- ${order.length ? order.slice(0, 5).map((g, i) => `${i + 1}. ${g}`).join("  ") : "Nothing urgent: the starting lineup is young."}`);
  P.team = t; P.last = {kind:"roadmap", q};
  P.facts = out.join("\n").replace(/\*\*/g, "").replace(/### /g, "");
  return pMd(out.join("\n"));
}
// Single-team numbers: "how good is Michigan's defense", "and their NIL?".
const PSTATW = [["df", /defen[cs]e/], ["of", /offen[cs]e/], ["nt", /\bnil\b|\bbudget\b|\bmoney\b/], ["p", /prestige/], ["ti", /titles?|championships?/], ["o", /\b(overall|how good|rating|rated|how strong)\b/]];
function pStat(q, t){
  const s = norm(q), k = (PSTATW.find(([, re]) => re.test(s)) || [])[0]; if (!k) return null;
  const rk = (pool, f) => [...pool].sort((a, b) => f(b) - f(a)).indexOf(t) + 1, conf = DATA.filter(x => x.c === t.c), f = x => x[k];
  const lbl = {df:"Defense", of:"Offense", nt:"NIL budget", p:"Prestige", ti:"National titles", o:"Overall"}[k];
  const val = k === "nt" ? fmt(t.nt) : k === "p" ? t.p + "★" : t[k];
  const grp = k === "df" ? ["DL", "LB", "CB", "S"] : k === "of" ? ["QB", "RB", "WR", "TE", "OL"] : null;
  const ps = grp ? t.r.filter(p => grp.some(g => pGrp(g).includes(p[1]))).sort((a, b) => b[3] - a[3]).slice(0, 3) : [];
  P.team = t; P.last = {kind:"stat", q};
  const out = [`### ${t.n} · ${lbl}`, `- **${lbl}:** ${val} · #${rk(DATA, f)} of ${DATA.length}${t.c !== "Independent" ? ` · #${rk(conf, f)} of ${conf.length} in the ${t.c}` : ""}`,
    ...(k === "ti" && tYears(t).length ? [`- **Seasons:** ${tYears(t).join(", ")}`] : []), ...(ps.length ? ["### Best on that side", ...ps.map(p => `- ${pRow(p)}`)] : [])];
  P.facts = out.join("\n").replace(/\*\*/g, "").replace(/### /g, "");
  return pMd(out.join("\n"));
}
/* ---- whole-message intent: decided before any handler gets a turn, so a stray keyword can't hijack a plan request ---- */
// A plan request names (or continues) a program and asks for a dynasty, challenge, rules or a difficulty.
const PPLANW = /\b(dynast(y|ies)|challenge|challenging|house rules|rebuild|save|run it|play (as|with)|coach (at|for))\b|\bplan\b(?! (my|the|our) (first|next|\d))/;
const POVER = /\b(what do you think (of|about)|thoughts on|tell me about|how (good )?is|overview|scouting report|breakdown|rundown|what('s| is) (the deal|up) with|should i (pick|take|play as|use))\b/;
const PBEGIN = /\b(never played|first (time|dynasty)|new to (dynasty|the game|cfb|college football)|beginner|newbie|just (started|getting started)|easiest (team|program|school)|where (should|do) i start|(team|program|school) (should i|to) start)\b/;
const PEASY = /\b(easiest|best|clearest|shortest|quickest) (path|road|route|way|shot) to (a |the )?(natty|title|national (title|championship)|championship|playoff)|best (chance|shot) (at|to win) (a |the )?(natty|title|national|championship)/;
function pIntent(q){
  const s = norm(q), team = pFindTeams(q)[0] || null;
  const asksPlan = PPLANW.test(s) || [...PDIFF, ...PPRE, ...PRULE].some(([, re]) => re.test(s)) || !!pGameDiff(s) && /\b(play|playing|on)\b/.test(s);
  // "Tell me about Oregon" is an overview unless it also asks for a dynasty; roster and staff questions keep their own answers.
  const over = !!team && POVER.test(s) && !PPLANW.test(s) && !PPOS.some(([, re]) => re.test(s)) && !/\b(coach|coaches|staff|coordinators?|roster|players?|nil|budget|prestige|offen[cs]e|defen[cs]e|titles?|pipelines?)\b/.test(s);
  const cmp = pFindTeams(q).length >= 2 && /\b(vs\.?|versus|compare|or|better)\b/.test(s) && !PDIFF.some(([, re]) => re.test(s));   // "Oregon or Texas?"
  return {s, team, plan: !!team && asksPlan && !over && !cmp, over, begin: PBEGIN.test(s), easy: PEASY.test(s)};
}
// "What do you think about Oregon": the program at a glance, not a rule set.
function pOverview(t){
  const rk = f => [...DATA].sort((a, b) => f(b) - f(a)).indexOf(t) + 1, nr = NILRANK.indexOf(t.n) + 1;
  const best = [...t.r].sort((a, b) => b[3] - a[3]).slice(0, 3), hc = (t.st || []).find(c => c[0] === "HC");
  const pl = t.pl.filter(x => x[1] >= 3).sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 4);
  const [, arch] = ARCH.find(a => t.p >= a[0]);
  P.team = t; P.last = {kind:"stat", q:"overall"};
  const out = [`### ${t.n} ${t.nk} · at a glance`, `- **${t.c}** · ${t.p}★ prestige · recruiting band: ${arch}`,
    `- **Overall ${t.o}** (#${rk(x => x.o)} of ${DATA.length}) · offense ${t.of} (#${rk(x => x.of)}) · defense ${t.df} (#${rk(x => x.df)})`,
    `- **NIL budget:** ${fmt(t.nt)} (#${nr} of ${DATA.length})`,
    `- **National titles:** ${t.ti ? `${t.ti} (last in ${tYears(t).slice(-1)[0]})` : "none yet"}`,
    `- **Strong pipelines (Tier 3+):** ${pl.length ? and(pl.map(x => `${x[0]} (Tier ${x[1]})`)) : "none"}`,
    ...(hc ? [`- ${sRow(hc)}`] : []), "### Best players", ...best.map(p => `- ${pRow(p)}`),
    `Want a plan? Try "tough ${t.n} dynasty" or "casual ${t.n} rebuild".`];
  P.facts = out.join("\n").replace(/\*\*/g, "").replace(/### /g, "");
  return pMd(out.join("\n"));
}
// New players: strong roster, money and pipelines, so recruiting and winning come easy while they learn.
function pBeginner(){
  const nr = t => NILRANK.indexOf(t.n) + 1, sc = t => t.o * 2 + t.p * 6 - nr(t) * .3 + pipesAt(t, 3).length * 2;
  const xs = [...DATA].sort((a, b) => sc(b) - sc(a)).slice(0, 4);
  P.last = {kind:"league", q:"best teams"};
  P.facts = "Starter-friendly programs (roster, prestige, NIL, pipelines):\n" + xs.map(t => tLine(t).replace(/\*\*/g, "")).join("\n");
  return pMd(["### Good first dynasties", "- Picked for a strong roster, high prestige, a big NIL budget and Tier 3+ pipelines, so you can learn recruiting without starting from scratch.",
    ...xs.map(t => `- ${tLine(t)} · ${pipesAt(t, 3).length} strong pipelines`),
    `Say "casual ${xs[0].n} dynasty" for a relaxed plan, or name another program.`].join("\n"));
}
// Easiest road to a title: a strong roster in a conference without a close rival.
function pEasyPath(s){
  const [pool, where] = pScope(s);
  const top = t => DATA.filter(x => x !== t && x.c === t.c).sort((a, b) => b.o - a.o)[0];
  const sc = t => t.o * 2 + (t.c === "Independent" || !top(t) ? 0 : t.o - top(t).o) + t.p * 2;
  const xs = [...pool].sort((a, b) => sc(b) - sc(a)).slice(0, 5);
  P.last = {kind:"league", q:s};
  P.facts = `Easiest paths to a title (${where}): ` + xs.map(t => `${t.n} ${t.o} OVR, top conference rival ${top(t) ? `${top(t).n} ${top(t).o}` : "none"}`).join("; ");
  return pMd([`### Easiest paths to a title · ${where}`, "- Ranked by roster strength, how far ahead of the next-best team in the conference it is, and prestige.",
    ...xs.map(t => `- ${tLine(t)} · ${t.c === "Independent" || !top(t) ? "no conference title game in the way" : `best ${t.c} rival: ${top(t).n} (${top(t).o})`}`)].join("\n"));
}
/* ---- follow-ups: "what about Michigan?" repeats the last kind of question for the new team or conference ---- */
function pFollow(q){
  const s = norm(q), L = P.last; if (!L || s.split(/\s+/).length > 8) return null;
  if (!/^(what|how) about\b|^and\b|^(same|now|ok|okay)\b|^(for|at|in) \w|^(do|try|show) (the same|that) for|^(what|how) (about|is|are) (their|its)/.test(s) && !(pFindTeams(q).length && s.split(/\s+/).length <= 2 && ![...PDIFF, ...PPRE].some(([, re]) => re.test(s)) && !/dynasty|rebuild/.test(s))) return null;
  const t = pFindTeams(q)[0], scope = PCONF.find(([, re]) => re.test(s)) || (/\b(p4|power (4|four)|g5|group of (5|five)|country|nation|fbs)\b/.test(s) ? [s.match(/\b(p4|power (4|four)|g5|group of (5|five)|country|nation|fbs)\b/)[0]] : null);
  if (L.kind === "compare" && t && t !== L.a) return pLeague(`${L.a.n} vs ${t.n}`);
  if (L.kind === "league" && (scope || t)) {
    const base = L.q.replace(new RegExp(PCONF.map(([, re]) => re.source).join("|"), "g"), " ").replace(/\b(in the|in|p4|g5|power (4|four)|group of (5|five)|country|nation|fbs)\b/g, " ");
    return scope ? pLeague(`${base} in the ${scope[0]}`) : null;
  }
  if (!t && /\b(their|its|they)\b/.test(s) && P.team) { const st2 = pStat(q, P.team); if (st2) return st2; }
  if (!t) return null;
  if (L.kind === "players") return pPlayers(L.q, t);
  if (L.kind === "staff") return pStaff(L.q, t);
  if (L.kind === "roadmap") return pRoadmap(L.q, t);
  if (L.kind === "stat") return pStat(PSTATW.some(([, re]) => re.test(s)) ? q : L.q, t);
  return null;
}
async function pAsk(q){
  q = q.trim(); if (!q || P.busy) return;
  pSay("me", esc(q)); P.fuzzy = null;
  const replying = !!(P.pending || P.choices);   // answers to "Which one?" or a challenge pick stay keyword-only
  if (/^(clear|reset|start over|new chat|clear chat|forget (it|everything))\b/i.test(q)) return pClear();
  // Answer to "Which Miami?": pick an option and replay the original question with an unambiguous name.
  if (P.pending) {
    const pd = P.pending, s = norm(q), ix = /\b(1|first|one)\b/.test(s) ? 0 : /\b(2|second|two)\b/.test(s) ? 1 : /\b(3|third|three)\b/.test(s) ? 2 : -1;
    const pick = pd.opts[ix] || pd.opts.find(t => pFindTeams(q).includes(t)); P.pending = null;
    if (pick) q = pd.q.replace(pd.re, ` ${pick.n} ${pick.nk} `).replace(/\s+/g, " ");
  }
  if (P.choices) {
    const s = norm(q), ix = /^\W*(1|first|one|the first)\b/.test(s) ? 0 : /^\W*(2|second|two|the second)\b/.test(s) ? 1 : /^\W*(3|third|three|the third)\b/.test(s) ? 2 : -1;
    const c = P.choices[ix] || P.choices.find(x => pFindTeams(q)[0] === x.t); P.choices = null;
    if (c) { pSay("bot", pTakeChallenge(c)); return pSave(); }
  }
  if (!replying) {
    const wait = pAIUse(q) || window.__aiStub ? pSay("bot", '<p class="pthink">Reading that…</p>') : null;
    P.busy = true; const c = pCanon(await pAI(q), q); P.busy = false; if (wait) wait.remove();
    if (c) q = c;
  }
  const it = pIntent(q);
  if (it.begin && !it.team) { pSay("bot", pBeginner()); return pSave(); }
  if (it.easy && !it.team) { pSay("bot", pEasyPath(it.s)); return pSave(); }
  if ((PCHAL.test(norm(q)) || /\bmore ideas|other ideas|something else\b/i.test(q)) && !pFindTeams(q).length && !/\b(rule|remove|swap)\b/i.test(q)) { pSay("bot", pChallenges(q)); return pSave(); }
  const amb = pAmbig(norm(q)) && pAmbig(q);
  if (amb) { P.pending = {q:norm(q), re:amb.re, opts:amb.opts};
    pSay("bot", pMd(["### Which one?", ...amb.opts.map((t, i) => `- **${i + 1}. ${t.n} ${t.nk}** · ${t.c} · ${t.o} OVR`), "Reply with the number or the name."].join("\n"))); return pSave(); }
  // Order: a named player, then roster questions ("best QB at Ohio State"), then fallen powerhouses, then a dynasty plan.
  const fp = pFindPlayer(q), rq = (/\b(best|top|fastest|highest.rated|starting|starter)\b/i.test(q) && !/dynasty|rebuild|house rules|challenge|\bplan\b/i.test(q))
    || (!it.plan && !!it.team && PPOS.some(([pos, re]) => pos === "K" ? /\bkickers?\b/.test(it.s) : pos === "P" ? /\bpunters?\b/.test(it.s) : re.test(it.s)));   // "tell me about Oregon's QBs"
  const tp = pFindTeams(q)[0] || P.team;
  let html = "", plan = null;
  const fc = !fp && pFindCoach(q), sq = /\b(head coach|coaches|coaching staff|staff|coordinators?|oc|dc|hc)\b|who coaches/i.test(q) && !/dynasty|created|custom|own coach|real coach/i.test(q);
  // A plan request goes straight to the planner: league, ability and follow-up handlers only see other messages.
  const fu = !it.plan && pFollow(q), ed = !fu && pEdit(q), lg = !fu && !ed && !it.plan && pLeague(q), ah = !fu && !ed && !lg && !it.plan && pAbil(q);
  const notPlan = !/dynasty|rebuild|house rules|challenge|\brules?\b|\bplan\b(?! (my|the|our))|tough|casual|hard|easy/i.test(q)
    && ![...PDIFF, ...PPRE, ...PRULE].some(([, re]) => re.test(norm(q))) && !PDOWN.test(norm(q)) && !PUP.test(norm(q));
  const rm = PROAD.test(norm(q)), stq = notPlan && tp && !/\b(best|top|fastest|worst|highest|lowest|most|who)\b/i.test(q) && PSTATW.some(([, re]) => re.test(norm(q)));
  if (fu) html = fu;
  else if (ed) html = ed;
  else if (lg) html = lg;
  else if (ah) html = ah;
  else if (it.over) html = pOverview(it.team);
  else if (rm && tp) html = pRoadmap(q, tp);
  else if (stq && (pFindTeams(q).length || /\b(their|its|they)\b/i.test(q))) html = pStat(q, tp);
  else if (fc) { P.team = fc[0]; P.facts = `Coach on the board: ${sRow(fc[1], fc[0]).replace(/\*\*/g, "")}`; html = pMd([`### ${fc[1][1]}`, `- ${sRow(fc[1], fc[0])}`].join("\n")); }
  else if (sq && tp) { html = pStaff(q, tp); P.last = {kind:"staff", q}; }
  else if (fp) { P.team = fp[0]; P.facts = `Player on the board: ${pRow(fp[1], fp[0]).replace(/\*\*/g, "")}`; html = pMd([`### ${fp[1][0]}`, `- ${pRow(fp[1], fp[0])}`].join("\n")); }
  else if (rq && tp) { html = pPlayers(q, tp); P.last = {kind:"players", q}; }
  else if (/powerhouse|back to glory|sleeping giant|fallen|glory days|restore|revive|blue.?blood.* (fall|decline)/i.test(q)) html = pGlory();
  else if (plan = /real coach/i.test(q) && P.plan ? {...P.plan, created:false} : pPlan(q)) { if (P.plan) P.past.push(P.plan); P.team = plan.t; P.plan = plan; html = pRender(plan); P.last = {kind:"plan"}; }
  if (html && P.fuzzy) html = `<p class="pguess">Reading “${esc(P.fuzzy.typed)}” as ${esc(P.fuzzy.t.n)}.</p>` + html;
  pSay("bot", html || (P.team || pFindTeams(q)[0] ? pHelp(pFindTeams(q)[0] || P.team) : `<p>I didn't catch a program in that.</p>` + PHELP));
  pSave();
}
/* ---- Workers AI understanding step: /api/coach (src/worker.js) reads the message into a structured request,
   pCanon turns that into a plain sentence the keyword engine above already handles, and the engine writes the answer.
   The AI never writes answers, so it can't invent rules or numbers. Any failure (offline, daily free limit, rate limit,
   slow reply, opened from disk) falls back to the original message. ---- */
const PAISKIP = /^\s*(and|what about|how about|same|now|ok|okay|yes|no|nope|undo|go back|back|start over|clear|reset|make it|tone|crank|dial|remove|drop|add|swap|replace|why|explain|\d)\b/i;
const pAIUse = q => !window.__noAI && location.protocol.startsWith("http") && q.trim().split(/\s+/).length >= 5 && !PAISKIP.test(q)
  && !pFindRules(q).length && !/\babilit(y|ies)\b|archetype|\b(gets?|unlock)\b/i.test(q);
async function pAI(q){
  if (window.__aiStub) return window.__aiStub(q, P.team && P.team.n);   // check.mjs feeds recorded model replies here
  if (!pAIUse(q)) return null;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch("/api/coach", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({q, team:P.team ? P.team.n : ""}), signal:ctl.signal});
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(tm); }
}
// The model's request as Coach's own phrasing. Teams must come from the message (or the current program): the model can't add one.
function pCanon(j, q){
  if (!j || typeof j !== "object" || !j.kind || j.kind === "other") return null;
  const said = pFindTeams(q), v = " " + norm(q).replace(/[^a-z0-9&]+/g, " ") + " ";
  const real = t => t && (said.includes(t) || t === P.team || [t.n, t.nk].some(x => norm(x).split(/\s+/).some(w => w.length >= 4 && v.includes(" " + w + " "))));
  const ts = (Array.isArray(j.teams) ? j.teams : []).map(n => pFindTeams(String(n))[0]).filter(real), t = ts[0] || null;
  const conf = j.conference && j.conference !== "none" ? ` in the ${j.conference}` : "";
  const pos = {QB:"qb", RB:"rb", WR:"wr", TE:"te", OL:"ol", DL:"dl", LB:"lb", CB:"cb", S:"safeties", K:"kickers", P:"punters"}[j.position] || "";
  const RANK = {overall:"best teams", offense:"best offense teams", defense:"best defense teams", nil:"biggest nil budget teams", prestige:"highest prestige teams",
    titles:"most titles teams", recruiting:"best recruiting teams", rebuild:"best rebuild jobs"};
  let kind = j.kind;
  if (kind === "players" && !pos && !t && RANK[j.rank_by]) kind = "ranking";   // "best at recruiting in the SEC" is about programs
  switch (kind) {
    case "plan": {
      const pt = t || P.team; if (!pt) return null;
      const s = norm(q), keep = [...PPRE, ...PRULE].map(([, re]) => (s.match(re) || [])[0]).filter(Boolean);   // presets and rules named in the message
      const gd = {"freshman":"freshman", "varsity":"varsity", "all-american":"all-american", "heisman":"heisman"}[j.game_difficulty];
      return [`${{casual:"casual ", hard:"tough "}[j.difficulty] || ""}${pt.n} dynasty${j.rebuild ? " rebuild" : ""}${j.created_coach ? " with a created coach" : ""}`,
        ...(gd ? [`i play on ${gd}`] : []), ...(j.exclude || []).map(x => ({portal:"no transfers", nil:"no nil", five_stars:"no five stars"})[x]).filter(Boolean),
        ...(j.title_goal ? ["win a national title"] : []), ...keep].join(", ");
    }
    case "compare": return ts.length >= 2 ? `${ts[0].n} vs ${ts[1].n}` : null;
    case "players": return t ? `best ${pos || "players"} at ${t.n}` : `best ${pos || "players"}${conf || " in the country"}`;
    case "staff": return t ? `${t.n} coaching staff` : null;
    case "overview": return t ? `what do you think about ${t.n}` : null;
    case "ranking": return RANK[j.rank_by] ? `${RANK[j.rank_by]}${conf}${j.no_title_filter ? " with no national titles" : ""}` : null;
    case "beginner": return "i have never played dynasty";
    case "easiest_path": return `easiest path to a title${conf}`;
    case "challenges": return `give me a challenge${j.no_title_filter ? " with a team that has never won a title" : ""}`;
    case "roadmap": return t ? `${t.n} roster roadmap` : null;
  }
  return null;
}
// Chat memory (localStorage "coach-v1"): the transcript, current plan, undo history, last team and preferred difficulty.
const pSer = p => p && {...p, t:p.t.n};
const pDe = p => { const t = p && DATA.find(x => x.n === p.t); return t ? {...p, t, rules:(p.rules || []).filter(id => HR[id]), keep:(p.keep || []).filter(id => HR[id])} : null; };
function pSave(){
  try { localStorage.setItem("coach-v1", JSON.stringify({msgs:[...pLog.children].slice(-60).map(d => [d.classList.contains("me") ? "me" : "bot", d.innerHTML]),
    plan:pSer(P.plan), past:P.past.slice(-10).map(pSer), team:P.team && P.team.n, pref:P.pref})); } catch (e) {}
}
function pLoad(){
  try {
    const s = JSON.parse(localStorage.getItem("coach-v1") || "null"); if (!s) return false;
    pLog.innerHTML = ""; (s.msgs || []).forEach(([w, x]) => { const d = document.createElement("div"); d.className = "pm " + (w === "me" ? "me" : "bot"); d.innerHTML = x; pLog.append(d); });
    P.plan = pDe(s.plan); P.past = (s.past || []).map(pDe).filter(Boolean); P.team = DATA.find(t => t.n === s.team) || (P.plan && P.plan.t) || null;
    P.pref = ["cas", "std", "hard"].includes(s.pref) ? s.pref : null; pLog.scrollTop = pLog.scrollHeight; return true;
  } catch (e) { return false; }
}
function pClear(){
  Object.assign(P, {plan:null, past:[], team:null, pref:null, pending:null, facts:""});
  try { localStorage.removeItem("coach-v1"); } catch (e) {}
  pLog.innerHTML = ""; pSay("bot", PHELP);
}
function pToggle(on){
  $("#pChat").classList.toggle("on", on); document.body.classList.toggle("coach-on", on); $("#pOpen").setAttribute("aria-expanded", on);
  if (on) { if (!pLog.children.length) pSay("bot", PHELP); $("#pIn").focus({preventScroll:true}); } else $("#pOpen").focus();
}
pLoad();
$("#pClear").addEventListener("click", () => { pClear(); $("#pIn").focus(); });
$("#pOpen").addEventListener("click", () => pToggle(!$("#pChat").classList.contains("on")));

$("#pClose").addEventListener("click", () => pToggle(false));
$("#pChat").addEventListener("keydown", e => { if (e.key === "Escape") pToggle(false); });
const pGrow = () => { const i = $("#pIn"); i.style.height = "auto"; i.style.height = i.scrollHeight + 2 + "px"; };
$("#pIn").addEventListener("input", pGrow);
// Enter sends, Shift+Enter adds a line.
$("#pIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#pForm").requestSubmit(); } });
$("#pForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#pIn").value; $("#pIn").value = ""; pGrow(); pAsk(v); });
