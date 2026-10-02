// Coach Database tab: COACHES (flattened from DATA staff) and the sortable staff table.
/* ---- coach database ---- */
const COACHES = DATA.flatMap(t => (t.st || []).map(c =>
  ({role:c[0], name:c[1], lvl:c[2], gr:c[3], arch:c[4], pipe:c[5], gen:c[7], team:t.n})));
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
function cDraw(){
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
   Level and grade with the coach's rank among coaches in the same role, pipeline, the archetype's perk and abilities (CARCH),
   and the rest of that school's staff. ---- */
// The roster data calls the Tactician base archetype "Schemer" (it has Recruiter and Motivator, every elite incl. Scheme Guru, but never Tactician).
const CALIAS = {Schemer:"Tactician"};
const CROLE = {HC:"Head coach", OC:"Offensive coordinator", DC:"Defensive coordinator"};
// Archetypes a coach must already own: elites and hybrids name them in their unlock ("spend 200 CP in Tactician",
// "in both Tactician and Motivator"); Program Builder and CEO say "any archetype", so they add none.
const ccBase = a => CARCH.filter(b => b !== a && new RegExp(`\\bin (both )?([A-Za-z ]+ and )?${b.n}\\b`).test(a.u));
const ccArch = (a, listed) => `<h3 class="cc-h">${abImg("a", a.n)}${esc(a.n)} <span>${esc(a.g)} archetype${listed && listed !== a.n ? `, listed as ${esc(listed)}` : ""}</span></h3>`
  + `${a.perk ? `<p class="cc-p"><b>Perk</b> ${esc(a.perk)}</p>` : ""}<p class="cc-p"><b>Unlock</b> ${esc(a.u)}</p>`
  + a.br.map(([b, ab]) => `<h4 class="cc-b">${esc(b)}</h4><ul class="cc-l">${ab.map(([n, d]) => `<li><b>${esc(n)}</b> ${esc(d)}</li>`).join("")}</ul>`).join("")
  + `<button class="ghost cc-more" type="button" data-arch="${esc(a.n)}">Costs and icons in Abilities</button>`;
function ccCard(team, name){
  const c = COACHES.find(x => x.team === team && x.name === name); if (!c) return;
  const same = COACHES.filter(x => x.role === c.role), rk = 1 + same.filter(x => x.lvl > c.lvl).length;
  const a = CARCH.find(x => x.n === (CALIAS[c.arch] || c.arch)), conf = DATA.find(t => t.n === team).c;
  $("#plcN").innerHTML = `${esc(c.name)}${c.gen ? ` <span class="dev d1">Generic</span>` : ""}`;
  $("#plcB").innerHTML = `<p class="plc-sub">${CROLE[c.role]} · ${esc(team)} · ${esc(conf)}</p>
    <div class="plc-top"><div><b>${c.lvl}</b><span>Level</span></div><div><b>${c.gr}</b><span>Grade</span></div>
    <div><b>#${rk}</b><span>of ${same.length} ${CROLE[c.role].toLowerCase()}s by level</span></div>
    <button class="ghost plc-go" type="button" data-team="${esc(team)}">Open ${esc(team)}</button></div>
    <p class="plc-sub" style="margin-top:10px">Pipeline: ${esc(c.pipe)}</p>
    ${a ? ccArch(a, c.arch) : `<h3 class="cc-h">${esc(c.arch)}</h3><p class="plc-none">The site doesn't have ability details for the ${esc(c.arch)} archetype yet.</p>`}
    ${a ? ccBase(a).map(b => `<details class="cc-inc"><summary>Also has ${esc(b.n)} <span>required to unlock ${esc(a.n)}</span></summary>${ccArch(b)}</details>`).join("") : ""}
    <h3 class="cc-h">${esc(team)} staff</h3>${COACHES.filter(x => x.team === team).map(x =>
      `<button type="button" class="cc-st${x === c ? " on" : ""}" data-coach="${esc(x.name)}" data-n="${esc(team)}"><span class="mono">${x.role}</span><b>${esc(x.name)}</b><span>${esc(x.arch)}</span><span class="mono">${x.lvl}</span></button>`).join("")}`;
  if (!$("#plc").open) $("#plc").showModal(); $("#plc").scrollTop = 0; $("#plcX").focus();
}
$("#plcB").addEventListener("click", e => {
  const s = e.target.closest("[data-coach]"); if (s) return ccCard(s.dataset.n, s.dataset.coach);
  const a = e.target.closest("[data-arch]"); if (!a) return;
  $("#plc").close(); if (picked) closeTeam();
  abM = "coach"; abC = CGROUP.find(g => g[1].includes(a.dataset.arch))[0]; $("#abQ").value = ""; showTab("ab"); abDraw(); scrollTo({top: 0});
});
$("#dbody").addEventListener("click", e => { const tr = e.target.closest("tr[data-coach]"); if (tr) ccCard(picked, tr.dataset.coach); });
$("#dbody").addEventListener("keydown", e => { const tr = e.target.closest("tr[data-coach]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ccCard(picked, tr.dataset.coach); } });
