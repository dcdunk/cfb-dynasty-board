// Light/dark toggle in the masthead.
/* ---- light/dark toggle: a saved choice (theme-v1) wins, otherwise follow the system ---- */
const TSVG = p => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const TICON = {dark: TSVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  light: TSVG('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>')};
const themeNow = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
function themeBtn(){ const t = themeNow(), l = `Switch to ${t === "dark" ? "light" : "dark"} mode`, b = $("#themeBtn");
  b.innerHTML = TICON[t]; b.setAttribute("aria-label", l); b.title = l; }
$("#themeBtn").addEventListener("click", () => { const t = themeNow() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t; try { localStorage.setItem("theme-v1", t); } catch (e) {} themeBtn(); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeBtn);
themeBtn();
