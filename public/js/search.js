// Global search (Ctrl/Cmd+K or /).
/* ---- global search (Cmd/Ctrl+K or /): jumps to any tab, team, coach, ability or house rule ---- */
const GS = [
  ...[...document.querySelectorAll(".tabs .tab")].map(b => ({n:b.textContent, s:"Tab", go:() => showTab(TABS.find(t => t[1] === "#" + b.id)[0])})),
  {n:"Sync your devices", s:"My Dynasty", x:"sync phone mobile desktop devices qr code", go:() => $("#syncOpen").click()},
  ...DATA.map(t => ({n:t.n, s:`${t.nk} · ${t.c}`, x:t.nk + " " + t.ab, go:() => openTeam(t.n)})),
  ...COACHES.map(c => ({n:c.name, s:`${c.role} · ${c.team}`, go:() => ccCard(c.team, c.name)})),
  ...[...Object.keys(ABPHYS), ...Object.keys(ABMENT)].map(n => ({n, s:"Player ability", go:() => gsAb("player", n)})),
  ...[...new Set(CARCH.flatMap(a => a.br.flatMap(([, ab]) => ab.map(([n]) => n))))].map(n => ({n, s:"Coach ability", go:() => gsAb("coach", n)})),
  ...ABARCH.map(([p, n]) => ({n, s:`${p} archetype`, go:() => { abP = p; gsArch("player", "#abGrid .sl-card h3", n); }})),
  ...CARCH.map(a => ({n:a.n, s:"Coach archetype", go:() => { abC = CGROUP.find(g => g[1].includes(a.n))[0]; gsArch("coach", "#abCGrid .ab-ah", a.n); }})),
  ...HRULES.map(r => ({n:r.n, s:"House rule", go:() => showTab("house")})),
  ...PLAYERS.map(p => ({n:p.name, s:`${p.pos} · ${p.team}`, go:() => plOpen(p.name)})),
  {n:"Keyboard shortcuts", s:"Help", x:"keys hotkeys help", go:() => ksShow()}];
function gsAb(m, n){ showTab("ab"); abM = m; $("#abQ").value = n; abDraw(); }
// Opens Abilities on the archetype's position or group and scrolls to its card (heading text starts with the name).
function gsArch(m, sel, n){ gsAb(m, ""); [...document.querySelectorAll(sel)].find(h => h.firstChild?.textContent.trim() === n || h.textContent.trim().startsWith(n))?.scrollIntoView({block:"start"}); }
// Same ranking as teamMatches: name starts with query, then a word starts with it, then contains it. Capped at 40.
function gsFind(q){
  const v = norm(q.trim()); if (!v) return GS.filter(g => g.s === "Tab");
  const score = g => { const n = norm(g.n);
    return n.startsWith(v) ? 0 : n.split(/[\s-]+/).some(w => w.startsWith(v)) ? 1 : n.includes(v) || norm(g.x || "").includes(v) ? 2 : 9; };
  return GS.map(g => [score(g), g]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0]).slice(0, 40).map(x => x[1]);
}
let gsHits = [], gsAct = 0;
function gsDraw(){
  const q = $("#gsq").value; gsHits = gsFind(q); gsAct = 0;
  $("#gsl").innerHTML = gsHits.length ? gsHits.map((g, i) => `<li role="option" id="gs-${i}" data-i="${i}" aria-selected="${i === 0}"><span class="cb-n">${hl(g.n, q)}</span><span class="cb-s">${esc(g.s)}</span></li>`).join("")
    : `<li class="cb-none">Nothing matches “${esc(q.trim())}”</li>`;
  gsMove(0);
}
function gsMove(i){
  gsAct = i; [...$("#gsl").querySelectorAll("[data-i]")].forEach((li, j) => li.setAttribute("aria-selected", j === i));
  const li = $("#gs-" + i); if (li) { $("#gsq").setAttribute("aria-activedescendant", li.id); li.scrollIntoView({block:"nearest"}); }
}
function gsGo(i){ const g = gsHits[i]; if (!g) return; $("#gs").close(); g.go(); }
function gsShow(){ if (picked) closeTeam(); $("#gsq").value = ""; gsDraw(); $("#gs").showModal(); $("#gsq").focus(); }
$("#gsOpen").addEventListener("click", gsShow);
$("#gsq").addEventListener("input", gsDraw);
$("#gsq").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (gsHits.length) gsMove((gsAct + (e.key === "ArrowDown" ? 1 : gsHits.length - 1)) % gsHits.length); }
  else if (e.key === "Enter") { e.preventDefault(); gsGo(gsAct); }
});
$("#gsl").addEventListener("mousedown", e => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); gsGo(+li.dataset.i); } });
$("#gs").addEventListener("click", e => { if (e.target === $("#gs")) $("#gs").close(); });
$("#gs").addEventListener("keydown", e => { if (e.key === "Escape") e.stopPropagation(); });
addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
    if ($("#gs").open) return; e.preventDefault(); $("#ks").close(); gsShow(); }
  else if (e.key === "?" && !typing && !$("#gs").open && !$("#ks").open) { e.preventDefault(); ksShow(); }
});

/* ---- keyboard shortcuts panel (? anywhere, or "keyboard shortcuts" in search): lists every shortcut the site handles ---- */
// Keep in step with the keydown handlers in board.js, tabs.js, picker.js, search.js and coach-chat.js.
const KMOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
const KS = [
  ["Anywhere", [[["/"], "Search everything"], [[KMOD, "K"], "Search everything"], [["?"], "Show this list"], [["Esc"], "Close search, a team's details, Coach or this list"]]],
  ["Tabs", [[["←", "→"], "Move between tabs (when a tab is focused)"]]],
  ["Tables and team details", [[["Tab"], "Move between rows"], [["Enter"], "Open the focused team"], [["Enter"], "Sort a team's roster by the focused column"]]],
  ["Search and program boxes", [[["↑", "↓"], "Move through results"], [["Enter"], "Pick the highlighted result"], [["Esc"], "Close the list"]]],
  ["Coach", [[["Enter"], "Send"], [["Shift", "Enter"], "New line"]]]];
function ksShow(){
  if (picked) closeTeam();
  $("#ksL").innerHTML = KS.map(([h, rows]) => `<h3>${h}</h3><dl>${rows.map(([k, d]) => `<dt>${k.map(x => `<kbd>${esc(x)}</kbd>`).join("")}</dt><dd>${esc(d)}</dd>`).join("")}</dl>`).join("");
  $("#ks").showModal(); $("#ksX").focus();
}
$("#ksX").addEventListener("click", () => $("#ks").close());
$("#ks").addEventListener("click", e => { if (e.target === $("#ks")) $("#ks").close(); });
$("#ks").addEventListener("keydown", e => { if (e.key === "Escape") e.stopPropagation(); });
