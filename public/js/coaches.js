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
    <tr tabindex="0" data-n="${c.team}">
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
$("#crows").addEventListener("click", e => { const tr = e.target.closest("tr"); if (tr) openTeam(tr.dataset.n); });
$("#crows").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr"); if (!tr) return;
  e.preventDefault(); openTeam(tr.dataset.n);
});
cDraw();
