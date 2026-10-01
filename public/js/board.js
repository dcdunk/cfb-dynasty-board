// Program Database tab (internally "board": #tabBoard, #viewBoard): conference chips and search, the sortable team table, and the team dossier drawer.
/* ---- controls ---- */
const confs = ["All", ...[...new Set(DATA.map(t => t.c))].sort()];
$("#chips").innerHTML = confs.map(c =>
  `<button class="chip" type="button" data-c="${c}" aria-pressed="${c === "All"}">${c}</button>`).join("");
$("#chips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  conf = b.dataset.c;
  [...$("#chips").children].forEach(x => x.setAttribute("aria-pressed", x === b));
  draw();
});
$("#q").addEventListener("input", e => { query = norm(e.target.value.trim()); draw(); });
$("#reset").addEventListener("click", () => {
  conf = "All"; query = ""; sortKey = "o"; sortDir = -1; $("#q").value = "";
  [...$("#chips").children].forEach(x => x.setAttribute("aria-pressed", x.dataset.c === "All"));
  draw();
});

$("#hrow").innerHTML = COLS.map(c =>
  `<th class="${c.cls || ""}" data-k="${c.k}" scope="col">${c.t}<span class="car"></span></th>`).join("");
$("#hrow").addEventListener("click", e => {
  const th = e.target.closest("th"); if (!th || th.dataset.k === "rk") return;
  const k = th.dataset.k;
  if (k === sortKey) sortDir *= -1;
  else { sortKey = k; sortDir = (k === "n" || k === "c") ? 1 : -1; }
  draw();
});

/* ---- table ---- */
function stars(v){
  let h = "";
  for (let i = 1; i <= 5; i++) h += `<i class="${v >= i ? "f" : (v >= i - .5 ? "h" : "")}"></i>`;
  return `<span class="stars" role="img" aria-label="${v} of 5 stars">${h}</span>`;
}

function rowsFor(){
  let r = DATA.filter(t =>
    (conf === "All" || t.c === conf) &&
    (!query || norm(t.n).includes(query) || norm(t.nk).includes(query) || norm(t.ab).startsWith(query)));
  const k = sortKey;
  return r.sort((a, b) => {
    const x = a[k], y = b[k];
    const c = typeof x === "string" ? x.localeCompare(y) : x - y;
    return (c || a.n.localeCompare(b.n)) * (typeof x === "string" ? 1 : sortDir);
  });
}

function draw(){
  const list = rowsFor();
  [...$("#hrow").children].forEach(th => {
    const on = th.dataset.k === sortKey;
    if (on) th.setAttribute("aria-sort", sortDir > 0 ? "ascending" : "descending");
    else th.removeAttribute("aria-sort");
    th.querySelector(".car").textContent = on ? (sortDir > 0 ? "▲" : "▼") : "";
  });
  $("#rows").innerHTML = list.map((t, i) => `
    <tr tabindex="0" data-n="${t.n}" aria-selected="${picked === t.n}">
      <td class="l rk mono">${i + 1}</td>
      <td class="l"><span class="team">${hl(t.n, query)}</span> <span class="sub">${hl(t.nk, query)}</span></td>
      <td class="l sub">${t.c}${t.dv ? " " + t.dv : ""}</td>
      <td class="mono big">${t.o}</td>
      <td class="mono mut">${t.of}</td>
      <td class="mono mut">${t.df}</td>
      <td>${stars(t.p)}</td>
      <td class="mono ${t.ti ? "big" : "zero"}">${t.ti || "–"}</td>
      <td><span class="nil"><span class="mono mut">${fmt(t.nt)}</span>
        <span class="nilbar"><i style="width:${Math.round(t.nt / 12500 * 100)}%"></i></span></span></td>
      <td class="mono mut">${t.ap.toFixed(1)}</td>
    </tr>`).join("");
  $("#empty").hidden = list.length > 0;
  $("#cTeams").textContent = list.length;
  $("#cPlayers").textContent = fmt(list.reduce((s, t) => s + t.r.length, 0));
  $("#cTitles").textContent = fmt(list.reduce((s, t) => s + t.ti, 0));
}

