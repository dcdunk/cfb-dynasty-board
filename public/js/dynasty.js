// My Dynasty tab: saved dynasty snapshots.
/* ---- my dynasty: saved snapshots of a program + its house rules; pipelines and the recruiting plan are derived from the team ---- */
let D = {list:[], cur:"", arch:false};
try { const s = JSON.parse(localStorage.getItem("dyn-v1") || "null");
  if (s && Array.isArray(s.list)) D = {list:s.list.filter(d => d && d.id && DATA.some(t => t.n === d.team) && Array.isArray(d.rules)), cur:s.cur || "", arch:!!s.arch}; } catch (e) {}
const dSave = () => { try { localStorage.setItem("dyn-v1", JSON.stringify(D)); } catch (e) {} };
// The dynasty House rules is editing, if it's still for this team and not archived.
const hDyn = () => D.list.find(d => d.id === H.dyn && d.team === H.team && !d.arch);
const dDate = ms => new Date(ms).toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"});
function dAdd(){
  const t = hT(), n = D.list.filter(d => d.team === t.n).length;
  const d = {id:"d" + Date.now().toString(36), name:`${t.n} ${t.nk}${n ? ` ${n + 1}` : ""}`, team:t.n, rules:[...H.rules], src:H.src, made:Date.now(), arch:false};
  D.list.unshift(d); D.cur = d.id; D.arch = false; H.dyn = d.id; dSave(); hDraw(); dDraw();
}
function dDraw(){
  const shown = D.list.filter(d => !!d.arch === D.arch), nA = D.list.length - D.list.filter(d => !d.arch).length;
  if (!shown.some(d => d.id === D.cur)) D.cur = shown[0] ? shown[0].id : "";
  $("#dNew").textContent = `+ Save ${H.team} from House Rules`;
  $("#dSeg").innerHTML = `<button type="button" data-dseg="" aria-pressed="${!D.arch}">Active (${D.list.length - nA})</button><button type="button" data-dseg="1" aria-pressed="${D.arch}">Archived (${nA})</button>`;
  $("#dList").innerHTML = shown.length ? shown.map(d => { const t = DATA.find(x => x.n === d.team);
    return `<li><button type="button" data-d="${d.id}" aria-pressed="${d.id === D.cur}"><b>${esc(d.name)}</b><small>${dDate(d.made)}</small><span>${esc(t.n)} &middot; ${esc(t.c)} &middot; ${strainLbl(strainOf(d.rules.filter(id => HR[id])))[0]}</span></button></li>`; }).join("")
    : `<li class="bempty">${D.arch ? "Nothing archived. Archived dynasties show up here." : "No dynasties yet."}</li>`;
  const d = D.list.find(x => x.id === D.cur);
  if (!d) { $("#dView").innerHTML = D.arch ? "" : `<div class="book"><div class="bempty">Pick a program and its house rules in House Rules, then save it here to keep its pipelines and recruiting &amp; NIL plan in one place.<br><br><button class="ghost pri" type="button" data-go="house">Go to House Rules</button></div></div>`; return; }
  const t = DATA.find(x => x.n === d.team), ids = d.rules.filter(id => HR[id]).sort((a, b) => catIx(a) - catIx(b)), s = strainOf(ids);
  const rules = ids.map(id => { const r = HR[id], reg = r.reg ? r.reg(t) : null;
    return `<li class="rule"><div><span class="rcat">${HCATN[r.c]}</span><div class="rttl">${r.n} ${pips(r.l)}${r.u ? `<span class="ctag">Custom</span>` : ""}</div><p>${r.x(t)}</p>${reg && reg.length ? hMap(reg, tiersOf(t)) : ""}</div></li>`; }).join("");
  $("#dView").innerHTML = `<div class="book">
    <div class="bhead"><span class="kick">${d.arch ? "Archived dynasty" : "Dynasty"} &middot; started ${dDate(d.made)}</span>
      <input class="dname" id="dName" value="${esc(d.name)}" maxlength="40" aria-label="Dynasty name" title="Click to rename">
      <div class="bsub"><b>${t.nk}</b> &nbsp;&middot;&nbsp; ${t.c} &nbsp;&middot;&nbsp; ${t.sl} &nbsp;&middot;&nbsp; ${t.p.toFixed(1)}★ prestige &nbsp;&middot;&nbsp; ${fmt(t.nt)} NIL</div>
      <div class="strain"><span class="lbl">Difficulty</span>${meter(s)}<b>${strainLbl(s)[0]}</b><span class="sub">${ids.length} ${ids.length === 1 ? "rule" : "rules"}</span></div></div>
    <div class="bfoot">${d.arch ? "" : `<button class="ghost pri" type="button" id="dEdit">Edit rules in House Rules</button>`}
      <button class="ghost" type="button" id="dArch">${d.arch ? "Restore to active" : "Archive"}</button></div></div>
  <div class="sl rec">${recSec(1, "House rules", esc(d.src || "Custom"), `<div class="book">${ids.length ? `<ul class="rules">${rules}</ul>` : `<div class="bempty">No house rules on this dynasty.</div>`}</div>`)}${recBody(t, true)}</div>`;
}
$("#viewDyn").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = D.list.find(x => x.id === D.cur);
  if (b.id === "dNew") dAdd();
  else if (b.dataset.dseg != null) { D.arch = !!b.dataset.dseg; dSave(); dDraw(); }
  else if (b.dataset.d) { D.cur = b.dataset.d; dSave(); dDraw(); }
  else if (b.dataset.go) showTab(b.dataset.go);
  else if (b.dataset.pipe) { pSet(b.dataset.pipe); showTab("pipe"); window.scrollTo({top:0}); }
  else if (b.id === "dArch" && d) { d.arch = !d.arch; if (!d.arch) D.arch = false; dSave(); dDraw(); }
  else if (b.id === "dEdit" && d) {
    Object.assign(H, {team:d.team, rules:d.rules.filter(id => HR[id]), lock:new Set(), pre:"", src:d.src, edited:false, dyn:d.id,
      note:`Editing “${esc(d.name)}”. Change rules here, then press Update dynasty.`});
    hDraw(); showTab("house"); window.scrollTo({top:0});
  }
});
$("#viewDyn").addEventListener("change", e => {
  const d = D.list.find(x => x.id === D.cur);
  if (e.target.id === "dName" && d) { d.name = e.target.value.trim() || d.name; dSave(); dDraw(); }
});
function hOpenFor(n){ hSetTeam(n); showTab("house"); window.scrollTo({top:0}); }
huLoad();
if (!hLoad()) hApplyPreset("purist");
if (H.pre && !presetOf(H.pre)) H.pre = "";
hDraw();
if (!DATA.some(t => t.n === rTeam)) rTeam = H.team; combo($("#rq"), recPick, recTeam); recDraw();
