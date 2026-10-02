// Coach Database tab: COACHES (flattened from DATA staff) and the sortable staff table.
/* ---- coach database ---- */
const COACHES = DATA.flatMap(t => (t.st || []).map(c =>
  ({role:c[0], name:c[1], lvl:c[2], gr:c[3], arch:c[4], pipe:c[5], age:c[6], gen:c[7], team:t.n})));
const ROLEORD = {HC:0, OC:1, DC:2};
const CCOLS = [
  {k:"role", t:"Role", cls:"l"}, {k:"name", t:"Coach", cls:"l"}, {k:"team", t:"School", cls:"l"},
  {k:"lvl", t:"Level"}, {k:"gr", t:"Grade"}, {k:"arch", t:"Archetype", cls:"l"}, {k:"pipe", t:"Pipeline", cls:"l"}
];
let cKey = "lvl", cDir = -1, cRole = "All", cQuery = "";
const cVal = (c, k) => k === "gr" ? (GVAL[c.gr] ?? -1) : k === "role" ? ROLEORD[c.role] : c[k];
$("#cchips").innerHTML = ["All","HC","OC","DC"].map(r =>
  `<button class="chip" type="button" data-r="${r}" aria-pressed="${r === "All"}">${r === "All" ? "All roles" : r}</button>`).join("");
$("#cchips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  cRole = b.dataset.r;
  [...$("#cchips").children].forEach(x => x.setAttribute("aria-pressed", x === b));
  cDraw();
});
$("#cq").addEventListener("input", e => { cQuery = norm(e.target.value.trim()); cDraw(); });
$("#chrow").innerHTML = CCOLS.map(c =>
  `<th class="${c.cls || ""}" data-k="${c.k}" scope="col">${c.t}<span class="car"></span></th>`).join("");
$("#chrow").addEventListener("click", e => {
  const th = e.target.closest("th"); if (!th) return;
  const k = th.dataset.k;
  if (k === cKey) cDir *= -1;
  else { cKey = k; cDir = (k === "lvl" || k === "gr") ? -1 : 1; }
  cDraw();
});
// Coach Database filters in the URL (#coaches/role=HC&q=smart).
TSUB.coach = () => hashQ({role: cRole === "All" ? "" : cRole, q: $("#cq").value.trim()});
function cFromHash(sub){
  const q = new URLSearchParams(sub), r = q.get("role");
  if (["HC", "OC", "DC"].includes(r)) { cRole = r; [...$("#cchips").children].forEach(x => x.setAttribute("aria-pressed", x.dataset.r === r)); }
  if (q.get("q")) { $("#cq").value = q.get("q"); cQuery = norm(q.get("q")); }
}
function cDraw(){
  if (curTab === "coach") tabHash();
  const list = COACHES.filter(c => (cRole === "All" || c.role === cRole) && (!cQuery || norm(c.name).includes(cQuery) || norm(c.team).includes(cQuery)))
    .sort((a, b) => {
      const x = cVal(a, cKey), y = cVal(b, cKey);
      const d = typeof x === "string" ? x.localeCompare(y) : x - y;
      return d * cDir || b.lvl - a.lvl || a.name.localeCompare(b.name);
    });
  [...$("#chrow").children].forEach(th => {
    const on = th.dataset.k === cKey;
    if (on) th.setAttribute("aria-sort", cDir > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort");
    th.querySelector(".car").textContent = on ? (cDir > 0 ? "▲" : "▼") : "";
  });
  $("#crows").innerHTML = list.map(c => `
    <tr tabindex="0" data-n="${c.team}" data-c="${esc(c.name)}">
      <td class="l role">${c.role}</td>
      <td class="l"><span class="team">${hl(c.name, cQuery)}</span>${c.gen ? `<span class="dev d1">Generic</span>` : ""}</td>
      <td class="l sub">${hl(c.team, cQuery)}</td>
      <td class="mono big">${c.lvl}</td>
      <td class="mono">${c.gr}</td>
      <td class="l mut">${c.arch}</td>
      <td class="l mut">${c.pipe}</td>
    </tr>`).join("");
  $("#cempty").hidden = list.length > 0;
  $("#cN").textContent = list.length;
}
$("#crows").addEventListener("click", e => { const tr = e.target.closest("tr"); if (tr) ccCard(tr.dataset.n, tr.dataset.c); });
$("#crows").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr"); if (!tr) return;
  e.preventDefault(); ccCard(tr.dataset.n, tr.dataset.c);
});
cDraw();