$("#rows").addEventListener("click", e => {
  const tr = e.target.closest("tr"); if (tr) openTeam(tr.dataset.n);
});
$("#rows").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr"); if (!tr) return;
  e.preventDefault(); openTeam(tr.dataset.n);
});

/* ---- dossier ---- */
let shownAll = false, posF = "All", rKey = 3, rDir = -1;
const POSG = [["All",null],["QB",["QB"]],["RB",["HB","FB"]],["WR",["WR"]],["TE",["TE"]],
  ["OL",["LT","LG","C","RG","RT"]],["DL",["LE","RE","DT"]],["LB",["LOLB","MLB","ROLB"]],
  ["CB",["CB"]],["S",["FS","SS"]],["K/P",["K","P"]]];

function openTeam(name){
  const t = DATA.find(x => x.n === name); if (!t) return;
  picked = name; shownAll = false; posF = "All"; rKey = 3; rDir = -1;
  $("#dname").textContent = t.n;
  $("#dmeta").innerHTML =
    `<b>${t.nk}</b> &nbsp;&middot;&nbsp; ${t.c}${t.dv ? " " + t.dv : ""} &nbsp;&middot;&nbsp; ${t.ab}`;
  $("#dmotto").textContent = t.mo || "";
  $("#dmotto").hidden = !t.mo;
  $("#dtags").innerHTML = t.h.map(h => `<span class="tag">${h}</span>`).join("");
  $("#dbody").innerHTML = body(t);
  $("#dossier").hidden = false;
  requestAnimationFrame(() => { $("#dossier").classList.add("on"); $("#scrim").classList.add("on"); });
  $("#dclose").focus();
  draw();
}

