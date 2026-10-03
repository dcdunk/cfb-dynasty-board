// Player Database tab: every player on every roster (PLAYERS, flattened from DATA rosters), filterable and sortable.
/* ---- player database ---- */
// Roster rows in DATA are [name, pos, class ("SR*" = redshirt), overall, dev 0-3, speed, archetype index (parch)].
const PLAYERS = DATA.flatMap(t => t.r.map(p => ({name:p[0], pos:p[1], yr:p[2], ovr:p[3], dev:p[4], spd:p[5], arch:parch(p), team:t.n, conf:t.c})));
PLAYERS.forEach((p, i) => p.i = i);
const PLCOLS = [
  {k:"pos", t:"Pos", cls:"l"}, {k:"name", t:"Player", cls:"l"}, {k:"team", t:"School", cls:"l"}, {k:"conf", t:"Conf", cls:"l"},
  {k:"yr", t:"Yr", cls:"l"}, {k:"ovr", t:"Ovr", title:"Overall: EA's current ratings week when EA lists the player"}, {k:"spd", t:"Spd", title:"Speed: EA's current ratings week when EA lists the player"}];
const PLYR = ["FR", "SO", "JR", "SR"]; // class order for sorting by year (a trailing * is a redshirt)
const PLPAGE = 200; // rows drawn at a time; "Show more" adds another page
let plKey = "ovr", plDir = -1, plPos = "All", plQuery = "", plShown = PLPAGE;
$("#plpos").innerHTML = POSG.map(g => `<button class="chip" type="button" data-p="${g[0]}" aria-pressed="${g[0] === "All"}">${g[0] === "All" ? "All positions" : g[0]}</button>`).join("");
$("#plteam").innerHTML = `<option value="">All programs</option>` + DATA.map(t => t.n).sort((a, b) => a.localeCompare(b)).map(n => `<option>${esc(n)}</option>`).join("");
$("#plconf").innerHTML = `<option value="">All conferences</option>` + [...new Set(DATA.map(t => t.c))].sort().map(c => `<option>${esc(c)}</option>`).join("");
const plRedraw = () => { plShown = PLPAGE; plDraw(); };
$("#plpos").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return;
  plPos = b.dataset.p; [...$("#plpos").children].forEach(x => x.setAttribute("aria-pressed", x === b)); plRedraw(); });
$("#plq").addEventListener("input", e => { plQuery = norm(e.target.value.trim()); plRedraw(); });
for (const id of ["#plteam", "#plconf", "#plyr", "#pldev"]) $(id).addEventListener("change", plRedraw);
$("#plhrow").addEventListener("click", e => { const th = e.target.closest("th"); if (!th) return;
  const k = th.dataset.k; if (k === plKey) plDir *= -1; else { plKey = k; plDir = k === "ovr" || k === "spd" || k.startsWith("r:") ? -1 : 1; } plRedraw(); });
