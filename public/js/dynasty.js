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
// From Coach's "Add to My Dynasty?" button: the plan's team, rules, goal and game difficulty become a saved dynasty.
function dFromCoach(c){
  const t = DATA.find(x => x.n === c.team); if (!t) return null;
  const n = D.list.filter(d => d.team === t.n).length;
  const d = {id:"d" + Date.now().toString(36), name:`${t.n} ${t.nk}${n ? ` ${n + 1}` : ""}`, team:t.n, rules:(c.rules || []).filter(id => HR[id]), src:`Coach · ${c.label}`,
    made:Date.now(), arch:false, ...(c.goal ? {goal:c.goal, goalName:c.goalName || ""} : {}), ...(c.gd ? {gd:c.gd} : {})};
  D.list.unshift(d); D.cur = d.id; D.arch = false; dSave(); dDraw();
  return d.id;
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
      ${d.goal ? `<div class="bsub bgoal"><b>Goal${d.goalName ? ` · ${esc(d.goalName)}` : ""}:</b> ${esc(d.goal)}</div>` : ""}
      ${d.gd ? `<div class="bsub bgoal"><b>Plays on:</b> ${esc(d.gd)}</div>` : ""}
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
/* ---- backup and restore: everything this browser saved for the site, as one JSON file ---- */
// Coach's chat history (coach-v1) is left out on purpose: big and not worth carrying over.
const BAKKEYS = ["dyn-v1", "house-v1", "house-custom-v1", "rec-v1", "theme-v1", "abfav-v1", "poschg-v1"];
const BAKAPP = "cfb-dynasty-board";
function dBackupData(){
  const data = {}; for (const k of BAKKEYS) { try { const v = localStorage.getItem(k); if (v != null) data[k] = v; } catch (e) {} }
  return {app:BAKAPP, v:1, made:new Date().toISOString(), data};
}
function dBackup(){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dBackupData(), null, 1)], {type:"application/json"}));
  const n = new Date(), ymd = [n.getFullYear(), n.getMonth() + 1, n.getDate()].map(x => String(x).padStart(2, "0")).join("-");
  a.download = `dynasty-board-backup-${ymd}.json`; // local date, not UTC
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  dBakNote(`Backup saved: ${dPl(D.list.length)}.`);
}
const dPl = n => `${n} ${n === 1 ? "dynasty" : "dynasties"}`;
const dCount = raw => { try { const l = JSON.parse(raw || "null")?.list; return Array.isArray(l) ? l.length : 0; } catch (e) { return 0; } };
// Checks a backup file's text. Returns {data, n} or {err}. Nothing is written here.
function dReadBackup(text){
  let b; try { b = JSON.parse(text); } catch (e) { return {err:"That file isn't a Dynasty Board backup (it isn't valid JSON)."}; }
  if (!b || b.app !== BAKAPP || typeof b.data !== "object" || !b.data) return {err:"That file isn't a Dynasty Board backup."};
  const data = {};
  for (const k of BAKKEYS) if (k in b.data) {
    if (typeof b.data[k] !== "string") return {err:"That backup file is damaged."};
    try { JSON.parse(b.data[k]); } catch (e) { return {err:"That backup file is damaged."}; }
    data[k] = b.data[k];
  }
  return {data, n:dCount(data["dyn-v1"])};
}
// Replace: every backed-up key is overwritten, and keys missing from the backup are cleared.
function dApplyBackup(data){ for (const k of BAKKEYS) { if (k in data) localStorage.setItem(k, data[k]); else localStorage.removeItem(k); } }
function dRestoreText(text){
  const r = dReadBackup(text); if (r.err) return dBakNote(r.err, true);
  const have = D.list.length, custom = HU.rules.length;
  if ((have || custom) && !confirm(`Restoring replaces what's saved in this browser:\n\n• ${dPl(have)}${custom ? `\n• ${custom} custom ${custom === 1 ? "rule" : "rules"}` : ""}\n• your House Rules and Recruiting settings\n\nwith the backup (${dPl(r.n)}). This can't be undone. Replace?`)) return dBakNote("Restore canceled. Nothing changed.");
  try { dApplyBackup(r.data); sessionStorage.setItem("dyn-restored", String(r.n)); } catch (e) { return dBakNote("Couldn't restore: this browser blocked saving.", true); }
  location.reload();
}
function dBakNote(msg, err){ const m = $("#dBakMsg"); m.textContent = msg; m.hidden = false; m.classList.toggle("err", !!err); }
$("#dBackup").addEventListener("click", dBackup);
$("#dRestore").addEventListener("click", () => $("#dFile").click());
$("#dFile").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (f) dRestoreText(await f.text()); });
try { const n = sessionStorage.getItem("dyn-restored"); if (n != null) { sessionStorage.removeItem("dyn-restored");
  dBakNote(`Restored from backup: ${dPl(+n)}.`); } } catch (e) {}

function hOpenFor(n){ hSetTeam(n); showTab("house"); window.scrollTo({top:0}); }
huLoad();
if (!hLoad()) hApplyPreset("purist");
if (H.pre && !presetOf(H.pre)) H.pre = "";
hDraw();
if (!DATA.some(t => t.n === rTeam)) rTeam = H.team; combo($("#rq"), recPick, recTeam); recDraw();
