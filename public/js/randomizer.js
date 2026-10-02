// Randomizer tab: filtered random team roll.
/* ---- randomizer ---- */
const RG = {
  ti: [["Has a title", t => t.ti > 0], ["No titles yet", t => t.ti === 0]],
  p:  [["Elite 4.5–5★", t => t.p >= 4.5], ["Strong 3.5–4★", t => t.p >= 3.5 && t.p < 4.5],
       ["Mid 2.5–3★", t => t.p >= 2.5 && t.p < 3.5], ["Low 1.5–2★", t => t.p >= 1.5 && t.p < 2.5],
       ["Rebuild 0–1★", t => t.p < 1.5]],
  nt: [["8,000+", t => t.nt >= 8000], ["4,000–7,999", t => t.nt >= 4000 && t.nt < 8000],
       ["1,500–3,999", t => t.nt >= 1500 && t.nt < 4000], ["Under 1,500", t => t.nt < 1500]],
  c:  [...new Set(DATA.map(t => t.c))].sort().map(c => [c, t => t.c === c])
};
const rSel = {ti:new Set(), p:new Set(), nt:new Set(), c:new Set()};
let rMode = "any", rBusy = false, rHist = [];

function rPool(skip){
  if (rMode === "any") return DATA;
  return DATA.filter(t => Object.keys(RG).every(g =>
    g === skip || !rSel[g].size || [...rSel[g]].some(i => RG[g][i][1](t))));
}
function rDraw(){
  for (const g of Object.keys(RG)) {
    const base = rPool(g);                       /* count against the other groups' picks */
    document.querySelector(`#rFilters [data-g="${g}"]`).innerHTML = RG[g].map((o, i) =>
      `<button class="chip" type="button" data-i="${i}" aria-pressed="${rSel[g].has(i)}">${o[0]}<small class="mono">${base.filter(o[1]).length}</small></button>`).join("");
  }
  const n = rPool().length;
  $("#poolN").textContent = n;
  $("#roll").disabled = !n || rBusy;
  $("#roll").textContent = n ? ($("#result").classList.contains("idle") ? "Pick my program" : "Pick again") : "No programs match";
  $("#rFilters").hidden = rMode === "any";
  document.querySelectorAll("#viewRand .seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === rMode));
}
$("#rFilters").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  const g = b.parentElement.dataset.g, i = +b.dataset.i;
  rSel[g].has(i) ? rSel[g].delete(i) : rSel[g].add(i);
  rDraw();
  const again = document.querySelector(`#rFilters [data-g="${g}"] [data-i="${i}"]`); if (again) again.focus();
});
document.querySelector(".seg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  rMode = b.dataset.mode; rDraw();
});

function rShow(t, final){
  const el = $("#result");
  el.className = "result" + (final ? "" : " spin");
  if (!final) { el.innerHTML = `<span class="kick">Picking&hellip;</span><div class="rname">${t.n}</div>`; return; }
  el.innerHTML = `
    <span class="kick">Your program</span>
    <div class="rname">${t.n}</div>
    <div class="rsub"><b>${t.nk}</b> &nbsp;&middot;&nbsp; ${t.c}</div>
    <div class="rstats">
      <div><span>Overall</span><b>${t.o}</b></div>
      <div><span>Prestige</span><b>${t.p.toFixed(1)}</b></div>
      <div><span>Titles</span><b>${t.ti || "–"}</b></div>
      <div><span>NIL budget</span><b>${fmt(t.nt)}</b></div>
    </div>
    <div class="rmeta">
      ${t.hc ? `Head coach <b>${t.hc}</b><br>` : ""}
      ${t.sn ? `Home field <b>${t.sn}</b>, ${t.sl} (${fmt(t.sc)})` : ""}
    </div>
    <div class="ract"><button class="ghost" type="button" id="rOpen">Open full team card</button><button class="ghost" type="button" id="rHouse">Set house rules</button></div>`;
  $("#rOpen").addEventListener("click", () => openTeam(t.n));
  $("#rHouse").addEventListener("click", () => hOpenFor(t.n));
}
function rollIt(){
  const pool = rPool(); if (!pool.length || rBusy) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const done = () => {
    rBusy = false; rShow(pick, true);
    rHist = [pick.n, ...rHist.filter(n => n !== pick.n)].slice(0, 6);
    $("#hist").innerHTML = rHist.length > 1 ? "Earlier picks: " + rHist.slice(1).map(n =>
      `<button type="button" data-n="${n}">${n}</button>`).join(", ") : "";
    rDraw();
  };
  if (matchMedia("(prefers-reduced-motion:reduce)").matches || pool.length === 1) return done();
  rBusy = true; rDraw();
  if (matchMedia("(max-width:860px)").matches) $("#result").scrollIntoView({behavior:"smooth", block:"center"});
  let i = 0; const ticks = 14;
  (function tick(){
    if (i++ >= ticks) return done();
    rShow(pool[Math.floor(Math.random() * pool.length)], false);
    setTimeout(tick, 45 + i * 9);
  })();
}
$("#roll").addEventListener("click", rollIt);
$("#hist").addEventListener("click", e => { const b = e.target.closest("[data-n]"); if (b) openTeam(b.dataset.n); });
rDraw();
