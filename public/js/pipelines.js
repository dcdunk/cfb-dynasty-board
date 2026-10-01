// Program Pipelines tab: recruiting pipeline map per team, plus hMap() region maps used elsewhere.
/* ---- program pipelines ---- */
const TIERN = ["Unrecognized","Niche interest","Respected","Popular","Household name","Cultural pillar"];
const PIPES = [...new Set(DATA.flatMap(t => t.pl.map(p => p[0])))].sort();
const PORDER = DATA.map(t => t.n).sort((a, b) => a.localeCompare(b));
let pTeam = "UCLA", pPipe = "";
(function buildMap(){
  // Split states (CA, TX, FL, GA) clip their region polygons to the state outline. The clipPaths sit in one <defs>
  // at the top of the svg rather than inline next to what they clip: an inline clipPath has been seen to render
  // unclipped (Texas regions drawn as rectangles), and defs-first is the layout browsers handle most reliably.
  let defs = "";
  const shapes = Object.entries(MAP.states).map(([s, d]) => {
    const split = Object.entries(MAP.split).filter(([, v]) => v.s === s);
    let out = `<path id="st-${s}" class="st" d="${d}"/>`;
    if (split.length) defs += `<clipPath id="cp-${s}"><path d="${d}"/></clipPath>`;
    if (split.length) out += `<g clip-path="url(#cp-${s})">` +
      split.map(([p, v]) => `<polygon class="sub" data-reg="${p}" points="${v.pts.map(q => q.join(",")).join(" ")}"/>`).join("") + `</g>`;
    return out;
  }).join("");
  const labels = Object.entries(MAP.lab).map(([p, [x, y]]) => {
    const w = p.length * 5.6 + 12;
    return `<g class="lbl" data-lab="${p}" hidden><rect x="${(x - w / 2).toFixed(1)}" y="${y - 8}" width="${w.toFixed(1)}" height="16" rx="2"/><text x="${x}" y="${y + 3.5}" text-anchor="middle">${p}</text></g>`;
  }).join("");
  $("#pmap").innerHTML = `<svg viewBox="0 0 959 593" role="img" aria-label="Map of pipeline regions"><defs>${defs}</defs><g id="pshapes">${shapes}</g><g class="bd">${MAP.borders}</g><g id="plabels">${labels}</g></svg>`;
  $("#ppipe").innerHTML += PIPES.map(p => `<option value="${p}">${p}</option>`).join("");
  $("#ptiers").innerHTML = [5,4,3,2,1,0].map(i => `<div><i style="background:var(--t${i})"></i>Tier ${i} &middot; ${TIERN[i]}</div>`).join("") +
    `<div><i style="background:var(--pip-off);opacity:.55"></i>No pipeline</div>`;
})();
function paintMap(tiers, hi){
  const svg = $("#pmap svg");
  svg.querySelectorAll("[data-tier]").forEach(e => e.removeAttribute("data-tier"));
  svg.querySelectorAll(".hi").forEach(e => e.classList.remove("hi"));
  svg.querySelectorAll(".lbl").forEach(e => e.setAttribute("hidden", ""));
  for (const [p, tier] of Object.entries(tiers)) {
    const els = MAP.split[p] ? [...svg.querySelectorAll(`[data-reg="${p}"]`)] : (MAP.reg[p] || []).map(s => svg.querySelector(`#st-${s}`));
    els.forEach(e => { if (!e) return; e.setAttribute("data-tier", tier); if (p === hi) e.classList.add("hi"); });
    const l = svg.querySelector(`[data-lab="${p}"]`); if (l) l.removeAttribute("hidden");
  }
}
function pDraw(){
  const t = DATA.find(x => x.n === pTeam);
  const tiers = {}; t.pl.forEach(p => tiers[p[0]] = p[1]);
  paintMap(tiers, pPipe);
  const rows = t.pl.map(p => `<tr data-p="${p[0]}" class="${p[0] === pPipe ? "hi" : ""}"><td><i style="background:var(--t${p[1]})"></i>${p[0]}</td><td class="r">${TIERN[p[1]]}</td><td class="r">${p[2]}</td></tr>`).join("");
  $("#pcard").innerHTML = `<h2 class="pname">${t.n}</h2><div class="psub"><b>${t.nk}</b> &nbsp;&middot;&nbsp; ${t.c} &nbsp;&middot;&nbsp; ${t.pl.filter(p => p[1] > 0).length} active pipelines</div>
    <h3>Pipelines by influence</h3><table class="plist">${rows}</table>`;
  const rk = $("#prank");
  if (pPipe) {
    const list = DATA.map(x => ({n:x.n, p:x.pl.find(q => q[0] === pPipe)})).filter(x => x.p && x.p[1] > 0).sort((a, b) => b.p[2] - a.p[2]);
    rk.innerHTML = `<h3>${pPipe} &mdash; ${list.length} programs</h3><div class="scrollbox"><table class="plist">` + list.map((x, i) =>
      `<tr data-n="${x.n}" class="${x.n === pTeam ? "hi" : ""}"><td class="r" style="width:26px">${i + 1}</td><td><i style="background:var(--t${x.p[1]})"></i>${x.n}</td><td class="r">${x.p[2]}</td></tr>`).join("") + `</table></div>`;
    rk.hidden = false;
    const cur = rk.querySelector("tr.hi"); if (cur) cur.scrollIntoView({block:"nearest"});
  } else { rk.hidden = true; rk.innerHTML = ""; }
}
function pSet(n){ if (!DATA.some(t => t.n === n)) return; pTeam = n; $("#pq").value = n; pDraw(); }
combo($("#pq"), pSet, () => pTeam);
$("#pprev").addEventListener("click", () => pSet(PORDER[(PORDER.indexOf(pTeam) + PORDER.length - 1) % PORDER.length]));
$("#pnext").addEventListener("click", () => pSet(PORDER[(PORDER.indexOf(pTeam) + 1) % PORDER.length]));
$("#ppipe").addEventListener("change", e => { pPipe = e.target.value; pDraw(); });
$("#prank").addEventListener("click", e => { const r = e.target.closest("tr[data-n]"); if (r) pSet(r.dataset.n); });
$("#pcard").addEventListener("click", e => {
  const p = e.target.closest("tr[data-p]"); if (p) { pPipe = pPipe === p.dataset.p ? "" : p.dataset.p; $("#ppipe").value = pPipe; pDraw(); }
});
$("#pmap").addEventListener("click", e => {
  const el = e.target.closest("[data-reg],.st"); if (!el) return;
  const p = el.dataset.reg || Object.keys(MAP.reg).find(k => MAP.reg[k].includes(el.id.slice(3)));
  if (!p) return; pPipe = pPipe === p ? "" : p; $("#ppipe").value = pPipe; pDraw();
});
$("#pq").value = pTeam; pDraw();
