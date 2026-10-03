// Tab row: TABS, the URL hash (TSLUG), showTab, arrow keys, and sliding the picked tab into view on narrow screens.
/* ---- tabs ---- */
const TABS = [["board","#tabBoard","#viewBoard"],["dyn","#tabDyn","#viewDyn"],["rand","#tabRand","#viewRand"],["coach","#tabCoach","#viewCoach"],["play","#tabPlay","#viewPlay"],["pipe","#tabPipe","#viewPipe"],["house","#tabHouse","#viewHouse"],["rec","#tabRec","#viewRec"],["slide","#tabSlide","#viewSlide"],["ab","#tabAb","#viewAb"]];
let curTab = "board";
// The open tab lives in the URL hash (#abilities) so a refresh or a shared link reopens it. Program Database (board) is the bare URL.
const TSLUG = {board:"", dyn:"my-dynasty", rand:"randomizer", coach:"coaches", play:"players", pipe:"pipelines", house:"house-rules", rec:"recruiting", slide:"sliders", ab:"abilities"};
// When the tab row is too narrow to show all ten (phones, narrow windows), scroll the picked tab to the row's left edge
// so the tabs after it come into view. When everything fits the row can't scroll, so nothing moves.
function tabSlide(b, instant){
  const row = $(".tabs"); if (row.scrollWidth <= row.clientWidth) return;
  const left = row.scrollLeft + b.getBoundingClientRect().left - row.getBoundingClientRect().left - parseFloat(getComputedStyle(row).paddingLeft);
  row.scrollTo({left, behavior: instant || matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
}
// Program Database is the bare URL; with filters on it becomes #programs/conf=SEC.
function tabHash(){ const sub = TSUB[curTab]?.() || "";
  try { history.replaceState(null, "", TSLUG[curTab] ? "#" + TSLUG[curTab] + sub : sub ? "#programs" + sub : location.pathname + location.search); } catch (e) {} }
function showTab(which, instant){
  curTab = which;
  tabHash();
  if (which === "rec") recDraw();
  if (which === "dyn") dDraw();
  if (which === "play") plShow();
  for (const [k, tb, vw] of TABS) {
    $(vw).hidden = k !== which;
    $(tb).setAttribute("aria-selected", k === which);
    $(tb).tabIndex = k === which ? 0 : -1;
  }
  // Notes drawn while the tab was hidden couldn't measure their height; size them now that they show.
  if (which === "ab") document.querySelectorAll("#viewAb .pc-n, #pcNote").forEach(pcFit);
  tabSlide($(TABS.find(t => t[0] === which)[1]), instant);
  setRail();
  mMark();
}
for (const [k, tb] of TABS) $(tb).addEventListener("click", () => showTab(k));
$(".tabs").addEventListener("keydown", e => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const vs = [...document.querySelectorAll(".tabs .tab")].map(b => TABS.find(t => t[1] === "#" + b.id)[0]);
  const i = vs.indexOf(curTab), to = vs[(i + (e.key === "ArrowRight" ? 1 : vs.length - 1)) % vs.length];
  showTab(to); $(TABS.find(t => t[0] === to)[1]).focus({preventScroll: true});
});

// Sticky search rails (Program Database, Coach Database, Player Database, Pipelines): publish the open one's height as --railh so the table header and pipeline side panel stick just below it.
const setRail = () => {
  const r = document.querySelector(curTab === "coach" ? "#viewCoach .rail" : curTab === "play" ? "#viewPlay .rail" : curTab === "pipe" ? "#viewPipe .rail" : "#viewBoard .rail");
  if (r && r.offsetHeight) document.documentElement.style.setProperty("--railh", r.offsetHeight + "px");
};
addEventListener("resize", setRail);
setRail();

// Phone tab bar (under 768px, like the Linear app): a floating pill with four pinned tabs and a menu button
// that opens a panel with every tab plus Search, Sync and the theme; Coach is the round button beside it.
// The top tab row and masthead buttons are hidden at that width; these buttons just call showTab or click the masthead ones.
const MI = p => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const MNAV = [
  ["dyn", "My Dynasty", "Dynasty", '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>'],
  ["board", "Program Database", "Programs", '<path d="M4 6h16M4 12h16M4 18h16"/>'],
  ["play", "Player Database", "Players", '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
  ["ab", "Abilities", "Abilities", '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
  ["pipe", "Program Pipelines", "Pipelines", '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'],
  ["coach", "Coach Database", "Coaches", '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>'],
  ["rand", "Randomizer", "Random", '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/>'],
  ["house", "House Rules", "Rules", '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-5h4v5"/>'],
  ["rec", "Recruiting & NIL", "Recruiting", '<path d="M12 3 2 8l10 5 10-5z"/><path d="M6 10v5c3 2 9 2 12 0v-5"/>'],
  ["slide", "Sliders", "Sliders", '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>']
];
// Which four tabs sit in the bar is the user's choice ("Edit tab bar" in the menu), saved in mbar-v1.
const MPIN0 = ["dyn", "board", "play", "ab"];
let MPIN = MPIN0;
try { const v = JSON.parse(localStorage.getItem("mbar-v1")); if (Array.isArray(v)) { const ok = [...new Set(v)].filter(k => TSLUG[k] !== undefined).slice(0, 4); if (ok.length) MPIN = ok; } } catch (e) {}
let mEdit = false;
const mbar = document.createElement("nav");
mbar.className = "mbar"; mbar.setAttribute("aria-label", "Tabs");
mbar.innerHTML = `<div class="mmenu" id="mMenu" hidden></div><div class="mpill" id="mPill"></div>
<button type="button" class="mcoach" aria-label="Coach" title="Plan a dynasty with Coach">${MI('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4" height="6" rx="1"/><rect x="17.5" y="13" width="4" height="6" rx="1"/><path d="M19.5 19v.5a2.5 2.5 0 0 1-2.5 2.5h-4"/>')}</button>`;
document.body.append(mbar);
const MOREI = MI('<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>');
function mDraw(){
  $("#mPill").innerHTML = MPIN.map(k => MNAV.find(t => t[0] === k)).map(([k, l, s, i]) => `<button type="button" data-mt="${k}" aria-label="${esc(l)}">${MI(i)}<span>${s}</span></button>`).join("")
    + `<button type="button" id="mMore" aria-label="All tabs" aria-expanded="${!$("#mMenu").hidden}" aria-controls="mMenu">${MOREI}<span>More</span></button>`;
  // Edit mode: the same list with a check per tab; up to four, at least one, in the order picked.
  $("#mMenu").innerHTML = mEdit
    ? `<div class="mhead"><span>Tab bar: pick up to 4 <b id="mCount">${MPIN.length}/4</b></span><button type="button" class="mdone" data-me="done">Done</button></div>`
      + MNAV.map(([k, l, , i]) => { const on = MPIN.includes(k), full = !on && MPIN.length >= 4;
        return `<button type="button" data-mp="${k}" role="checkbox" aria-checked="${on}"${full ? ' aria-disabled="true" class="off"' : ""}>${MI(i)}${esc(l)}<span class="mchk${on ? " on" : ""}">${on ? MPIN.indexOf(k) + 1 : ""}</span></button>`; }).join("")
      + `<hr><button type="button" data-me="reset">${MI('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>')}Reset to default</button>`
    : MNAV.filter(t => !MPIN.includes(t[0])).map(([k, l, , i]) => `<button type="button" data-mt="${k}">${MI(i)}${esc(l)}</button>`).join("")
      + `<hr><button type="button" data-mc="gsOpen">${MI('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')}Search</button>
  <button type="button" data-mc="syncOpen">${MI('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>')}Sync your devices</button>
  <button type="button" data-mc="themeBtn">${MI('<path d="M12 3a9 9 0 1 0 0 18z"/><circle cx="12" cy="12" r="9"/>')}Light / dark mode</button>
  <button type="button" data-me="edit">${MI('<path d="M4 20h4L19 9l-4-4L4 16z"/>')}Edit tab bar</button>`;
  mMark();
}
const mMenu = on => { if (!on) mEdit = false; $("#mMenu").hidden = !on; mDraw(); };
const mPin = v => { MPIN = v; try { localStorage.setItem("mbar-v1", JSON.stringify(v)); } catch (e) {} mDraw(); };
// Marks the open tab in the pill; a tab that only lives in the menu lights up More instead.
function mMark(){
  for (const b of mbar.querySelectorAll("[data-mt]")) b.classList.toggle("on", b.dataset.mt === curTab);
  $("#mMore").classList.toggle("on", !MPIN.includes(curTab));
}
mbar.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "mMore") return mMenu($("#mMenu").hidden);
  if (b.dataset.mp) { const k = b.dataset.mp;
    if (MPIN.includes(k)) { if (MPIN.length > 1) mPin(MPIN.filter(x => x !== k)); }
    else if (MPIN.length < 4) mPin([...MPIN, k]);
    return; }
  if (b.dataset.me === "edit") { mEdit = true; return mDraw(); }
  if (b.dataset.me === "reset") return mPin(MPIN0);
  mMenu(false);
  if (b.dataset.mt) { showTab(b.dataset.mt); scrollTo({top: 0}); }
  else if (b.dataset.mc) $("#" + b.dataset.mc).click();
  else if (b.classList.contains("mcoach")) $("#pOpen").click();
});
// composedPath: a tap in edit mode redraws the menu, so the tapped button is already gone from the page by now.
document.addEventListener("click", e => { if (!e.composedPath().includes(mbar)) mMenu(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#mMenu").hidden) { mMenu(false); $("#mMore").focus(); } });
mDraw();

// Phone bottom sheets (under 768px, CSS does the layout): the dossier, player card, search, sync and shortcut panels
// get a grab handle and close when dragged down, like Apple Maps. A drag starts on the handle or header, or anywhere
// once the sheet's content is scrolled to the top; sideways swipes (wide tables) are left alone.
const SHEETMQ = matchMedia("(max-width:767px)");
function sheet(el, close, scroller){
  el.insertAdjacentHTML("afterbegin", '<div class="grab" aria-hidden="true"></div>');
  let y0, x0, dy, t0, drag, top;
  el.addEventListener("touchstart", e => {
    if (!SHEETMQ.matches || e.touches.length > 1) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; t0 = Date.now(); drag = false;
    top = !!e.target.closest(".grab,.ks-h,.dhead") || scroller().scrollTop <= 0;
  }, {passive: true});
  el.addEventListener("touchmove", e => {
    if (y0 == null || !top) return;
    dy = e.touches[0].clientY - y0;
    if (!drag) { if (dy < 8 || Math.abs(e.touches[0].clientX - x0) > dy) { if (Math.abs(dy) > 8 || Math.abs(e.touches[0].clientX - x0) > 8) y0 = null; return; } drag = true; }
    e.preventDefault(); el.style.transition = "none"; el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, {passive: false});
  el.addEventListener("touchend", () => {
    if (y0 == null) return; y0 = null; if (!drag) return;
    el.style.transition = "";
    // Far enough (a third of the sheet) or a quick flick closes; otherwise it springs back.
    if (dy > el.offsetHeight / 3 || dy / (Date.now() - t0) > 0.5) close(); else el.style.transform = "";
  });
}
// A dialog slides the rest of the way down, then closes; the dossier's own close slides it out (its CSS transform).
const sheetShut = d => () => { d.style.transform = "translateY(100%)"; setTimeout(() => { d.close(); d.style.transform = ""; }, 200); };
for (const id of ["#plc", "#sy", "#ks"]) sheet($(id), sheetShut($(id)), () => $(id));
sheet($("#gs"), sheetShut($("#gs")), () => $("#gsl"));
sheet($("#dossier"), () => { $("#dossier").style.transform = ""; closeTeam(); }, () => $("#dbody"));
