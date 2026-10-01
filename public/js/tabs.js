// Tab row: TABS, the URL hash (TSLUG), showTab, arrow keys, and sliding the picked tab into view on narrow screens.
/* ---- tabs ---- */
const TABS = [["board","#tabBoard","#viewBoard"],["dyn","#tabDyn","#viewDyn"],["rand","#tabRand","#viewRand"],["coach","#tabCoach","#viewCoach"],["pipe","#tabPipe","#viewPipe"],["house","#tabHouse","#viewHouse"],["rec","#tabRec","#viewRec"],["slide","#tabSlide","#viewSlide"],["ab","#tabAb","#viewAb"]];
let curTab = "board";
// The open tab lives in the URL hash (#abilities) so a refresh or a shared link reopens it. Board is the bare URL.
const TSLUG = {board:"", dyn:"my-dynasty", rand:"randomizer", coach:"coaches", pipe:"pipelines", house:"house-rules", rec:"recruiting", slide:"sliders", ab:"abilities"};
// When the tab row is too narrow to show all nine (phones, narrow windows), scroll the picked tab to the row's left edge
// so the tabs after it come into view. When everything fits the row can't scroll, so nothing moves.
function tabSlide(b, instant){
  const row = $(".tabs"); if (row.scrollWidth <= row.clientWidth) return;
  const left = row.scrollLeft + b.getBoundingClientRect().left - row.getBoundingClientRect().left - parseFloat(getComputedStyle(row).paddingLeft);
  row.scrollTo({left, behavior: instant || matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
}
function showTab(which, instant){
  curTab = which;
  try { history.replaceState(null, "", TSLUG[which] ? "#" + TSLUG[which] : location.pathname + location.search); } catch (e) {}
  if (which === "rec") recDraw();
  if (which === "dyn") dDraw();
  for (const [k, tb, vw] of TABS) {
    $(vw).hidden = k !== which;
    $(tb).setAttribute("aria-selected", k === which);
    $(tb).tabIndex = k === which ? 0 : -1;
  }
  tabSlide($(TABS.find(t => t[0] === which)[1]), instant);
  setRail();
}
for (const [k, tb] of TABS) $(tb).addEventListener("click", () => showTab(k));
$(".tabs").addEventListener("keydown", e => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const vs = [...document.querySelectorAll(".tabs .tab")].map(b => TABS.find(t => t[1] === "#" + b.id)[0]);
  const i = vs.indexOf(curTab), to = vs[(i + (e.key === "ArrowRight" ? 1 : vs.length - 1)) % vs.length];
  showTab(to); $(TABS.find(t => t[0] === to)[1]).focus({preventScroll: true});
});

// Sticky search rails (Board, Coach Database, Pipelines): publish the open one's height as --railh so the table header and pipeline side panel stick just below it.
const setRail = () => {
  const r = document.querySelector(curTab === "coach" ? "#viewCoach .rail" : curTab === "pipe" ? "#viewPipe .rail" : "#viewBoard .rail");
  if (r && r.offsetHeight) document.documentElement.style.setProperty("--railh", r.offsetHeight + "px");
};
addEventListener("resize", setRail);
setRail();