/* ---- coach card: tapping a coach (Coach Database, the dossier's staff, search) opens this in the player card sheet (#plc).
   Level, grade, age, rank among coaches in the same role, pipeline, specialty, and every ability the coach has bought,
   by archetype, from js/data/coaches.js (CTREE: TeamCrafters roster data, built by tools/coach-trees.mjs), loaded on the
   first card like ratings.js. If that file can't load, the card falls back to what the main archetype can unlock (CARCH). ---- */
const CROLE = {HC:"Head coach", OC:"Offensive coordinator", DC:"Defensive coordinator"};
let ccP;
const ccTree = () => ccP ||= new Promise(r => { if (typeof CTREE === "object") return r(CTREE);
  const s = document.createElement("script"); s.src = "js/data/coaches.js";
  s.onload = () => r(CTREE); s.onerror = () => { ccP = null; r(null); }; document.head.append(s); });
// "Advanced Look - DB" -> ["Advanced Look", "DB"]; the game buys position-group abilities once per group.
const ccPos = n => { const m = n.trim().match(/^(.*?)\s*-\s*([A-Z/]+)$/); return m ? [m[1], m[2]] : [n.trim(), ""]; };
const ccRow = (n, d, pos) => `<li>${abImg("c", n) || '<span class="ab-slot"></span>'}<div class="ab-tx"><b class="ab-nm">${esc(n)}</b>${pos.length ? `<span class="cc-pos">${pos.map(p => `<i>${esc(p)}</i>`).join("")}</span>` : ""}<span class="ab-ds">${esc(d)}</span></div></li>`;
// One owned archetype: its perk (the "Core" ability), then each ability once with the position groups it was bought for.
function ccOwned(arch, ids, T, open){
  const a = CARCH.find(x => x.n === arch), g = new Map(); let perk = "";
  for (const i of ids) { const [nm, d, core] = T.a[i]; if (core) { perk = `${nm}: ${d}`; continue; }
    const [base, pos] = ccPos(nm), k = base.toLowerCase(), cur = g.get(k) || g.set(k, [base, a?.br.flatMap(b => b[1]).find(x => x[0].toLowerCase() === k)?.[1] || d, []]).get(k);
    if (pos) cur[2].push(pos); }
  // The main archetype stays open; the others start collapsed so a 70-ability head coach isn't one endless scroll.
  return `<details class="cc-arch"${open ? " open" : ""}><summary class="cc-h">${abImg("a", arch)}${esc(arch)} <span>${a ? esc(a.g) + " · " : ""}${ids.length} abilit${ids.length === 1 ? "y" : "ies"}</span></summary>`
    + (perk ? `<p class="cc-p"><b>Perk</b> ${esc(perk)}</p>` : "")
    + `<ul class="ab-list ab-clist cc-own">${[...g.values()].map(([n, d, pos]) => ccRow(n, d, pos)).join("")}</ul></details>`;
}
async function ccCard(team, name){
  const c = COACHES.find(x => x.team === team && x.name === name); if (!c) return;
  const same = COACHES.filter(x => x.role === c.role), rk = 1 + same.filter(x => x.lvl > c.lvl).length, conf = DATA.find(t => t.n === team).c;
  const staff = `<h3 class="cc-h">${esc(team)} staff</h3>${COACHES.filter(x => x.team === team).map(x =>
    `<button type="button" class="cc-st${x === c ? " on" : ""}" data-coach="${esc(x.name)}" data-n="${esc(team)}"><span class="mono">${x.role}</span><b>${esc(x.name)}</b><span>${esc(x.arch)}</span><span class="mono">${x.lvl}</span></button>`).join("")}`;
  const top = (T, sp) => `<p class="plc-sub">${CROLE[c.role]} · ${esc(team)} · ${esc(conf)}</p>
    <div class="plc-top"><div><b>${c.lvl}</b><span>Level</span></div><div><b>${c.gr}</b><span>Grade</span></div><div><b>${c.age}</b><span>Age</span></div>
    <div><b>#${rk}</b><span>of ${same.length} ${CROLE[c.role].toLowerCase().replace(/h$/, "he")}s by level</span></div>
    <button class="ghost plc-go" type="button" data-team="${esc(team)}">Open ${esc(team)}</button></div>
    <p class="plc-sub" style="margin-top:10px">Pipeline: ${esc(c.pipe)}${sp ? ` · Specialty: ${esc(sp)}` : ""}</p>`;
  $("#plcN").innerHTML = `${esc(c.name)}${c.gen ? ` <span class="dev d1">Generic</span>` : ""}`;
  $("#plcB").innerHTML = top() + `<p class="plc-none">Loading abilities…</p>` + staff;
  if (!$("#plc").open) $("#plc").showModal(); $("#plc").scrollTop = 0; $("#plcX").focus();
  ccCard.at = team + "|" + name;
  const T = await ccTree(); if (ccCard.at !== team + "|" + name) return;   // another coach was opened meanwhile
  const own = T?.c[team + "|" + name];
  if (own) {
    // Main archetype first (open), then the rest in the Abilities tab's order, which keeps each base next to its elite
    // (Recruiter, Elite Recruiter, Motivator, Master Motivator, Tactician, Scheme Guru, then hybrids and leadership).
    const ORD = CGROUP.flatMap(g => g[1]), archs = Object.keys(own[1]).sort((x, y) => (y === c.arch) - (x === c.arch) || ORD.indexOf(x) - ORD.indexOf(y));
    $("#plcB").innerHTML = top(T, own[0]) + `<h3 class="cc-h cc-sum">Abilities <span>${Object.values(own[1]).flat().length} bought, across ${archs.length} archetype${archs.length > 1 ? "s" : ""} · ${esc(T.v)} roster</span></h3>`
      + archs.map((x, i) => ccOwned(x, own[1][x], T, !i)).join("") + `<button class="ghost cc-more" type="button" data-arch="${esc(c.arch)}">Costs and tiers in Abilities</button>` + staff;
    return;
  }
  const a = CARCH.find(x => x.n === c.arch);
  $("#plcB").innerHTML = top() + (a ? `<h3 class="cc-h">${abImg("a", a.n)}What a ${esc(a.n)} can unlock</h3><p class="plc-none">Couldn't load this coach's abilities, so this is the full ${esc(a.n)} list.</p>`
    + `<ul class="ab-list ab-clist cc-own">${a.br.flatMap(b => b[1]).map(([n, d]) => ccRow(n, d, [])).join("")}</ul>` : "") + staff;
}
$("#plcB").addEventListener("click", e => {
  const s = e.target.closest("[data-coach]"); if (s) return ccCard(s.dataset.n, s.dataset.coach);
  const a = e.target.closest("[data-arch]"); if (!a) return;
  $("#plc").close(); if (picked) closeTeam();
  abM = "coach"; abC = CGROUP.find(g => g[1].includes(a.dataset.arch))[0]; $("#abQ").value = ""; showTab("ab"); abDraw(); scrollTo({top: 0});
});
$("#dbody").addEventListener("click", e => { const tr = e.target.closest("tr[data-coach]"); if (tr) ccCard(picked, tr.dataset.coach); });
$("#dbody").addEventListener("keydown", e => { const tr = e.target.closest("tr[data-coach]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ccCard(picked, tr.dataset.coach); } });