$("#plmore").addEventListener("click", () => { plShown += PLPAGE; plDraw(); });
function plList(){
  const grp = POSG.find(g => g[0] === plPos)[1], team = $("#plteam").value, conf = $("#plconf").value, yr = $("#plyr").value, dev = $("#pldev").value;
  return PLAYERS.filter(p => (!grp || grp.includes(p.pos)) && (!team || p.team === team) && (!conf || p.conf === conf) && (!yr || p.yr.startsWith(yr)) && (dev === "" || p.dev === +dev)
      && (!plQuery || norm(p.name).includes(plQuery) || norm(p.team).includes(plQuery)))
    .sort((a, b) => { const v = p => plKey === "yr" ? PLYR.indexOf(p.yr.slice(0, 2)) : plKey.startsWith("r:") ? plStat(p, plKey.slice(2)) ?? -1 : p[plKey];
      const x = v(a), y = v(b), d = typeof x === "string" ? x.localeCompare(y) : x - y;
      return d * plDir || b.ovr - a.ovr || a.name.localeCompare(b.name); });
}
// Player Database filters in the URL (#players/pos=QB&team=Georgia&yr=JR), so a refresh keeps them.
TSUB.play = () => hashQ({pos: plPos === "All" ? "" : plPos, team: $("#plteam").value, conf: $("#plconf").value, yr: $("#plyr").value, dev: $("#pldev").value, q: $("#plq").value.trim()});
function plFromHash(sub){
  const q = new URLSearchParams(sub), pos = q.get("pos");
  if (POSG.some(g => g[0] === pos)) { plPos = pos; [...$("#plpos").children].forEach(x => x.setAttribute("aria-pressed", x.dataset.p === pos)); }
  for (const [k, id] of [["team", "#plteam"], ["conf", "#plconf"], ["yr", "#plyr"], ["dev", "#pldev"]]) { const v = q.get(k); if (v != null && [...$(id).options].some(o => o.value === v)) $(id).value = v; }
  if (q.get("q")) { $("#plq").value = q.get("q"); plQuery = norm(q.get("q")); }
}
function plDraw(){
  if (curTab === "play") tabHash();
  const list = plList();
  [...$("#plhrow").children].forEach(th => { const on = th.dataset.k === plKey;
    if (on) th.setAttribute("aria-sort", plDir > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort");
    th.querySelector(".car").textContent = on ? (plDir > 0 ? "▲" : "▼") : ""; });
  $("#plrows").innerHTML = list.slice(0, plShown).map(p => `
    <tr tabindex="0" data-n="${esc(p.team)}" data-i="${p.i}">
      <td class="l role">${p.pos}</td>
      <td class="l"><span class="team">${hl(p.name, plQuery)}</span>${p.dev ? `<span class="dev d${p.dev}">${DEVN[p.dev]}</span>` : ""}${p.arch ? `<span class="parch">${esc(p.arch)}</span>` : ""}</td>
      <td class="l sub">${hl(p.team, plQuery)}</td>
      <td class="l mut">${esc(p.conf)}</td>
      <td class="l yr">${p.yr}</td>
      <td class="mono big">${p.ovr}</td>
      <td class="mono">${p.spd}</td>${plCells(p)}
    </tr>`).join("");
  $("#plempty").hidden = list.length > 0;
  $("#plN").textContent = fmt(list.length);
  const left = list.length - plShown;
  $("#plmore").hidden = left <= 0; $("#plmore").textContent = `Show ${fmt(Math.min(left, PLPAGE))} more of ${fmt(left)}`;
}
// Global search and other tabs land here with a name in the search box and every other filter cleared.
function plOpen(q){
  plPos = "All"; [...$("#plpos").children].forEach(x => x.setAttribute("aria-pressed", x.dataset.p === "All"));
  for (const id of ["#plteam", "#plconf", "#plyr", "#pldev"]) $(id).value = "";
  $("#plq").value = q; plQuery = norm(q); plShown = PLPAGE; showTab("play"); plDraw();
}
$("#plrows").addEventListener("click", e => { const tr = e.target.closest("tr"); if (tr) plCard(+tr.dataset.i); });
$("#plrows").addEventListener("keydown", e => { if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr"); if (!tr) return; e.preventDefault(); plCard(+tr.dataset.i); });

/* ---- extended ratings (EA SPORTS, js/data/ratings.js): loaded on first need, then a player card and a rating column ---- */
// Groups for the card; every key in RATINGS.k appears exactly once (check.mjs verifies). A position's own group shows first.
const PLGRP = [
  ["Physical", ["speed","acceleration","agility","changeOfDirection","strength","jumping","stamina","toughness","injury","awareness"]],
  ["Ball carrier", ["carrying","bCVision","breakTackle","trucking","stiffArm","jukeMove","spinMove","kickReturn"]],
  ["Receiving", ["catching","catchInTraffic","spectacularCatch","release","shortRouteRunning","mediumRouteRunning","deepRouteRunning"]],
  ["Passing", ["throwPower","throwAccuracyShort","throwAccuracyMid","throwAccuracyDeep","throwOnTheRun","throwUnderPressure","playAction","breakSack"]],
  ["Blocking", ["passBlock","passBlockPower","passBlockFinesse","runBlock","runBlockPower","runBlockFinesse","leadBlock","impactBlocking"]],
  ["Defense", ["tackle","hitPower","pursuit","playRecognition","manCoverage","zoneCoverage","press","blockShedding","powerMoves","finesseMoves"]],
  ["Kicking", ["kickPower","kickAccuracy"]]];
const PLFIRST = {QB:"Passing", HB:"Ball carrier", FB:"Ball carrier", WR:"Receiving", TE:"Receiving", LT:"Blocking", LG:"Blocking", C:"Blocking", RG:"Blocking", RT:"Blocking",
  LEDG:"Defense", REDG:"Defense", DT:"Defense", SAM:"Defense", MIKE:"Defense", WILL:"Defense", CB:"Defense", FS:"Defense", SS:"Defense", K:"Kicking", P:"Kicking"};
const PLLBL = {bCVision:"Ball carrier vision", changeOfDirection:"Change of direction", catchInTraffic:"Catch in traffic", throwAccuracyShort:"Short accuracy",
  throwAccuracyMid:"Medium accuracy", throwAccuracyDeep:"Deep accuracy", throwOnTheRun:"Throw on the run", throwUnderPressure:"Throw under pressure",
  shortRouteRunning:"Short routes", mediumRouteRunning:"Medium routes", deepRouteRunning:"Deep routes", jukeMove:"Juke", spinMove:"Spin", injury:"Injury resistance"};
const plLbl = k => PLLBL[k] || (k[0].toUpperCase() + k.slice(1).replace(/[A-Z]/g, c => " " + c.toLowerCase()));
// Table columns after Spd: every rating in PLGRP order except speed (it already has its own column). Short labels as in the game.
const PLABR = {acceleration:"ACC", agility:"AGI", changeOfDirection:"COD", strength:"STR", jumping:"JMP", stamina:"STA", toughness:"TGH", injury:"INJ", awareness:"AWR",
  carrying:"CAR", bCVision:"BCV", breakTackle:"BTK", trucking:"TRK", stiffArm:"SFA", jukeMove:"JKM", spinMove:"SPM", kickReturn:"KR",
  catching:"CTH", catchInTraffic:"CIT", spectacularCatch:"SPC", release:"RLS", shortRouteRunning:"SRR", mediumRouteRunning:"MRR", deepRouteRunning:"DRR",
  throwPower:"THP", throwAccuracyShort:"SAC", throwAccuracyMid:"MAC", throwAccuracyDeep:"DAC", throwOnTheRun:"RUN", throwUnderPressure:"TUP", playAction:"PAC", breakSack:"BSK",
  passBlock:"PBK", passBlockPower:"PBP", passBlockFinesse:"PBF", runBlock:"RBK", runBlockPower:"RBP", runBlockFinesse:"RBF", leadBlock:"LBK", impactBlocking:"IBL",
  tackle:"TAK", hitPower:"POW", pursuit:"PUR", playRecognition:"PRC", manCoverage:"MCV", zoneCoverage:"ZCV", press:"PRS", blockShedding:"BSH", powerMoves:"PMV", finesseMoves:"FMV",
  kickPower:"KPW", kickAccuracy:"KAC"};
const PLRCOLS = PLGRP.flatMap(([g, ks]) => ks.filter(k => k !== "speed").map((k, j) => ({k, g, first:!j})));
// Rating cells for one row; "–" for players EA doesn't list (and before the ratings file has loaded).
function plCells(p){
  if (typeof RATINGS !== "object") return "";
  const r = plRow(p); return PLRCOLS.map(c => `<td class="mono rt${c.first ? " gs0" : ""}">${r ? plStat(p, c.k) : "–"}</td>`).join("");
}
let plRatP = null;
// Loads js/data/ratings.js once (~800 KB compressed). Resolves to RATINGS, or null if it couldn't load.
function plRatings(){
  return plRatP ||= new Promise(r => { if (typeof RATINGS === "object") return r(RATINGS);
    const s = document.createElement("script"); s.src = "js/data/ratings.js";
    s.onload = () => { $("#plIt").textContent = RATINGS.it; plUseEaOvr(); r(RATINGS); }; s.onerror = () => { plRatP = null; r(null); }; document.head.append(s); });
}
// [ovr, height, weight, jersey, hometown, ratings string] for a PLAYERS row, or undefined if EA doesn't list them.
const plRow = p => typeof RATINGS === "object" ? RATINGS.p[p.team]?.[p.name] : undefined;
function plStat(p, k){ const r = plRow(p), i = RATINGS.k.indexOf(k); return r && i >= 0 ? +r[5].substr(i * 2, 2) : null; }
async function plCard(i){
  const p = PLAYERS[i]; if (!p) return;
  $("#plcN").innerHTML = `${esc(p.name)}${p.dev ? ` <span class="dev d${p.dev}">${DEVN[p.dev]}</span>` : ""}`;
  $("#plcB").innerHTML = `<p class="plc-none">Loading ratings…</p>`; if (!$("#plc").open) $("#plc").showModal(); $("#plcX").focus();
  const R = await plRatings(), r = R && plRow(p), ht = r && r[1] ? `${Math.floor(r[1] / 12)}′${r[1] % 12}″` : "";
  const top = `<p class="plc-sub">${p.pos} · ${esc(p.team)} · ${esc(p.conf)} · ${p.yr}${p.arch ? ` · <button type="button" class="plc-arch" data-parch="${esc(p.arch)}" data-ppos="${p.pos}" title="See this archetype's abilities">${esc(p.arch)}</button>` : ""}</p><div class="plc-top">
    <div><b>${r ? r[0] : p.ovr}</b><span>Overall${r ? ` (${esc(R.it)})` : ""}</span></div><div><b>${p.spd}</b><span>Speed</span></div>
    ${r ? `<div><b>${ht}</b><span>Height</span></div><div><b>${r[2]}</b><span>Weight</span></div><div><b>#${r[3]}</b><span>Jersey</span></div>` : ""}
    <button class="ghost plc-go" type="button" data-team="${esc(p.team)}">Open ${esc(p.team)}</button></div>${r && r[4] ? `<p class="plc-sub" style="margin-top:10px">From ${esc(r[4])}</p>` : ""}`;
  if (!R) { $("#plcB").innerHTML = top + `<p class="plc-none">Couldn't load the extended ratings. Check your connection and try again.</p>`; return; }
  if (!r) { $("#plcB").innerHTML = top + `<p class="plc-none">EA doesn't list extended ratings for this player.</p>`; return; }
  const groups = [...PLGRP].sort((a, b) => (b[0] === PLFIRST[p.pos]) - (a[0] === PLFIRST[p.pos]));
  $("#plcB").innerHTML = top + `<div class="plc-g">${groups.map(([g, ks]) => `<h3>${g}</h3>` + ks.map(k => { const v = plStat(p, k);
    return `<div class="plc-r"><span>${plLbl(k)}</span><b>${v}</b><i style="--v:${v}%"></i></div>`; }).join("")).join("")}</div>`;
}
$("#plcB").addEventListener("click", e => { const b = e.target.closest("[data-team]"); if (b) { $("#plc").close(); openTeam(b.dataset.team); } });
$("#plcB").addEventListener("click", e => { const b = e.target.closest("[data-parch]"); if (b) { $("#plc").close(); abOpenArch(b.dataset.ppos, b.dataset.parch); } });
$("#plcX").addEventListener("click", () => $("#plc").close());
// A roster row in the team dossier opens that player's card on top of it.
const plFromDossier = tr => { const p = PLAYERS.find(x => x.team === picked && x.name === tr.dataset.pl); if (p) plCard(p.i); };
$("#dbody").addEventListener("click", e => { const tr = e.target.closest("tr[data-pl]"); if (tr) plFromDossier(tr); });
$("#dbody").addEventListener("keydown", e => { const tr = e.target.closest("tr[data-pl]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); plFromDossier(tr); } });
$("#plc").addEventListener("click", e => { if (e.target === $("#plc")) $("#plc").close(); });
$("#plc").addEventListener("keydown", e => { if (e.key === "Escape") e.stopPropagation(); });
function plHead(){
  $("#plhrow").innerHTML = PLCOLS.map(c => `<th class="${c.cls || ""}" data-k="${c.k}" scope="col"${c.title ? ` title="${c.title}"` : ""}>${c.t}<span class="car"></span></th>`).join("")
    + (typeof RATINGS === "object" ? PLRCOLS.map(c => `<th class="${c.first ? "gs0" : ""}" data-k="r:${c.k}" scope="col" title="${c.g}: ${plLbl(c.k)}">${PLABR[c.k]}<span class="car"></span></th>`).join("") : "");
}
// The rating columns need js/data/ratings.js, so it loads when this tab is opened (never for other tabs). showTab calls this.
// The ratings may already be loaded by a player card opened from a team dossier, so check the header, not RATINGS.
function plShow(){ if (!$("#plhrow [data-k^='r:']")) plRatings().then(R => { if (R) { plHead(); plDraw(); } }); }
// Once EA's ratings are in, the table's Ovr and Spd are EA's current week; players EA doesn't list keep the roster values (p.ovr0, p.spd0).
function plUseEaOvr(){ for (const p of PLAYERS) { const r = plRow(p); if (p.ovr0 == null) { p.ovr0 = p.ovr; p.spd0 = p.spd; }
  p.ovr = r ? r[0] : p.ovr0; p.spd = r ? plStat(p, "speed") : p.spd0; } }
plHead();
plDraw();