function body(t){
  const pct = Math.round(t.na / t.nt * 100);
  const grades = GRADES.map((g, i) => `
    <div class="grow"><em>${g}</em>
      <span class="gbar"><i style="width:${GVAL[t.g[i]] / 12 * 100}%"></i></span>
      <span class="glet">${t.g[i]}</span></div>`).join("");
  const grp = POSG.find(g => g[0] === posF)[1];
  const pool = (grp ? t.r.filter(p => grp.includes(p[1])) : t.r.slice())
    .sort((a, b) => (a[rKey] - b[rKey]) * rDir || b[3] - a[3] || a[0].localeCompare(b[0]));
  const sth = (k, lbl, full) => `<th scope="col" class="srt" data-rk="${k}" tabindex="0" title="Sort by ${full}"${
    rKey === k ? ` aria-sort="${rDir > 0 ? "ascending" : "descending"}"` : ""}>${lbl}<span class="car">${
    rKey === k ? (rDir > 0 ? "▲" : "▼") : "↕"}</span></th>`;
  const capped = !grp && !shownAll;
  const pchips = POSG.map(g => {
    const c = g[1] ? t.r.filter(p => g[1].includes(p[1])).length : t.r.length;
    return `<button class="chip" type="button" data-pos="${g[0]}" aria-pressed="${g[0] === posF}"${c ? "" : " disabled"}>${g[0]} <span class="mono">${c}</span></button>`;
  }).join("");
  const roster = pool.slice(0, capped ? 15 : pool.length).map(p => `
    <tr><td>${p[1]}</td>
      <td class="nm">${p[0]}<span class="dev d${p[4]}">${DEVN[p[4]]}</span></td>
      <td class="yr">${p[2]}</td>
      <td class="mono">${p[3]}</td>
      <td class="mono mut">${p[5]}</td></tr>`).join("");
  return `
    <div class="trio">
      <div><b>${t.o}</b><span>Overall</span></div>
      <div><b>${t.of}</b><span>Offense</span></div>
      <div><b>${t.df}</b><span>Defense</span></div>
    </div>
    <div class="lede">
      <div><span class="lbl">Prestige</span>
        <span class="pair">${stars(t.p)}<span class="mono mut">${t.p.toFixed(1)}</span></span></div>
      <div><span class="lbl">National titles</span><b class="mono big">${t.ti || "–"}</b>${tYears(t).length ? `<span class="sub">${tYears(t).join(", ")}</span>` : ""}</div>
      <div><span class="lbl">Roster avg</span><b class="mono big">${t.ap.toFixed(1)}</b>
        <span class="sub">off ${t.ao.toFixed(1)} / def ${t.ad.toFixed(1)}</span></div>
    </div>
    <h3>Coaching staff</h3>
    <table class="rost staff"><thead><tr><th class="l" scope="col">Role</th><th class="l" scope="col">Coach</th><th scope="col">Lvl</th><th scope="col">Grade</th><th class="l" scope="col">Archetype</th><th class="l" scope="col">Pipeline</th></tr></thead><tbody>${
      t.st.map(c => `<tr><td>${c[0]}</td><td class="nm">${c[1]}${c[7] ? `<span class="dev d1">Generic</span>` : ""}</td><td class="mono">${c[2]}</td><td class="mono">${c[3]}</td><td class="l">${c[4]}</td><td class="l">${c[5]}</td></tr>`).join("")
    }</tbody></table>
    <h3>Stadium</h3>
    <div class="stad">
      <div><span class="lbl">Name</span><b>${t.sn}</b><span class="sub">${t.sl}</span></div>
      <div><span class="lbl">Capacity</span><b class="mono big">${fmt(t.sc)}</b></div>
    </div>
    <h3>NIL budget</h3>
    <div class="grow" style="grid-template-columns:118px 1fr auto">
      <em>${fmt(t.na)} available</em>
      <span class="gbar"><i style="width:${pct}%"></i></span>
      <span class="glet">${fmt(t.nt)}</span>
    </div>
    <h3>School grades</h3>
    <div class="grades">${grades}</div>
    <h3>Roster &mdash; ${t.pc} players</h3>
    <div class="chips pchips" role="group" aria-label="Filter roster by position">${pchips}</div>
    <table class="rost"><thead><tr><th class="l" scope="col">Pos</th><th class="l" scope="col">Player</th><th class="l" scope="col">Yr</th>${sth(3,"Ovr","overall")}${sth(5,"Spd","speed")}</tr></thead><tbody>${roster}</tbody></table>
    ${!capped ? "" : `<button class="rmore" id="rmore" type="button">Show all ${t.r.length}</button>`}`;
}

$("#dbody").addEventListener("click", e => {
  const pc = e.target.closest("[data-pos]");
  const sh = e.target.closest("[data-rk]");
  if (sh) { const k = +sh.dataset.rk; if (k === rKey) rDir *= -1; else { rKey = k; rDir = -1; } }
  else if (pc) posF = pc.dataset.pos;
  else if (e.target.id === "rmore") shownAll = true;
  else return;
  const keep = $("#dbody").scrollTop;
  $("#dbody").innerHTML = body(DATA.find(x => x.n === picked));
  $("#dbody").scrollTop = keep;
  if (sh) { const b = $(`#dbody [data-rk="${rKey}"]`); if (b) b.focus({preventScroll:true}); }
  if (pc) { const b = $(`#dbody [data-pos="${posF}"]`); if (b) b.focus({preventScroll:true}); }
});

function closeTeam(){
  $("#dossier").classList.remove("on"); $("#scrim").classList.remove("on");
  picked = null; draw();
  setTimeout(() => { $("#dossier").hidden = true; }, 220);
}
$("#dbody").addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-rk]")) { e.preventDefault(); e.target.click(); }
});
$("#dclose").addEventListener("click", closeTeam);
$("#scrim").addEventListener("click", closeTeam);
addEventListener("keydown", e => { if (e.key === "Escape" && picked) closeTeam(); });
