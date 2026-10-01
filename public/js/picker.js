// Program picker: the shared combo() search box behind every "Search a program" field.
/* ---- program picker: one combobox shared by every "Search a program" box ---- */
// Ranking: name starts with query, then a word in the name starts with it, then name/nickname/abbrev contains it.
function teamMatches(q){
  const v = norm(q.trim()), byName = [...DATA].sort((a, b) => a.n.localeCompare(b.n));
  if (!v) return byName;
  const score = t => { const n = norm(t.n);
    return n.startsWith(v) ? 0 : n.split(/[\s-]+/).some(w => w.startsWith(v)) ? 1
      : n.includes(v) || norm(t.nk).includes(v) || norm(t.ab).startsWith(v) ? 2 : 9; };
  return byName.map(t => [score(t), t]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
let comboN = 0;
function combo(inp, pick, current){
  const box = inp.closest(".search"), id = "cb" + ++comboN, list = document.createElement("ul");
  list.className = "cb"; list.id = id; list.setAttribute("role", "listbox"); list.hidden = true; box.append(list);
  Object.entries({role:"combobox", "aria-autocomplete":"list", "aria-expanded":"false", "aria-controls":id})
    .forEach(([k, v]) => inp.setAttribute(k, v));
  let hits = [], act = -1;
  const move = i => { act = i; [...list.children].forEach((li, j) => li.setAttribute("aria-selected", j === i));
    if (i >= 0 && list.children[i]) { inp.setAttribute("aria-activedescendant", list.children[i].id); list.children[i].scrollIntoView({block:"nearest"}); }
    else inp.removeAttribute("aria-activedescendant"); };
  const open = () => {
    const q = inp.value === current() ? "" : inp.value;
    hits = teamMatches(q);
    list.innerHTML = hits.length ? hits.map((t, i) => `<li role="option" id="${id}-${i}" data-n="${esc(t.n)}"${t.n === current() ? ' class="cur"' : ""}>
      <span class="cb-n">${hl(t.n, q)}</span><span class="cb-s">${hl(t.nk, q)} · ${esc(t.c)}</span></li>`).join("")
      : `<li class="cb-none">No program matches “${esc(q.trim())}”</li>`;
    list.hidden = false; inp.setAttribute("aria-expanded", "true");
    move(q ? 0 : hits.findIndex(t => t.n === current()));
  };
  const close = () => { list.hidden = true; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); };
  const choose = n => { close(); pick(n); inp.value = current(); };
  inp.addEventListener("focus", () => { inp.select(); open(); });
  inp.addEventListener("input", open);
  inp.addEventListener("blur", () => { close(); inp.value = current(); });
  inp.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (list.hidden) return open();
      if (hits.length) move((act + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length); }
    else if (e.key === "Enter" && !list.hidden && hits[Math.max(act, 0)]) { e.preventDefault(); choose(hits[Math.max(act, 0)].n); inp.blur(); }
    else if (e.key === "Escape") { if (!list.hidden) { e.stopPropagation(); close(); } inp.value = current(); inp.blur(); }
  });
  list.addEventListener("mousedown", e => { e.preventDefault(); const li = e.target.closest("[data-n]"); if (li) { choose(li.dataset.n); inp.blur(); } });
}
