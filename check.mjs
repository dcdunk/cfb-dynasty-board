// Smoke test: opens public/index.html in headless Chrome and clicks through every tab.
// Run: node check.mjs   (needs Node 22+ and Google Chrome; no npm install)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Serve the page's folder over local http (like the live site): Chrome blocks reading a linked stylesheet's rules from file://.
const FILE = resolve(process.argv[2] || join(import.meta.dirname, "public/index.html")), ROOT = dirname(FILE);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const path = resolve(ROOT, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path !== ROOT && !path.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(path); res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE = `http://127.0.0.1:${server.address().port}/${basename(FILE)}`;
const profile = mkdtempSync(join(tmpdir(), "board-check-")); // fresh profile = empty localStorage

const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--window-size=1280,900", ...(process.platform === "linux" ? ["--no-sandbox"] : []), "about:blank"]);
const port = await new Promise((ok, fail) => {
  let buf = "";
  chrome.stderr.on("data", d => { buf += d; const m = buf.match(/127\.0\.0\.1:(\d+)\//); if (m) ok(m[1]); });
  chrome.once("exit", () => fail(new Error("Chrome exited:\n" + buf)));
});
const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));

let id = 0; const waiting = new Map(), errors = []; let loaded;
const send = (method, params = {}) => new Promise(r => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
ws.addEventListener("message", ({ data }) => {
  const m = JSON.parse(data);
  if (m.id) return waiting.get(m.id)?.(m);
  if (m.method === "Runtime.exceptionThrown") errors.push("JS error: " + m.params.exceptionDetails.exception?.description);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + m.params.args.map(a => a.value ?? a.description).join(" "));
  if (m.method === "Page.loadEventFired") loaded?.();
  // Every file the page loads from its own folder (css, js, data, icons) must exist.
  if (m.method === "Network.responseReceived" && m.params.response.url.startsWith(PAGE.replace(/[^/]*$/, "")) && m.params.response.status >= 400)
    errors.push(`Missing file: ${m.params.response.url} (${m.params.response.status})`);
});
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
// Never let the test browser start Coach's 1.8 GB AI model download.
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__noAI = true" });
await new Promise(r => { loaded = r; send("Page.navigate", { url: PAGE }); });

// Runs inside the page. Returns a list of failed checks.
const inPage = async () => {
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fails = [], ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const views = { tabBoard: "viewBoard", tabDyn: "viewDyn", tabRand: "viewRand", tabCoach: "viewCoach", tabPlay: "viewPlay", tabPipe: "viewPipe", tabHouse: "viewHouse", tabRec: "viewRec", tabSlide: "viewSlide", tabAb: "viewAb" };
  const open = async tab => {
    $("#" + tab).click(); await wait(50);
    for (const [t, v] of Object.entries(views)) ok($("#" + v).hidden === (t !== tab), `${tab}: #${v} visibility wrong`);
    ok($("#" + tab).getAttribute("aria-selected") === "true", `${tab}: not marked selected`);
    ok($("#" + views[tab]).innerText.trim().length > 50, `${tab}: view looks empty`);
  };

  ok(document.querySelector('link[rel="icon"]'), "Favicon link missing");
  // Theme tokens (Linear design system): both themes resolve, and the wordmark stays Inter at display size.
  // Read the rules in css/site.css themselves: computed colors would depend on the OS light/dark setting.
  const rules = [...[...document.styleSheets].find(s => s.href?.endsWith("/css/site.css")).cssRules];
  const media = rules.find(r => r.media && /prefers-color-scheme: dark/.test(r.media.mediaText));
  const tok = [["light", rules.find(r => r.selectorText === ":root" && r.style.getPropertyValue("--ground")), "#F7F8F8"],
    ["dark (toggle)", rules.find(r => r.selectorText === ':root[data-theme="dark"]'), "#08090A"],
    ["dark (system)", media && [...media.cssRules].find(r => r.selectorText === ':root:not([data-theme="light"])'), "#08090A"]];
  for (const [nm, r, want] of tok) for (const v of ["--ground", "--panel", "--text", "--accent", "--cta", "--on-cta"])
    ok(r && r.style.getPropertyValue(v).trim(), `Theme: ${nm} token block missing ${v}`);
  for (const [nm, r, want] of tok) ok(r?.style.getPropertyValue("--ground").trim() === want, `Theme: ${nm} --ground should be ${want}`);
  // Accent is electric blue; the logo takes the favicon's slate and amber (deeper amber in light mode).
  for (const [nm, r, want] of [[...tok[0].slice(0, 2), "#1F5FD1,#141A20,#B06D0E"], [...tok[1].slice(0, 2), "#5B9BFF,#E5E5E6,#E8A33D"], [...tok[2].slice(0, 2), "#5B9BFF,#E5E5E6,#E8A33D"]])
    ok(["--accent", "--logo", "--logo-em"].map(v => r?.style.getPropertyValue(v).trim()).join() === want, `Theme: ${nm} accent/logo colors should be ${want}`);
  // Light/dark toggle sits next to Coach, flips the theme, saves it, and its label says what a click does.
  { const b = $("#themeBtn"), root = document.documentElement, t0 = root.dataset.theme, eff = () => root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    ok(b && b.nextElementSibling === $("#pOpen") && b.querySelector("svg"), "Theme: toggle should sit just left of the Coach button");
    const before = eff(); b.click();
    ok(eff() !== before && localStorage.getItem("theme-v1") === eff() && b.getAttribute("aria-label") === `Switch to ${before} mode`, `Theme: toggle should flip ${before}, saved ${localStorage.getItem("theme-v1")}`);
    ok(getComputedStyle(document.body).backgroundColor === (eff() === "dark" ? "rgb(8, 9, 10)" : "rgb(247, 248, 248)"), "Theme: page colors should follow the toggle");
    b.click(); ok(eff() === before, "Theme: second click should flip back");
    localStorage.removeItem("theme-v1"); if (t0) root.dataset.theme = t0; else delete root.dataset.theme; }
  const wm = getComputedStyle($(".wordmark"));
  ok(/^Inter/.test(wm.fontFamily) && parseFloat(wm.fontSize) >= 36 && getComputedStyle($(".wordmark em")).fontStyle === "normal", `Theme: wordmark is ${wm.fontFamily} ${wm.fontSize}`);
  // Navigation: one row of ten tabs, all visible; arrow keys move along the row and wrap.
  const tabs = () => [...$$(".tabs .tab")].filter(b => !b.hidden && b.offsetParent).map(b => b.id).join(",");
  ok(tabs() === "tabDyn,tabAb,tabCoach,tabHouse,tabPlay,tabBoard,tabPipe,tabRand,tabRec,tabSlide" && !$("#viewBoard").hidden && curTab === "board", `Nav: expected all ten tabs with Board open, got ${tabs()}`);
  ok(!$("#tabGroups") && !$("#subtabs") && $(".tabs").getAttribute("role") === "tablist", "Nav: grouped navigation should be gone");
  $("#tabAb").click(); await wait(50); ok(!$("#viewAb").hidden && $("#tabAb").getAttribute("aria-selected") === "true", "Nav: clicking Abilities should open it");
  // Tab order: My Dynasty first, then alphabetical (owner, Oct 2026)
  ok([...$$(".tabs .tab")].map(b => b.textContent).join("|") === "My Dynasty|Abilities|Coach Database|House Rules|Player Database|Program Database|Program Pipelines|Randomizer|Recruiting & NIL|Sliders", "Nav: tabs should be My Dynasty, then A to Z");
  $("#tabSlide").click(); await wait(50);
  $("#tabSlide").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(curTab === "dyn", `Nav: ArrowRight from Sliders should wrap to My Dynasty, got ${curTab}`);
  $("#tabDyn").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(curTab === "ab", `Nav: ArrowRight from My Dynasty should go to Abilities, got ${curTab}`);
  ok(tabs().split(",").length === 10, "Nav: tabs should stay visible after switching");
  // Phone tab bar: four pinned tabs + More menu with every tab, hidden on desktop; picking a menu-only tab lights up More.
  ok(getComputedStyle($(".mbar")).display === "none", "Phone bar: should be hidden at desktop width");
  ok([...$$(".mpill [data-mt]")].map(b => b.dataset.mt).join() === "dyn,board,play,ab" && $$("#mMenu [data-mt]").length === 6 && !$("#mMenu [data-mt=board]"), "Phone bar: expected 4 pinned tabs and only the other 6 in the menu");
  $("#mMore").click(); ok(!$("#mMenu").hidden, "Phone bar: More should open the menu");
  $("#mMenu [data-mt=rand]").click(); ok(curTab === "rand" && $("#mMenu").hidden && $("#mMore").classList.contains("on"), "Phone bar: menu tab should open, close menu, light More");
  $(".mpill [data-mt=board]").click(); ok(curTab === "board" && $(".mpill [data-mt=board]").classList.contains("on") && !$("#mMore").classList.contains("on"), "Phone bar: pinned tab should open and highlight");
  // Editable bar: pick tabs in edit mode (max 4, min 1, order picked), saved in mbar-v1, reset restores the default.
  $("#mMore").click(); $("#mMenu [data-me=edit]").click();
  ok(!$("#mMenu").hidden && $$("#mMenu [data-mp]").length === 10, "Phone bar: Edit tab bar should list all 10 tabs with checks");
  $("#mMenu [data-mp=ab]").click(); $("#mMenu [data-mp=slide]").click(); $("#mMenu [data-mp=house]").click();
  ok(!$("#mMenu").hidden && [...$$(".mpill [data-mt]")].map(b => b.dataset.mt).join() === "dyn,board,play,slide" && JSON.parse(localStorage.getItem("mbar-v1")).join() === "dyn,board,play,slide", "Phone bar: swap Abilities for Sliders (and ignore a 5th pick), saved");
  for (const k of ["dyn", "board", "play", "slide"]) $(`#mMenu [data-mp=${k}]`).click();
  ok($$(".mpill [data-mt]").length === 1, "Phone bar: at least one tab should stay in the bar");
  $("#mMenu [data-me=reset]").click(); ok([...$$(".mpill [data-mt]")].map(b => b.dataset.mt).join() === "dyn,board,play,ab", "Phone bar: reset should restore the default four");
  $("#mMenu [data-me=done]").click(); ok($("#mMenu").hidden && $("#mMenu [data-me=edit]"), "Phone bar: Done should close and leave edit mode");
  ok(BAKKEYS.includes("mbar-v1"), "Phone bar: tab choice should be backed up and synced");
  // Pop-ups own the scroll: the page behind is locked while one is open, and a tall card fits on screen.
  ok(getComputedStyle(document.documentElement).overflow !== "hidden", "Scroll lock: page should scroll with nothing open");
  await ccCard("Georgia", "Kirby Smart"); await wait(50);
  ok(getComputedStyle(document.documentElement).overflow === "hidden" && $("#plc").getBoundingClientRect().bottom <= innerHeight, "Scroll lock: an open card should lock the page and fit on screen");
  $("#plc").close(); openTeam("Oregon"); await wait(50); ok(getComputedStyle(document.documentElement).overflow === "hidden", "Scroll lock: the dossier should lock the page");
  closeTeam(); await wait(250); ok(getComputedStyle(document.documentElement).overflow !== "hidden", "Scroll lock: closing should unlock the page");
  // Dossier: centered card on desktop; ratings, prestige, titles, roster avg, NIL and stadium live in the header strip.
  openTeam("Oregon"); await wait(260); { const r = $("#dossier").getBoundingClientRect(), t = DATA.find(x => x.n === "Oregon");
    ok(Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && r.top >= 30 && r.bottom <= innerHeight - 30, "Dossier: should be a centered card on desktop");
    ok($$("#dfacts > div").length === 8 && $("#dfacts").textContent.includes(t.sn) && $("#dfacts").textContent.includes(fmt(t.nt)) && !$("#dbody .trio") && $("#dbody h3").textContent === "Coaching staff", "Dossier: header strip holds the stats; body starts with the staff"); }
  // No stat in the strip may be cut off: the longest stadium name must wrap, not clip.
  { const t = [...DATA].sort((a, b) => (b.sn + b.sl).length - (a.sn + a.sl).length)[0]; openTeam(t.n); await wait(50);
    ok([...$$("#dfacts b, #dfacts .sub")].every(e => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).textOverflow !== "ellipsis"), `Dossier: header strip text should wrap, not clip (${t.sn})`); }
  closeTeam(); await wait(250);
  // Bottom sheets: every sheet gets one grab handle (shown only on phones, where dragging it down closes the sheet).
  ok(["#dossier", "#plc", "#sy", "#ks", "#gs"].every(id => $$(`${id} > .grab`).length === 1) && getComputedStyle($(".grab")).display === "none", "Sheets: each sheet needs one grab handle, hidden on desktop");
  // Narrow row (phone width): picking a tab slides it to the left edge so later tabs come into view.
  const tRow = $(".tabs"); tRow.style.width = "340px"; $("#tabCoach").click(); await wait(700);
  const gap = $("#tabCoach").getBoundingClientRect().left - tRow.getBoundingClientRect().left - parseFloat(getComputedStyle(tRow).paddingLeft);
  ok(tRow.scrollLeft > 0 && Math.abs(gap) < 2, `Nav: on a narrow tRow the picked tab should slide to the left edge (scrollLeft ${tRow.scrollLeft}, off by ${gap}px)`);
  $("#tabDyn").click(); await wait(700); ok(tRow.scrollLeft === 0, `Nav: picking the first tab should slide the tRow back, got ${tRow.scrollLeft}`);
  tRow.style.width = ""; $("#tabBoard").click(); await wait(50);

  await open("tabBoard");
  ok($$("#rows tr").length >= 100, `Board: expected 100+ team rows, got ${$$("#rows tr").length}`);
  $("#rows tr").click(); await wait(100);
  ok($("#dname").innerText.trim(), "Board: team dossier did not open");
  $("#dclose").click();
  const find = (sel, text) => { $(sel).value = text; $(sel).dispatchEvent(new Event("input")); };
  find("#q", "tide");
  ok($$("#rows tr").length === 1 && $("#rows tr").dataset.n === "Alabama", "Board: nickname search 'tide' should leave only Alabama");
  ok($("#rows mark.hit")?.innerText === "Tide", "Board: match not highlighted");
  find("#q", "uga");
  ok([...$$("#rows tr")].some(r => r.dataset.n === "Georgia"), "Board: abbreviation 'uga' should find Georgia");
  find("#q", "texas a&m");
  ok($("#rows tr")?.dataset.n === "Texas A&M", "Board: 'texas a&m' should find Texas A&M");
  $("#q").value = "zzzz"; $("#q").dispatchEvent(new Event("input"));
  ok($$("#rows tr").length === 0, "Board: search did not filter");
  $("#reset").click();

  await open("tabRand");
  // Main actions sit above the long content so they're visible without scrolling
  ok($("#roll").compareDocumentPosition($("#rFilters")) & Node.DOCUMENT_POSITION_FOLLOWING, "Randomizer: Pick my program should come before the filters");
  ok($("#hdeal").compareDocumentPosition($("#hstrict")) & Node.DOCUMENT_POSITION_FOLLOWING, "House rules: Deal should come before Strictness");
  ok($("#rFilters").hidden, "Randomizer: filters should be hidden in Completely random");
  $('[data-mode="filt"]').click(); ok(!$("#rFilters").hidden, "Randomizer: Use my filters should show the filters");
  $('[data-mode="any"]').click();
  $("#roll").click(); await wait(2000);
  ok($("#result").innerText.trim().length > 0, "Randomizer: roll produced no result");

  await open("tabCoach");
  ok($$("#crows tr").length > 0, "Coaches: no coach rows");
  const coach = $("#crows tr .team").innerText, part = coach.slice(0, 4);
  $("#cq").value = part.toLowerCase(); $("#cq").dispatchEvent(new Event("input"));
  ok([...$$("#crows .team")].every(t => t.innerText.toLowerCase().includes(part.toLowerCase())), "Coaches: search did not filter by name");
  ok($("#crows mark.hit")?.innerText.toLowerCase() === part.toLowerCase(), "Coaches: match not highlighted");
  $("#cq").value = "temple"; $("#cq").dispatchEvent(new Event("input"));
  ok($$("#crows tr").length >= 3 && [...$$("#crows tr")].every(r => r.dataset.n === "Temple"), "Coaches: school search 'temple' should list Temple's staff");
  // Coach card: a row opens the coach (not the dossier) with rank, age, every bought ability (CTREE) and the school's staff; staff and links work.
  $("#crows tr").click(); const cc0 = COACHES.find(c => c.team === "Temple" && c.name === $("#crows tr").dataset.c); await ccTree(); await wait(30);
  ok($("#plc").open && !picked && $("#plcN").textContent.includes(cc0.name) && /of \d+ (head coache|offensive coordinator|defensive coordinator)s by level/.test($("#plcB").textContent) && $$("#plcB .cc-st").length === 3, "Coach card: a Coach Database row should open the coach card");
  const cc0T = CTREE.c["Temple|" + cc0.name]; ok(cc0T && $$("#plcB .cc-arch").length === Object.keys(cc0T[1]).length && $("#plcB .cc-arch .cc-h").textContent.startsWith(cc0.arch) && $("#plcB .cc-arch").open && $$("#plcB .cc-arch[open]").length === 1 && $("#plcB .plc-top").textContent.includes(String(cc0.age) + "Age"), "Coach card: should show age and every owned archetype, main one first");
  ok(DATA.every(t => t.st.every(c => CTREE.c[t.n + "|" + c[1]])) && Object.values(CTREE.c).every(c => Object.keys(c[1]).every(a => CARCH.some(x => x.n === a))), "Coach data: every coach needs ability data, and every archetype in it must be in CARCH");
  const ccO = $$("#plcB .cc-st")[1]; ccO.click(); ok($("#plcN").textContent.includes(ccO.dataset.coach), "Coach card: tapping another staff member should open them");
  // Kirby Smart: 73 abilities in 7 archetypes (TeamCrafters 9/25/26); position abilities collapse into one row with group chips; real icons where we have them.
  await ccCard("Georgia", "Kirby Smart"); ok(/73 bought, across 7 archetypes/.test($("#plcB").textContent) && /Specialty: Defensive Line/.test($("#plcB").textContent), "Coach card: Kirby Smart should show 73 abilities in 7 archetypes and his specialty");
  ok([...$$("#plcB .cc-arch summary")].map(x => x.textContent.split(" ")[0]).join() === "CEO,Recruiter,Elite,Tactician,Scheme,Strategist,Program", "Coach card: main archetype first, then each base followed by its elite");
  const ccAL = [...$$("#plcB .ab-nm")].find(b => b.textContent === "Advanced Look"); ok(ccAL && [...ccAL.parentNode.querySelectorAll(".cc-pos i")].map(i => i.textContent).join() === "DB,DL,K/P,LB,RB" && $("#plcB img.ab-ico[src$='c/gasoline.png']"), "Coach card: grouped position chips and coach ability icons");
  const ccTop = COACHES.filter(c => c.role === "HC").sort((a, b) => b.lvl - a.lvl)[0]; await ccCard(ccTop.team, ccTop.name); ok($("#plcB").textContent.includes("#1"), "Coach card: the top head coach should rank #1");
  ok(COACHES.every(c => CARCH.some(a => a.n === c.arch)), "Coach card: every coach archetype should map to CARCH");
  ok(!COACHES.some(c => c.arch === "Schemer") && COACHES.filter(c => c.arch === "Tactician").length === 10, "Coach data: the old Schemer name should be Tactician");
  await ccCard(ccTop.team, ccTop.name); $("#plcB [data-arch]").click(); ok(!$("#plc").open && curTab === "ab" && abM === "coach" && CGROUP.find(g => g[0] === abC)[1].includes(ccTop.arch), "Coach card: Abilities link should open that archetype");
  openTeam("Temple"); await wait(50); $("#dbody tr[data-coach]").click(); ok($("#plc").open && $("#plcN").textContent.includes($("#dbody tr[data-coach]").dataset.coach), "Coach card: dossier staff row should open the coach card");
  $("#plcB [data-team]").click(); await wait(50); ok(!$("#plc").open && picked === "Temple", "Coach card: Open team should show the dossier"); closeTeam(); await wait(50); showTab("coach");
  // Player Database: every roster player, filters stack, sorting, paging, a row opens the team, global search finds players.
  ok(typeof RATINGS === "undefined", "Players: other tabs should never load the ratings file");
  await open("tabPlay"); await plRatings(); await wait(50);
  const plRows = () => [...$$("#plrows tr")];
  ok(PLAYERS.length === DATA.reduce((n, t) => n + t.r.length, 0) && $("#plN").textContent === fmt(PLAYERS.length) && plRows().length === 200 && !$("#plmore").hidden,
    `Players: should count every player and draw the first 200, got ${$("#plN").textContent} / ${plRows().length}`);
  ok(+plRows()[0].cells[5].textContent >= +plRows()[199].cells[5].textContent, "Players: default sort should be overall, high to low");
  $("#plmore").click(); ok(plRows().length === 400, "Players: Show more should add 200 rows");
  // EA position names: SAM/MIKE/WILL, LEDG/REDG, and separate FS and SS chips.
  ok(new Set(PLAYERS.map(p => p.pos)).size === 21 && ["SAM","MIKE","WILL","LEDG","REDG"].every(x => PLAYERS.some(p => p.pos === x)) && !PLAYERS.some(p => ["LE","RE","LOLB","MLB","ROLB"].includes(p.pos)),
    "Players: positions should use EA names (SAM, MIKE, WILL, LEDG, REDG)");
  ["LEDG","REDG","DT","SAM","MIKE","WILL","FS","SS","K","P"].forEach(x => ok($(`#plpos [data-p="${x}"]`), `Players: missing ${x} chip`));
  $('#plpos [data-p="FS"]').click(); ok(plRows().length > 0 && plRows().every(r => r.cells[0].textContent === "FS"), "Players: FS chip should show only free safeties");
  $('#plpos [data-p="QB"]').click(); $("#plconf").value = "SEC"; $("#plconf").dispatchEvent(new Event("change"));
  $("#plyr").value = "SO"; $("#plyr").dispatchEvent(new Event("change"));
  const qbs = PLAYERS.filter(p => p.pos === "QB" && p.conf === "SEC" && p.yr.startsWith("SO"));
  ok(plRows().length === qbs.length && qbs.length > 0 && plRows().every(r => r.cells[0].textContent === "QB" && r.cells[3].textContent === "SEC" && r.cells[4].textContent.startsWith("SO")),
    `Players: QB + SEC + SO filters should stack, got ${plRows().length} vs ${qbs.length}`);
  $('#plhrow [data-k="spd"]').click(); ok(+plRows()[0].cells[6].textContent === Math.max(...qbs.map(p => p.spd)), "Players: clicking Spd should sort by speed");
  $('#plhrow [data-k="yr"]').click(); $("#plyr").value = ""; $("#plyr").dispatchEvent(new Event("change"));
  const yrs = plRows().map(r => ["FR", "SO", "JR", "SR"].indexOf(r.cells[4].textContent.slice(0, 2)));
  ok(yrs.every((y, i) => !i || y >= yrs[i - 1]) && yrs[0] === 0 && yrs.at(-1) === 3, `Players: year should sort in class order FR to SR, got ${yrs.join("")}`);
  const star = PLAYERS.find(p => p.dev === 3);
  plOpen(star.name); ok(curTab === "play" && plRows().some(r => r.cells[1].textContent.includes(star.name)) && $("#plconf").value === "" && plPos === "All", "Players: plOpen should show that player with filters cleared");
  // Extended ratings (EA, js/data/ratings.js): load on demand, a row opens the player card, the card's button opens the team.
  ok(typeof RATINGS === "object", "Players: opening the tab should have loaded the ratings file");
  const sm = PLAYERS.find(p => p.name === star.name && p.team === star.team);
  await plCard(sm.i); ok($("#plc").open, "Players: a card should open");
  ok(PLGRP.flatMap(g => g[1]).sort().join() === [...RATINGS.k].sort().join(), "Players: every rating key should be in exactly one card group");
  const rr = RATINGS.p[sm.team]?.[sm.name];
  ok(rr && rr[5].length === RATINGS.k.length * 2 && $$("#plcB .plc-r").length === RATINGS.k.length && $("#plcB .plc-top b").textContent === String(rr[0]),
    `Players: card for ${sm.name} should show all ${RATINGS.k.length} ratings and EA's overall`);
  ok($("#plcB h3").textContent === PLFIRST[sm.pos], `Players: card should lead with the ${PLFIRST[sm.pos]} group for a ${sm.pos}`);
  const nRated = Object.values(RATINGS.p).reduce((n, o) => n + Object.keys(o).length, 0);
  ok(nRated > 10800 && Object.keys(RATINGS.p).length === DATA.length, `Players: ratings should cover 10,800+ players on all teams, got ${nRated}`);
  $("#plcB [data-team]").click(); await wait(50); ok(!$("#plc").open && $("#dname").innerText.trim() === sm.team, "Players: Open team on the card should open the dossier"); closeTeam(); await wait(50);
  plOpen(""); plRows()[0].click(); await wait(80); ok($("#plc").open && $("#plcN").textContent.includes(PLAYERS[+plRows()[0].dataset.i].name), "Players: clicking a row should open that player's card"); $("#plc").close();
  // Player archetypes (TeamCrafters, tools/player-archetypes.mjs): most players have one, every one is a real archetype,
  // and the card's archetype link opens that archetype on Abilities.
  ok(PLAYERS.filter(p => p.arch).length > PLAYERS.length * 0.9 && PLAYERS.every(p => !p.arch || ABARCH.some(a => a[1] === p.arch)), "Players: 90%+ should have an archetype, all known to Abilities");
  { const lt = PLAYERS.find(p => p.pos === "LT" && p.arch && ABARCH.some(a => a[0] === "OT" && a[1] === p.arch)); await plCard(lt.i);
    $("#plcB .plc-arch").click(); await wait(50);
    ok(curTab === "ab" && abM === "player" && abP === "OT" && !$("#plc").open, `Players: archetype link should open Abilities on OT, got ${curTab} ${abP}`);
    showTab("play"); }
  ok($("#plist .parch") || $$(".parch").length, "Players: archetype should show under player names");
  // Archetype filter: options follow the position chip, filters the list, and resets when the position changes.
  $('#plpos [data-p="LEDG"]').click(); await wait(30);
  const eo = [...$("#plarch").options].map(o => o.value).filter(Boolean);
  $("#plarch").value = "Speed Rusher"; $("#plarch").dispatchEvent(new Event("change")); await wait(30);
  const sr = plList();
  ok(eo.includes("Speed Rusher") && !eo.includes("Pocket Passer") && sr.length > 0 && sr.every(p => p.pos === "LEDG" && p.arch === "Speed Rusher") && /arch=Speed/.test(location.hash), `Players: archetype filter should list only LEDG Speed Rushers, got ${sr.length}`);
  $('#plpos [data-p="QB"]').click(); await wait(30);
  ok($("#plarch").value === "" && [...$("#plarch").options].some(o => o.value === "Pocket Passer"), "Players: changing position should reset an archetype that doesn't fit");
  $('#plpos [data-p="All"]').click(); await wait(30);
  const unrated = PLAYERS.find(p => !RATINGS.p[p.team]?.[p.name]); await plCard(unrated.i); ok(/doesn't list/.test($("#plcB").textContent), "Players: unrated players should say so"); $("#plc").close();
  // Roster rows in the dossier open the player card (dossier stays underneath).
  openTeam("Georgia"); await wait(50); { const tr = $("#dbody tr[data-pl]"); tr.click(); await wait(80);
    ok($("#plc").open && $("#plcN").textContent.includes(tr.dataset.pl) && picked === "Georgia", "Dossier: clicking a roster player should open their card"); $("#plc").close(); closeTeam(); await wait(250); }
  // Ratings already loaded (by that card) but the Players header not built yet: opening Players must still add the rating columns.
  $$("#plhrow [data-k^='r:']").forEach(x => x.remove()); plShow(); await wait(80); ok($("#plhrow [data-k^='r:']"), "Players: rating columns should appear even if a dossier card loaded the ratings first");
  // Every rating is a sortable column after Spd; Pos and Player stay pinned while the table scrolls sideways.
  const nCols = 7 + RATINGS.k.length - 1;
  ok($$("#plhrow th").length === nCols && plRows()[0].cells.length === nCols, `Players: expected ${nCols} columns (all ratings but speed), got ${$$("#plhrow th").length}`);
  $('#plhrow [data-k="r:press"]').click(); await wait(50);
  const prc = [...$$("#plhrow th")].findIndex(th => th.dataset.k === "r:press"), pr = plRows().map(r => +r.cells[prc].textContent);
  ok(pr[0] === Math.max(...PLAYERS.map(p => plStat(p, "press") ?? -1)) && pr.every((v, i) => !i || v <= pr[i - 1]), `Players: clicking PRS should sort by press, high to low, got ${pr.slice(0, 3)}`);
  const sc = $(".plscroll"); sc.scrollLeft = 2000; await wait(30);
  ok(sc.scrollLeft > 0 && Math.abs(plRows()[0].cells[1].getBoundingClientRect().left - sc.getBoundingClientRect().left - 56) < 2, "Players: the Player column should stay pinned when scrolling sideways");
  sc.scrollLeft = 0; $('#plhrow [data-k="ovr"]').click(); await wait(30);
  // Program dropdown shows one team's roster; Ovr is EA's current-week overall where EA lists the player.
  plOpen(""); $("#plteam").value = "Temple"; $("#plteam").dispatchEvent(new Event("change"));
  const tem = DATA.find(t => t.n === "Temple").r.length;
  ok($$("#plteam option").length === DATA.length + 1 && plRows().length === Math.min(tem, 200) && plRows().every(r => r.cells[2].textContent === "Temple") && $("#plN").textContent === String(tem),
    `Players: picking Temple should list its ${tem} players, got ${plRows().length}`);
  ok(plRows().every(r => { const p = PLAYERS[+r.dataset.i], e = RATINGS.p[p.team]?.[p.name]; return +r.cells[5].textContent === (e ? e[0] : p.ovr0); }), "Players: Ovr should be EA's overall, or the roster value when EA doesn't list the player");
  ok(plRows().every(r => { const p = PLAYERS[+r.dataset.i], e = RATINGS.p[p.team]?.[p.name]; return +r.cells[6].textContent === (e ? plStat(p, "speed") : p.spd0); }), "Players: Spd should be EA's speed, or the roster value when EA doesn't list the player");
  ok(PLAYERS.some(p => p.ovr0 != null && p.ovr !== p.ovr0), "Players: some overalls should have changed to EA's current week");
  plOpen(""); ok($("#plteam").value === "", "Players: plOpen should clear the program filter");
  $("#plq").value = "zzqx"; $("#plq").dispatchEvent(new Event("input")); ok(!$("#plempty").hidden && $("#plmore").hidden, "Players: no matches should show the empty message");
  plOpen("");
  ok($("#crows td.sub mark.hit")?.innerText === "Temple", "Coaches: school match not highlighted");
  $("#cq").value = ""; $("#cq").dispatchEvent(new Event("input"));

  await open("tabPipe");
  const before = $("#pq").value; $("#pnext").click(); await wait(50);
  ok($("#pq").value !== before, "Pipelines: next team button did nothing");
  ok($$("#pmap path").length > 40, "Pipelines: map did not draw");
  // With every region label shown at once (worst case), no two may overlap.
  const labs = [...$$("#pmap .lbl")]; labs.forEach(l => l.removeAttribute("hidden"));
  const boxes = labs.map(l => [l.dataset.lab, l.getBBox()]), hits = [];
  boxes.forEach(([a, p], i) => boxes.slice(i + 1).forEach(([b, q]) => {
    if (p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height) hits.push(`${a}/${b}`); }));
  ok(!hits.length, `Pipelines: overlapping map labels: ${hits.join(", ")}`);
  labs.forEach(l => l.setAttribute("hidden", "")); $("#pnext").click(); $("#pprev").click();

  // Program picker (shared by Pipelines and House rules)
  const type = (sel, text) => { const i = $(sel); i.focus(); i.value = text; i.dispatchEvent(new Event("input")); };
  const opts = sel => [...$(sel).closest(".search").querySelectorAll(".cb [data-n]")].map(li => li.dataset.n);
  type("#pq", "ore");
  ok(opts("#pq")[0] === "Oregon" && opts("#pq")[1] === "Oregon State", `Picker: "ore" should list Oregon first, got ${opts("#pq").slice(0, 3)}`);
  ok(!opts("#pq").includes("Air Force"), "Picker: unrelated teams in results");
  $("#pq").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  $("#pq").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  ok($("#pq").value === "Oregon State", `Picker: arrow + Enter should pick Oregon State, got ${$("#pq").value}`);
  ok($("#pq").closest(".search").querySelector(".cb").hidden, "Picker: list did not close after picking");
  type("#pq", "zzqx");
  ok($("#pq").closest(".search").querySelector(".cb-none"), "Picker: no empty-state message");
  $("#pq").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  ok($("#pq").value === "Oregon State", "Picker: Escape should restore current team");
  // Global search: Ctrl+K opens, finds each kind of thing, Enter jumps there
  const gs = async (q, keys = []) => { dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })); await wait(20);
    ok($("#gs").open, "Search: Ctrl+K should open the dialog"); type("#gsq", q);
    for (const k of [...keys, "Enter"]) $("#gsq").dispatchEvent(new KeyboardEvent("keydown", { key: k })); await wait(50);
    ok(!$("#gs").open, `Search: Enter on "${q}" should close the dialog`); };
  const gsTop = q => { $("#gsq").value = q; $("#gsq").dispatchEvent(new Event("input")); return $("#gsl [data-i] .cb-n")?.innerText; };
  $("#gs").showModal(); ok(gsTop("") === "My Dynasty" && $$("#gsl [data-i]").length === 10, "Search: empty query should list the ten tabs");
  ok(gsTop("ore") === "Oregon", `Search: "ore" should rank Oregon first, got ${gsTop("ore")}`);
  ok(gsTop("zzqx") === undefined && $("#gsl .cb-none"), "Search: no empty-state message"); $("#gs").close();
  await gs("slid"); ok(curTab === "slide", `Search: "slid" should open Sliders, got ${curTab}`);
  await gs("georgia"); ok($("#dname").innerText.trim() === "Georgia", "Search: 'georgia' should open the Georgia dossier"); closeTeam(); await wait(50);
  await gs("portal king"); ok(curTab === "ab" && abM === "coach" && $("#abQ").value === "Portal King", "Search: coach ability should open Abilities in coach mode");
  await gs("dot!"); ok(curTab === "ab" && abM === "player" && $("#abQ").value === "Dot!", "Search: player ability should open Abilities in player mode");
  await gs("clutch kicker"); ok(curTab === "ab" && abM === "ment" && !$("#abMental").hidden && $("#abQ").value === "Clutch Kicker", "Search: mental ability should open the Mental page");
  const gsC = COACHES[0].name; await gs(gsC); ok($("#plc").open && $("#plcN").textContent.includes(gsC), `Search: coach ${gsC} should open their coach card`); $("#plc").close();
  await gs("elusive bruiser"); ok(curTab === "ab" && abM === "player" && abP === "HB" && $("#abQ").value === "", `Search: player archetype should open Abilities on HB, got ${abM} ${abP}`);
  await gs("master motivator"); ok(curTab === "ab" && abM === "coach" && abC === "Motivator", `Search: coach archetype should open the Motivator group, got ${abM} ${abC}`);
  abP = "QB"; abC = "Recruiter";
  await gs("pipeline purist"); ok(curTab === "house", "Search: house rule should open House Rules");
  // Keyboard shortcuts panel: ? opens it (not while typing), it lists every group, the close button works, and search finds it.
  $("#hq").focus(); dispatchEvent(new KeyboardEvent("keydown", { key: "?" })); ok(!$("#ks").open, "Shortcuts: ? typed in a text box should not open the panel"); $("#hq").blur();
  dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
  ok($("#ks").open && [...$$("#ksL h3")].map(h => h.textContent).join("|") === "Anywhere|Tabs|Tables and team details|Search and program boxes|Coach" && $$("#ksL kbd").length > 15, "Shortcuts: ? should open the full list");
  $("#ksX").click(); ok(!$("#ks").open, "Shortcuts: close button should close it");
  await gs("keyboard"); ok($("#ks").open, "Shortcuts: searching 'keyboard' should open the panel"); $("#ks").close();
  const uniq = PLAYERS.find(p => p.dev === 3 && PLAYERS.filter(q => norm(q.name) === norm(p.name)).length === 1 && !COACHES.some(c => norm(c.name).startsWith(norm(p.name))) && !DATA.some(t => norm(t.n).startsWith(norm(p.name))));
  await gs(uniq.name); ok(curTab === "play" && $("#plq").value === uniq.name && $$("#plrows tr").length >= 1, `Players: global search for ${uniq.name} should open Player Database`);
  plOpen(""); showTab("board");
  $("#cq").value = ""; cQuery = ""; cDraw(); $("#abQ").value = ""; abM = "player"; abDraw(); showTab("board");

  await open("tabHouse");
  type("#hq", "tide");
  ok(opts("#hq")[0] === "Alabama", `Picker: nickname search "tide" should find Alabama, got ${opts("#hq")[0]}`);
  $("#hq").closest(".search").querySelector('.cb [data-n="Alabama"]').dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  ok($("#hq").value === "Alabama", "Picker: clicking a team did not select it in House rules");
  $("#hdeal").click(); await wait(50);
  ok($("#hbook").innerText.trim().length > 0, "House rules: dealing produced no rules");
  ok(localStorage.getItem("house-v1"), "House rules: state was not saved");
  ok($("#hbook .bhead + .bfoot") && $("#hbook .bfoot ~ .rules"), "House rules: action buttons should sit between the header and the rules");
  const hm = $("#hbook .hmap");
  if (hm) ok([...hm.querySelectorAll(".on")].some(e => /--t\d/.test(e.getAttribute("style") || "")) && hm.querySelector(".hleg .sw"),
    "House rules: map should be colored by pipeline tier with a legend");

  await open("tabRec");
  ok($("#rq").value === $("#hq").value, `Recruiting: linked by default, should show House rules team ${$("#hq").value}, got ${$("#rq").value}`);
  const recSecs = [...$$("#recGrid .rec-sh")].map(h => h.childNodes[1].textContent);
  ok(recSecs.join("|") === "The program|Where to recruit|What to pitch|Spending and year one|Hour costs", `Recruiting: sections out of order: ${recSecs}`);
  type("#rq", "georgia"); $("#rq").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  ok($("#rq").value === "Georgia" && $("#hq").value === "Georgia", "Recruiting: while linked, picking Georgia should also switch House rules");
  ok($("#recGrid .kpis .big").innerText === "5★" && $("#recGrid").innerText.includes("~1,000") && $("#recGrid .arch").innerText.toLowerCase() === "blue blood", "Recruiting: Georgia should be a 5★ blue blood with ~1,000 hours");
  ok($$("#recGrid .sw").length > 0 && $("#recGrid .sw").style.background.includes("--t"), "Recruiting: pipeline tier squares missing");
  const sec4 = () => [...$$("#recGrid .rec-sec")][3].innerText;
  const g4 = sec4(); recPick("Temple"); const t4 = sec4(); recPick("Georgia");
  ok(g4 !== t4 && t4.includes("Temple") && /Power 4 schools to poach/.test(t4) && /Retention first/.test(g4),
    "Recruiting: section 4 should be program-specific (Georgia retention-first, Temple poaching warning)");
  $("#rLink").click();
  ok($("#rLink").getAttribute("aria-checked") === "false", "Recruiting: link toggle did not turn off");
  type("#rq", "temple"); $("#rq").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  ok($("#rq").value === "Temple" && $("#hq").value === "Georgia", "Recruiting: unlinked pick should not change House rules");
  $("#rLink").click();
  ok($("#rq").value === "Georgia", "Recruiting: relinking should snap back to the House rules team");
  // My Dynasty: save from House rules, view rules + pipelines + recruiting plan, rename, edit round trip, archive and restore.
  await open("tabDyn");
  ok($("#dView [data-go]") && !$$("#dList [data-d]").length, "My Dynasty: empty state should point to House Rules");
  $("#dNew").click(); await wait(50);
  ok($$("#dList [data-d]").length === 1 && $("#dName").value === "Georgia Bulldogs", `My Dynasty: saving should add Georgia Bulldogs, got ${$("#dName")?.value}`);
  const dSecs = [...$$("#dView .rec-sh")].map(h => h.childNodes[1].textContent);
  ok(dSecs.join("|") === "House rules|The program|Pipelines|What to pitch|Spending and year one|Hour costs", `My Dynasty: sections wrong: ${dSecs}`);
  ok($$("#dView .rule").length === H.rules.length && H.rules.length > 0, "My Dynasty: should list the saved house rules");
  const uga = DATA.find(t => t.n === "Georgia");
  ok($$("#dView .rec-where tr").length === uga.pl.filter(p => p[1] > 0).length, "My Dynasty: should list every active pipeline");
  $("#dName").value = "My Dawgs"; $("#dName").dispatchEvent(new Event("change", { bubbles: true }));
  ok($("#dList b").textContent === "My Dawgs" && JSON.parse(localStorage.getItem("dyn-v1")).list[0].name === "My Dawgs", "My Dynasty: rename not saved");
  await open("tabHouse"); hSetTeam("Temple"); $("#hdyn").click(); await wait(50);
  ok(curTab === "dyn" && $$("#dList [data-d]").length === 2 && $("#dName").value === "Temple Owls", "My Dynasty: Save to My Dynasty from House rules should add Temple and switch tabs");
  const n0 = D.list[0].rules.length;
  $("#dEdit").click(); await wait(50);
  ok(curTab === "house" && $("#hq").value === "Temple" && !$("#hdupd"), "My Dynasty: Edit should load Temple into House rules");
  $('#hbook [data-act="del"]').click(); await wait(50);
  $("#hdupd").click(); await wait(50);
  ok(D.list[0].rules.length === n0 - 1 && !$("#hdupd"), "My Dynasty: Update dynasty should save the edited rules");
  await open("tabDyn");
  $('#dList [data-d]').click(); $("#dArch").click(); await wait(50);
  ok($$("#dList [data-d]").length === 1 && /Archived \(1\)/.test($("#dSeg").textContent), "My Dynasty: archiving should move it out of the active list");
  $('#dSeg [data-dseg="1"]').click(); await wait(50);
  ok($$("#dList [data-d]").length === 1 && /Archived dynasty/.test($("#dView").textContent) && !$("#dEdit"), "My Dynasty: archive list should show it read-only");
  $("#dArch").click(); await wait(50);
  ok($$("#dList [data-d]").length === 2 && /Active \(2\)/.test($("#dSeg").textContent), "My Dynasty: restore should bring it back to active");
  // Backup and restore: the file holds the saved keys (not Coach's chat), bad files are refused, cancel changes nothing, restore replaces.
  ok($("#dBackup") && $("#dRestore") && $("#viewDyn").contains($("#dBackup")), "Backup: buttons should be on the My Dynasty tab");
  const bk = dBackupData(), bkText = JSON.stringify(bk);
  ok(bk.app === "cfb-dynasty-board" && JSON.parse(bk.data["dyn-v1"]).list.length === 2 && "house-v1" in bk.data && !("coach-v1" in bk.data), `Backup: file contents wrong: ${Object.keys(bk.data)}`);
  ok(dReadBackup("not json").err && dReadBackup('{"app":"other","data":{}}').err && dReadBackup(JSON.stringify({app:"cfb-dynasty-board", data:{"dyn-v1":"{bad"}})).err, "Backup: bad files should be refused");
  ok(dReadBackup(bkText).n === 2, "Backup: a good file should read back with 2 dynasties");
  dRestoreText("not json"); ok($("#dBakMsg").classList.contains("err") && !$("#dBakMsg").hidden, "Backup: a bad file should show an error");
  let asked = ""; const realConfirm = window.confirm; window.confirm = m => { asked = m; return false; };
  const dynBefore = localStorage.getItem("dyn-v1"); dRestoreText(JSON.stringify({app:"cfb-dynasty-board", v:1, data:{"dyn-v1":JSON.stringify({list:[], cur:"", arch:false})}}));
  window.confirm = realConfirm;
  ok(/replaces/.test(asked) && /2 dynasties/.test(asked) && /0 dynasties/.test(asked) && localStorage.getItem("dyn-v1") === dynBefore && /canceled/.test($("#dBakMsg").textContent),
    `Backup: with saved dynasties, restore should ask first and cancel should change nothing (asked: ${asked.slice(0, 120)})`);
  const snap = Object.fromEntries(BAKKEYS.map(k => [k, localStorage.getItem(k)]));
  dApplyBackup({"dyn-v1":JSON.stringify({list:[D.list[0]], cur:"", arch:false})});
  ok(dCount(localStorage.getItem("dyn-v1")) === 1 && localStorage.getItem("house-v1") === null, "Backup: restore should replace, clearing keys the backup doesn't have");
  for (const [k, v] of Object.entries(snap)) v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  hSetTeam("Georgia");
  // Split states (CA, TX, FL) must clip to their own outline; duplicate clipPath ids across maps drew them as rectangles.
  const ids = [...$$("clipPath")].map(c => c.id);
  ok(ids.length === new Set(ids).size, "Maps: duplicate clipPath ids");
  // Clip shapes live in a <defs> at the top of each map, and every clipped group points at exactly one of them.
  ok(ids.length > 4 && [...$$("clipPath")].every(c => c.parentElement.tagName.toLowerCase() === "defs" && c.parentElement.parentElement.firstElementChild === c.parentElement),
    "Maps: every clipPath should sit in a <defs> that is the svg's first child");
  ok([...$$("[clip-path]")].every(g => $$(`#${CSS.escape(g.getAttribute("clip-path").slice(5, -1))}`).length === 1), "Maps: every clip-path should point at exactly one clipPath");
  ok(["CA", "TX", "FL", "GA"].every(st => $(`#pmap #cp-${st}`) && $(`#pmap [clip-path="url(#cp-${st})"] [data-reg]`)), "Maps: the pipeline map should clip CA, TX, FL and GA");

  await open("tabSlide");
  const row = name => [...$$("#slGrid tr")].find(r => r.cells[0]?.innerText === name)?.innerText.replace(/\s+/g, " ");
  ok(row("QB Accuracy") === "QB Accuracy 38 32", `Sliders: Heisman QB accuracy wrong: ${row("QB Accuracy")}`);
  ok(row("Tackling") === "Tackling 48 48", `Sliders: Heisman tackling wrong: ${row("Tackling")}`);
  ok(row("WR Catching") === "WR Catching 52 52", `Sliders: Heisman WR catching wrong: ${row("WR Catching")}`);
  ok(row("Roughing the Passer") === "Roughing the Passer 42", `Sliders: roughing the passer wrong: ${row("Roughing the Passer")}`);
  ok($$("#slGrid td.chg").length > 0 && !/was/.test($("#slGrid").innerText), "Sliders: changed values should be highlighted with no 'was' text");
  ok($$("#slGrid .sl-card").length === 6, "Sliders: expected 6 cards");
  $('#slDiff [data-d="aa"]').click(); await wait(50);
  ok(row("WR Catching") === "WR Catching 50 60", `Sliders: All-American WR catching wrong: ${row("WR Catching")}`);
  ok($('#slDiff [data-d="aa"]').getAttribute("aria-pressed") === "true", "Sliders: difficulty chip not selected");

  // Player abilities: position chips, archetype cards, ability detail, search, mental list.
  await open("tabAb");
  ok($$("#abGrid .sl-card").length === 4 && /Backfield Creator/.test($("#abGrid").textContent), "Abilities: QB should show 4 archetypes");
  const op = [...$$("#abGrid li")].find(li => /Off Platform/.test(li.textContent)), opm = [...op.querySelectorAll(".mt")];
  ok(opm.length === 4 && opm.map(m => m.className).join() === "mt mt0,mt mt1,mt mt2,mt mt3" && opm[0].title === "Bronze: 90 Throw Power, 82 Short Accuracy, 3 SP" && opm[3].title === "Platinum: 96 Throw Power, 86 Short Accuracy, 9 SP",
    `Abilities: Off Platform gates wrong: ${opm.map(m => m.title)}`);
  ok(getComputedStyle(opm[3]).color === "rgb(255, 255, 255)" && /^rgba\(255, 255, 255/.test(getComputedStyle(opm[3].querySelector("small")).color) && getComputedStyle(opm[0].querySelector("small")).color.startsWith("rgba(0, 0, 0"),
    "Abilities: Platinum chip number and cost should be white, other chips dark");
  // Favorites: star the last QB archetype, it moves to the top, the chip counts it, and it is saved.
  const lastQB = [...$$("#abGrid [data-fav]")].pop(); lastQB.click(); await wait(20);
  $$("#abGrid [data-fav]")[1].click(); await wait(20);
  ok([...$$("#abGrid [data-fav]")].slice(0, 2).every(b => b.getAttribute("aria-pressed") === "true") && $$('#abGrid [data-fav][aria-pressed="true"]').length === 2 && /★2/.test($('#abPos [data-p="QB"]').textContent)
    && JSON.parse(localStorage.getItem("abfav-v1")).length === 2, "Abilities: favoriting two QB archetypes should sort them first, count them on the chip and save them");
  $('#abPos [data-p="FAV"]').click(); await wait(20);
  ok($$("#abGrid .sl-card").length === 2 && /★ Favorites 2/.test($('#abPos [data-p="FAV"]').textContent), "Abilities: the Favorites chip should show only the 2 favorites");
  $('#abPos [data-p="FAV"]').click(); await wait(20);
  ok(abP === "QB" && $$("#abGrid .sl-card").length === 4 && $('#abPos [data-p="QB"]').getAttribute("aria-pressed") === "true", "Abilities: clicking the active Favorites chip should turn it off and show QB again");
  for (const b of $$('#abGrid [data-fav][aria-pressed="true"]')) { $(`#abGrid [data-fav="${b.dataset.fav}"]`).click(); await wait(20); }
  ok(!$$('#abGrid [aria-pressed="true"]').length && !/★/.test($('#abPos [data-p="QB"]').textContent), "Abilities: unfavoriting should clear the stars");
  $('#abPos [data-p="FAV"]').click(); await wait(20);
  ok(!$$("#abGrid .sl-card").length && /No favorites yet/.test($("#abGrid").textContent), "Abilities: Favorites with none saved should say how to add one");
  // Position change planner: save QB Dual Threat -> WR (unknown archetype), it lists and is stored; delete removes it.
  $('#abMode [data-m="chg"]').click(); await wait(20);
  ok(!$("#abChg").hidden && $("#abPlayer").hidden && $("#pcList").textContent.includes("No position changes"), "Position changes: mode should open empty");
  $("#pcFp").value = "QB"; $("#pcFp").dispatchEvent(new Event("change")); $("#pcFa").value = "Dual Threat";
  $("#pcTp").value = "QB"; $("#pcTp").dispatchEvent(new Event("change"));
  ok($("#pcAdd").disabled, "Position changes: same position should not be savable");
  $("#pcTp").value = "WR"; $("#pcTp").dispatchEvent(new Event("change")); $("#pcNote").value = "test";
  ok($("#pcTa").options[0].textContent === "Not sure yet" && [...$("#pcTa").options].length > 1, "Position changes: new archetype list should offer Not sure yet plus WR archetypes");
  $("#pcAdd").click(); await wait(20);
  const pcs = JSON.parse(localStorage.getItem("poschg-v1"));
  ok(pcs.length === 1 && pcs[0].fa === "Dual Threat" && pcs[0].tp === "WR" && pcs[0].ta === "" && /Dual Threat.*Not sure yet/.test($("#pcList").textContent), "Position changes: saving should list and store the change");
  const pn = $("#pcList [data-note]"); pn.value = "edited note"; pn.dispatchEvent(new Event("input", { bubbles: true }));
  ok(JSON.parse(localStorage.getItem("poschg-v1"))[0].note === "edited note", "Position changes: editing a saved note should save it");
  { const h1 = pn.offsetHeight; pn.value = "needs 85+ speed and change of direction, move him in the spring so he has a full offseason at the new spot before camp opens";
    pn.dispatchEvent(new Event("input", { bubbles: true }));
    ok(pn.tagName === "TEXTAREA" && pn.offsetHeight > h1 && pn.scrollHeight <= pn.clientHeight + 2, `Position changes: a long note should wrap and show in full (height ${h1} -> ${pn.offsetHeight}, content ${pn.scrollHeight})`); }
  const cf = window.confirm; window.confirm = () => true; $("#pcList [data-del]").click(); window.confirm = cf; await wait(20);
  ok(!JSON.parse(localStorage.getItem("poschg-v1")).length, "Position changes: delete should remove it");
  // Recruiting board: every roster position has a card, each card offers that position's archetypes, OL cards carry the line advice.
  { const roster = new Set(DATA.flatMap(t => t.r.map(p => p[1]))), onBoard = new Set(RBALL.map(s => s[1]));
    ok([...roster].every(p => onBoard.has(p)) && Object.values(RBPOS).every(s => ABARCH.some(a => a[0] === s[0])), `Recruiting board: every position needs a card with archetypes (edges use EDGE), missing ${[...roster].filter(p => !onBoard.has(p))}`);
    rbPick("lg"); ok(/Raw Strength\s*Best fit/.test($("#plcB").textContent) && $("#plcB").querySelectorAll("[data-rba]").length === 4, "Recruiting board: a guard should list the 4 OL archetypes with Raw Strength as best fit");
    $('#plcB [data-rba="Agile"]').click(); ok(RB.lg === "Agile" && !$("#plc").open && JSON.parse(localStorage.getItem("rboard-v1")).a.lg === "Agile", "Recruiting board: picking should save and close");
    rbPick("lg"); $('#plcB [data-rba=""]').click(); ok(!RB.lg && !JSON.parse(localStorage.getItem("rboard-v1")).a.lg, "Recruiting board: clearing a spot should remove it");
    // Subs: FB -> TE swaps the card's label and archetype list (FB archetype dropped); back to FB clears the sub; defense can't sub to QB.
    RB.fb = "Utility"; rbPick("fb"); $('#plcB [data-rbp="TE"]').click();
    ok(RBP.fb === "TE" && !RB.fb && $('#rb [data-rb="fb"] b').textContent === "TE" && /Vertical Threat/.test($("#plcB").textContent) && JSON.parse(localStorage.getItem("rboard-v1")).p.fb === "TE", "Recruiting board: subbing FB for TE should relabel the card and offer TE archetypes");
    ok(!$('#plcB [data-rbp="CB"]') && !$('#plcB [data-rbp="K"]'), "Recruiting board: an offensive spot should only sub offensive positions");
    $('#plcB [data-rbp="WR"]').click(); ok($('#rb [data-rb="fb"]').style.getPropertyValue("--g") === "2/8" && $('#rb [data-rb="wr1"]').style.getPropertyValue("--g") === "1/1", "Recruiting board: a FB subbed to WR should move out to flank the line (row 2, right slot)");
    $('#plcB [data-rbp="FB"]').click(); ok(!RBP.fb && $('#rb [data-rb="fb"] b').textContent === "FB", "Recruiting board: subbing back should restore the FB");
    $("#plc").close(); }
  $('#abMode [data-m="player"]').click(); await wait(20);
  $('#abPos [data-p="DL"]').click(); await wait(50);
  { const n = $('#abGrid [data-abn="DL|Speed Rusher"]'); n.value = "pair with a 3-4"; n.dispatchEvent(new Event("input", { bubbles: true }));
    ok(JSON.parse(localStorage.getItem("abnote-v1"))["DL|Speed Rusher"] === "pair with a 3-4" && n === n.closest(".sl-card").lastElementChild, "Abilities: an archetype note should sit at the bottom of the card and save as you type");
    abDraw(); ok($('#abGrid [data-abn="DL|Speed Rusher"]').value === "pair with a 3-4", "Abilities: an archetype note should come back after a redraw");
    const m = $('#abGrid [data-abn="DL|Speed Rusher"]'); m.value = ""; m.dispatchEvent(new Event("input", { bubbles: true }));
    ok(!("DL|Speed Rusher" in JSON.parse(localStorage.getItem("abnote-v1"))), "Abilities: clearing a note should remove it"); }
  { // A long note drawn while Abilities was hidden must still wrap and show in full once the tab opens.
    ABNOTE["DL|Pure Power"] = "Two-gap anchor for the 3-4, needs 90+ Strength and Block Shedding, look for 6-3 or taller with a long wingspan, recruit one every class"; showTab("board"); abDraw(); showTab("ab"); await wait(30);
    const n = $('#abGrid [data-abn="DL|Pure Power"]'); ok(n.offsetHeight > 40 && n.scrollHeight <= n.clientHeight + 2, `Abilities: a long archetype note should wrap and show in full (height ${n.offsetHeight}, content ${n.scrollHeight})`);
    delete ABNOTE["DL|Pure Power"]; abDraw(); }
  ok(/Speed Rusher/.test($("#abGrid").textContent) && $$("#abGrid .sl-card").length === 5, "Abilities: DL chip should show 5 archetypes");
  ok(/Puts more pressure on the quarterback/.test($("#abGrid").textContent), "Abilities: descriptions should show on the cards without clicking");
  // Unlock gates (CFB 27 game files): every archetype ability has Bronze-Platinum gates, split DE/DT only where they differ
  ok(ABARCH.every(([p, n, ab]) => ab.every(x => abGates(p + "|" + n, x)?.every(g => g[2].split(" ").length === 4 && g[5].split(" ").length === 4))), "Abilities: every archetype ability needs 4 unlock gates and costs");
  const gr = [...$$("#abGrid .sl-card")].find(c => /^Power Rusher/.test(c.querySelector("h3").textContent));
  const gb = [...gr.querySelectorAll("li")].find(li => /Grip Breaker/.test(li.querySelector("b").textContent));
  ok(gb.querySelectorAll(".ab-gl").length === 1 && /Bronze: 84 Strength/.test(gb.innerHTML) && gb.querySelectorAll(".mt").length === 4, "Abilities: DL (interior) Power Rusher Grip Breaker should show only the DT gate (84 Strength)");
  $('#abPos [data-p="EDGE"]').click(); await wait(50);
  { const c = [...$$("#abGrid .sl-card")].find(c => /^Power Rusher/.test(c.querySelector("h3").textContent)), li = [...c.querySelectorAll("li")].find(li => /Grip Breaker/.test(li.querySelector("b").textContent));
    ok($$("#abGrid .sl-card").length === 5 && li.querySelectorAll(".ab-gl").length === 1 && /Bronze: 94 Strength/.test(li.innerHTML), "Abilities: EDGE should show 5 archetypes with only the DE gates (94 Strength)"); }
  // OL split into OT/OG/C: four archetypes each, and Pocket Shield shows only that sub-position's gate (C costs 2 SP at Bronze, OG/OT 3)
  ok(!$('#abPos [data-p="OL"]') && ["OT", "OG", "C"].every(p => $(`#abPos [data-p="${p}"]`)), "Abilities: OL should be split into OT, OG and C chips");
  for (const [p, sp] of [["C", 2], ["OG", 3], ["OT", 3]]) { $(`#abPos [data-p="${p}"]`).click(); await wait(50);
    const c = [...$$("#abGrid .sl-card")].find(c => /^Pass Protector/.test(c.querySelector("h3").textContent)), li = c && [...c.querySelectorAll("li")].find(li => /Pocket Shield/.test(li.querySelector("b").textContent));
    ok($$("#abGrid .sl-card").length === 4 && li && li.querySelectorAll(".ab-gl").length === 1 && new RegExp(`Bronze: 84 Pass Block Power, ${sp} SP`).test(li.innerHTML), `Abilities: ${p} should show 4 archetypes and only its own Pocket Shield gate (${sp} SP)`); }
  ok(abOL("OL|Agile").join() === "OT|Agile,OG|Agile,C|Agile" && abOL("QB|Field General").join() === "QB|Field General", "Abilities: old OL favorites and notes should carry over to OT, OG and C");
  ok(["LT", "LG", "C", "RG", "RT"].every(p => $(`#plpos [data-p="${p}"]`)) && !$('#plpos [data-p="OL"]'), "Players: OL should be split into LT, LG, C, RG, RT chips");
  $('#abPos [data-p="DL"]').click(); await wait(50);
  ok(!$("#abMent .mt"), "Abilities: mental abilities have no unlock gates");
  find("#abQ", "sure hands");
  ok($$("#abGrid .sl-card").length === 6, `Abilities: Sure Hands should be in 6 archetypes, got ${$$("#abGrid .sl-card").length}`);
  find("#abQ", "");
  // Phone collapse: every card has an ability summary; tapping the header opens it and keeps it open across redraws.
  { const c = $("#abGrid .ab-card"), k = c.dataset.card; ok(c.querySelector(".ab-sum") && !c.classList.contains("open"), "Abilities: cards should start closed with a summary");
    c.querySelector("h3").click(); ok(c.classList.contains("open") && ABOPEN.has(k), "Abilities: tapping a card header should open it");
    abDraw(); ok($(`#abGrid [data-card="${k}"]`).classList.contains("open"), "Abilities: an open card should stay open after a redraw");
    $(`#abGrid [data-card="${k}"] h3`).click(); ok(!ABOPEN.has(k), "Abilities: tapping again should close it"); }
  // Mode chips: Physical (was Player), Mental (own page), Coach, Position changes.
  ok([...$$("#abMode .chip")].map(b => b.textContent).join() === "Physical,Mental,Coach,Position changes", "Abilities: mode chips should be Physical, Mental, Coach, Position changes");
  ok(!$("#abPlayer").contains($("#abMent")), "Abilities: mental abilities should not be on the Physical page");
  $('#abMode [data-m="ment"]').click(); await wait(30);
  ok(!$("#abMental").hidden && $("#abPlayer").hidden && location.hash === "#abilities/mental", "Abilities: Mental chip should open its own page");
  ok($$("#abMent li").length === 16 && !/Hot Head/.test($("#abMent").textContent), "Abilities: expected the 16 mental abilities, without Hot Head");
  $('#abMode [data-m="player"]').click(); await wait(30);
  ok(ABARCH.every(a => a[2].every(n => ABICO.has(abSlug(n)))), `Abilities: every archetype ability needs an icon, missing ${[...new Set(ABARCH.flatMap(a => a[2]).filter(n => !ABICO.has(abSlug(n))))]}`);
  ok(!/Battering Ram/.test(JSON.stringify(ABARCH)) && ABARCH.every(a => a[2].every(n => n in ABPHYS)), "Abilities: every archetype ability needs a description, and no Battering Ram");
  $('#abPos [data-p="K/P"]').click(); await wait(50);
  ok(/Field Flip/.test($("#abGrid").textContent), "Abilities: Field Flip should show under K/P");
  ok(!/—/.test($("#viewAb").textContent), "Abilities: no em dashes in copy");
  // Coach abilities: Player/Coach toggle, archetype chips, unlocks, search.
  $('#abMode [data-m="coach"]').click(); await wait(50);
  ok($("#abPlayer").hidden && !$("#abCoach").hidden, "Abilities: Coach toggle should swap views");
  ok($$("#abArch .chip").length === 8 && /Portal King/.test($("#abCGrid").textContent) && /Firm Handshakes/.test($("#abCGrid").textContent) && /Always Be Crootin/.test($("#abCGrid").textContent), "Abilities: Recruiter chip should bundle Recruiter and Elite Recruiter");
  // Archetypes bought per position group get one card per group, each priced for that group.
  { const heads = [...$$("#abCGrid .sl-card h3")].map(h => h.textContent);
    ok($$("#abCGrid .sl-card").length === 16 && heads.slice(0, 8).join() === "QB,RB/FB,WR/TE,OL,DL,LB,DB,K/P" && !/Bought separately/.test($("#abCGrid").textContent),
      `Abilities: Recruiter + Elite Recruiter should be 8 position cards each, got ${heads.join("|")}`); }
  $('#abArch [data-c="Motivator"]').click(); await wait(50);
  { const hot = p => { const c = [...$$("#abCGrid .sl-card")].find(c => c.querySelector("h3").textContent === p);
      return [...c.querySelectorAll("li")].find(li => /Hot Hand/.test(li.textContent)).querySelector(".ab-cost").textContent; };
    ok(hot("QB") === "20" && hot("K/P") === "10", `Abilities: Hot Hand should cost 20 on QB and 10 on K/P, got ${hot("QB")} / ${hot("K/P")}`); }
  $('#abArch [data-c="Tactician"]').click(); await wait(50);
  ok($$("#abCGrid .ab-arch").length === 2 && $$("#abCGrid .sl-card").length === 16 && /top 25/.test($("#abCGrid").textContent), "Abilities: Tactician chip should show Tactician and Scheme Guru (16 branches)");
  find("#abQ", "whisperer");
  ok(/Talent Developer/.test($("#abCGrid").textContent), "Abilities: coach search should find Whisperer");
  find("#abQ", "");
  $('#abMode [data-m="player"]').click(); await wait(50);
  ok(!$("#abPlayer").hidden && $("#abCoach").hidden, "Abilities: Player toggle should swap back");
  ok($("#tabAb").textContent === "Abilities", "Abilities: tab should be named Abilities");
  { const imgs = [...$$("#viewAb img.ab-ico")]; await Promise.race([Promise.all(imgs.map(i => i.decode().catch(() => {}))), wait(3000)]);
    ok(imgs.length > 20 && imgs.every(i => i.naturalWidth > 0), `Abilities: icons missing or broken: ${imgs.filter(i => !i.naturalWidth).map(i => i.src).slice(0, 3)}`); }

  ok(!$("#pAi") && window.__noAI && typeof pAiLoad === "undefined" && !pAIUse("tough florida dynasty with a created coach"), "Coach: the old in-browser model is gone and the test browser never calls /api/coach");
  // Coach abilities: each upgrade shows its own cost; Recruiter T1 is 15 CP (K/P 10).
  { const sa = [...$$("#viewAb button")].find(b => b.textContent.trim() === "Coach" && !b.closest("#abArch")); if (sa) { showTab("ab"); sa.click(); await wait(50); }
    const lis = [...$$("#abCGrid .ab-list li")], first = lis[0]?.querySelector(".ab-cost")?.textContent;
    ok(lis.length && lis.every(li => li.querySelector(".ab-cost")), "Abilities: every coach upgrade should show its cost");
    ok(!/for all \d|<dt>Cost/.test($("#abCGrid").innerHTML), "Abilities: archetype Cost row and branch totals were removed");
    // Game-file costs (prestonchoate.dev): K/P discounts exist only on specific abilities.
    const ca = n => CARCH.find(a => a.n === n), br = n => ca(n).br[0][1], cost = (n, i) => cTierCost(ca(n), i, br(n)[i][0]);
    ok(JSON.stringify(cost("Recruiter", 2)) === "[25,null]" , "Abilities: Recruiter has no K/P discount (Magnetic Personality is 25 for K/P)");
    ok(JSON.stringify([0, 1, 2, 3].map(i => cost("Motivator", i))) === "[[15,null],[20,10],[25,null],[30,15]]", "Abilities: Motivator K/P discounts should be Hot Hand 10 and Locked In 15 only");
    ok(JSON.stringify(cost("Elite Recruiter", 3)) === "[40,20]" && JSON.stringify(cost("Elite Recruiter", 0)) === "[25,null]", "Abilities: Elite Recruiter K/P discount is Always Be Crootin' only");
    ok(JSON.stringify([0, 1, 2, 3].map(i => cost("Talent Developer", i))) === "[[25,null],[30,15],[35,null],[40,20]]", "Abilities: Talent Developer K/P: Whisperer 15, Pay It Forward 20");
    ok(["Master Motivator", "Architect", "Strategist"].every(n => [0, 1, 2, 3].every(i => cost(n, i)[1] === null)), "Abilities: Master Motivator, Architect and Strategist have no K/P discount");
    ok(CARCH.every(a => !cCost(a) || !cCost(a).kp || Object.keys(cCost(a).kp).every(n => a.br.some(([, ab]) => ab.some(x => x[0] === n)))), "Abilities: a K/P discount names an ability that doesn't exist");
    ok(CARCH.every(a => cCost(a)), "Abilities: every coach archetype's cost text must parse"); }
  // Dynasty planner: plain chat. Parses team/difficulty/extras from text and replies in prose only.
  $("#pOpen").click(); await wait(50);
  ok($("#pChat").classList.contains("on") && $("#pLog .pm.bot"), "Coach: sidebar didn't open with a greeting");
  // Desktop: the sidebar pushes the page instead of covering it.
  if (innerWidth > 900) { await wait(300); ok($("#pChat").getBoundingClientRect().left >= $(".masthead").getBoundingClientRect().right - 1, "Coach: sidebar covers the page"); }
  const ask = async q => { $("#pIn").value = q; $("#pForm").requestSubmit(); await wait(50); return [...$$("#pLog .pm.bot")].pop().textContent; };
  ok(/didn't catch a program/.test(await ask("hello")), "Planner: text with no program should get the help reply");
  let m = await ask("plan a tough Florida dynasty with a created coach");
  ok(/Florida Gators/.test(m) && /House rules · Hardcore/.test(m) && /NIL rank #\d+ of 138/.test(m) && /You replace|created coach starts/.test(m), "Planner: tough Florida reply missing team, hardcore or created coach");
  ok(P.plan.rules.length === 8, "Planner: Hardcore should deal 8 rules");
  ok(P.plan.rules.every(id => m.includes(unesc(HR[id].n) + ":") && m.includes(unesc(HR[id].x(P.plan.t).replace(/<[^>]+>/g, "")).slice(0, 20))), "Coach: every house rule should show its title and its rule text");
  const last = [...$$("#pLog .pm.bot")].pop();
  // Add to My Dynasty: the reply's plan becomes a saved dynasty and My Dynasty opens on it; a second click doesn't duplicate it.
  { const n0 = D.list.length, pd = last.querySelector(".pdyn"), want = [...P.plan.rules];
    ok(pd && pd.textContent === "Add to My Dynasty?", "Coach: plan replies should end with an Add to My Dynasty? button");
    pd.click(); await wait(30); const d = D.list[0];
    ok(D.list.length === n0 + 1 && d.team === "Florida" && JSON.stringify(d.rules) === JSON.stringify(want) && d.src === "Coach · Hardcore" && curTab === "dyn" && D.cur === d.id
      && /Coach · Hardcore/.test($("#dView").textContent) && pd.dataset.did === d.id && /Added/.test(pd.textContent), `Coach: Add to My Dynasty should save and open the plan, got ${JSON.stringify(d).slice(0, 200)} on tab ${curTab}`);
    pd.click(); await wait(30);
    ok(D.list.length === n0 + 1, "Coach: clicking Add to My Dynasty again should open it, not save a copy");
    D.list = D.list.filter(x => x !== d); dSave(); dDraw(); showTab("board"); if (!$("#pChat").classList.contains("on")) pToggle(true); }
  // Copy buttons: both sides of the chat; Coach's copy keeps headings and bullets on their own lines and leaves the button out.
  { const wt = navigator.clipboard.writeText; let got = []; navigator.clipboard.writeText = async t => { got.push(t); };
    last.querySelector(".pcopy").click(); [...$$("#pLog .pm.me")].pop().querySelector(".pcopy").click(); await wait(20); navigator.clipboard.writeText = wt;
    ok(got[0]?.startsWith("Florida Gators\n") && /\n- /.test(got[0]) && !/Copy/.test(got[0]) && got[1] === "plan a tough Florida dynasty with a created coach"
      && last.querySelector(".pcopy").getAttribute("aria-label") === "Copied", `Coach: copy buttons should copy the message text, got ${JSON.stringify(got).slice(0, 160)}`); }
  ok(last.querySelectorAll("h4").length >= 4 && last.querySelectorAll("li").length >= 10, "Coach: reply should be titles and bullets, not a wall of text");
  ok(pMd("### A\n- **b:** <i>x</i>\ntext") === "<h4>A</h4><ul><li><b>b:</b> &lt;i&gt;x&lt;/i&gt;</li></ul><p>text</p>", "Coach: markdown renderer wrong or not escaping");
  ok(pMd("-\nhi") === "<p>hi</p>", "Coach: empty bullet should be dropped");
  // Player questions answer from the roster, not with a plan.
  { const osu = DATA.find(t => t.n === "Ohio State"), best = [...osu.r].sort((a, b) => b[3] - a[3] || b[5] - a[5])[0];
    m = await ask("who is the best player on ohio state?");
    ok(m.includes(best[0]) && !/House rules/.test(m), `Coach: best Ohio State player should be ${best[0]}: ${m}`);
    const qb = osu.r.filter(p => p[1] === "QB").sort((a, b) => b[3] - a[3] || b[5] - a[5])[0];
    ok((await ask("best QB?")).includes(qb[0]), "Coach: follow-up 'best QB?' should use the last team's roster");
    ok((await ask(`tell me about ${best[0]}`)).includes("Ohio State"), "Coach: player lookup by name failed");
    ok((await ask("top 5 players at Texas")).match(/OVR/g).length === 5, "Coach: top 5 should list 5 players"); }
  // A plan must not contradict itself: territory rules hide "Best pipelines", Earn the headset means coordinator, not head coach.
  { const t = DATA.find(x => x.n === "Oregon"); P.plan = null; P.team = null;
    const txt = pRender({t, strict:"hard", pre:null, rules:["ter-home", "star-none", "job-coord"], created:false}).replace(/<[^>]+>/g, " ");
    ok(!/Best pipelines/.test(txt) && /coordinator on Dan Lanning/.test(txt) && !/You coach as/.test(txt), "Coach: plan contradicts its own rules: " + txt); }
  // Coaching staff from t.st.
  { const ore = DATA.find(t => t.n === "Oregon"), hc = ore.st.find(c => c[0] === "HC"), oc = ore.st.find(c => c[0] === "OC");
    ok((await ask("who is oregon's head coach?")).includes(hc[1]), "Coach: Oregon head coach wrong");
    m = await ask("and the OC?"); ok(m.includes(oc[1]) && !m.includes(hc[1]), "Coach: follow-up OC should use the last team");
    ok((await ask(`tell me about ${hc[1]}`)).includes("Oregon"), "Coach: coach lookup by name failed"); }
  // Relative difficulty: "a little less difficult" must lower difficulty by one rule change, not rebuild the same hard plan.
  { m = await ask("tough florida dynasty rebuild"); const r0 = [...P.plan.rules], s0 = strainOf(r0);
    ok(/House rules · Hardcore/.test(m) && /Rebuild: Florida is #/.test(m), "Coach: tough rebuild should be Hardcore and mention the rebuild: " + m);
    m = await ask("make it a little less difficult"); const s1 = strainOf(P.plan.rules);
    ok(P.plan.t.n === "Florida" && s1 < s0 && P.plan.rules.filter(id => !r0.includes(id)).length <= 1 && /What changed/.test(m) && /Swapped|Dropped/.test(m),
      `Coach: 'a little less difficult' should change one rule and lower strain (${s0} to ${s1}): ${m}`);
    m = await ask("make florida much harder");
    ok(P.plan.t.n === "Florida" && strainOf(P.plan.rules) > s1 && (m.match(/Swapped|Added/g) || []).length >= 2, "Coach: 'much harder' on the same team should step up several notches: " + m);
    await ask("no transfers"); m = await ask("way easier");
    ok(P.plan.rules.includes("port-none"), "Coach: easing off must keep rules the user asked for by name"); }
  { const txt = pRender({t:DATA.find(x => x.n === "Florida"), strict:"std", pre:null, rules:["ter-local"], created:false}).replace(/<[^>]+>/g, " ");
    ok(!/Allowed regions|limits recruiting/.test(txt) && /Best pipelines/.test(txt), "Coach: Stay local is a quota, not a region limit: " + txt); }
  // Recruiting advice must not contradict the house rules (e.g. No blue-chips vs "chase 5★").
  { const t = DATA.find(x => x.n === "Michigan"), tips = pRecTips(t, ["ter-top3", "star-none", "nil-zero", "port-none"], ARCH[0][2]).join(" ");
    ok(!/[45]★ talent|long shots|NIL keeping|nationally/.test(tips) && /3★ and below/.test(tips) && /No NIL/.test(tips) && /Allowed regions/.test(tips), "Coach: recruiting advice contradicts house rules: " + tips); }
  // Ability questions answer from the abilities data, not with a plan.
  m = await ask("what abilities does a speed rusher get?");
  ok(/Speed Rusher DL/.test(m) && /Quick Jump/.test(m) && !/House rules/.test(m), "Coach: Speed Rusher abilities wrong: " + m);
  m = await ask("how do I unlock Dot!?");
  ok(/Dot!/.test(m) && /Pocket Passer QB/.test(m) && /Gadget WR/.test(m) && /Bronze/.test(m), "Coach: Dot! unlock answer wrong: " + m);
  ok(/any player/.test(await ask("what does Road Dog do?")), "Coach: mental ability answer wrong");
  m = await ask("what does Portal King do?");
  ok(/Recruiter/.test(m) && /transfers/i.test(m), "Coach: Portal King answer wrong: " + m);
  ok(/two national titles/.test(await ask("how do I unlock the CEO archetype?")), "Coach: CEO unlock answer wrong");
  ok(/Physical Route Runner WR/.test(await ask("physical route runner WR abilities")) && !/Physical Route Runner TE/.test([...$$("#pLog .pm.bot")].pop().textContent), "Coach: position should narrow a shared archetype name");
  ok(/Georgia Tech/.test(await ask("casual georgia tech")), "Planner: longest team name should win (Georgia Tech)");
  ok(/Minnesota/.test(await ask("i want to take a former powerhouse program back to glory, what are 3 options?")), "Coach: back-to-glory should answer from board data (Minnesota has 6 titles)");
  ok(/1960/.test([...$$("#pLog .pm.bot")].pop().textContent), "Coach: glory reply should name Minnesota's last title (1960, NCAA.com)");
  ok(tYears(DATA.find(t => t.n === "USC")).includes("2004") && DATA.every(t => (TYEARS[t.n] || []).length === t.ti), "Titles: NCAA years must match each team's title count");
  ok(/Georgia Tech/.test(await ask("casual georgia tech")), "Planner: re-pick Georgia Tech");
  $("#pIn").value = "x ".repeat(200); $("#pIn").dispatchEvent(new Event("input"));
  ok($("#pIn").tagName === "TEXTAREA" && $("#pIn").offsetHeight > 60, "Coach: long input should wrap and grow");
  $("#pIn").value = ""; $("#pIn").dispatchEvent(new Event("input"));
  m = await ask("no transfers");
  ok(/Closed portal/.test(m) && /Georgia Tech/.test(m), "Planner: follow-up didn't keep team and add Closed portal");
  ok(!$("#pLog button:not(.pcopy):not(.pdyn), #pLog ol"), "Planner: chat should be plain messages, no cards or buttons (copy and Add to My Dynasty are the exceptions)");
  if (innerWidth > 900) { openTeam("Florida"); await wait(400);
    ok($("#dossier").getBoundingClientRect().right <= $("#pChat").getBoundingClientRect().left + 1, "Coach: dossier covers the Coach sidebar");
    closeTeam(); await wait(300); }
  $("#pOpen").click(); await wait(50);
  ok(!$("#pChat").classList.contains("on") && !document.body.classList.contains("coach-on"), "Coach: headset button should close the sidebar");
  // Device sync, against an in-memory copy of /api/sync: encrypted storage, joining merges two devices, stale writes retry,
  // wrong codes and deleted copies turn sync off with a message. Saved data is put back afterwards.
  { const keep = Object.fromEntries([...SKEYS, "sync-v1"].map(k => [k, localStorage.getItem(k)])), db = new Map(); let stale = 0, reloads = 0;
    const R = (b, st = 200) => new Response(JSON.stringify(b), {status:st});
    window.__syncStub = async (url, o) => { const id = url.split("/").pop(), cur = db.get(id);
      if (o.method === "GET") return cur ? R(cur) : R({error:"none"}, 404);
      if (o.method === "DELETE") { db.delete(id); return R({ok:true}); }
      const b = JSON.parse(o.body); if (stale) { stale--; return R({error:"stale"}, 409); }
      if (b.ver === 0 ? cur : !cur || cur.ver !== b.ver) return R({error:"stale"}, 409);
      db.set(id, {ver:b.ver + 1, data:b.data, iv:b.iv, updated:Date.now()}); return R({ver:b.ver + 1}); };
    window.__syncReload = () => reloads++;
    const dyn = (id, name) => ({id, name, team:"Temple", rules:[], src:"", made:1, arch:false});
    localStorage.setItem("dyn-v1", JSON.stringify({list:[dyn("da", "Desk Owls")], cur:"da", arch:false})); sOff("");
    ok(/^Sync/.test($("#syncLbl").textContent) && !$("#syncOpen").classList.contains("on") && !$("#dSync"), "Sync: the masthead button starts as Sync, and My Dynasty has no sync section");
    $("#syncOpen").click(); await sBusy; await sQr(); await wait(50);
    ok($("#sy").open && sValid(S.code) && $("#sCodeShow").textContent === sFmt(S.code) && $("#sQR svg") && $$("#sy .sync-what li").length === 5 && /Stays on each device/.test($("#sy").textContent),
      "Sync: the button should open the modal with a new code, its QR code and what syncs");
    ok(/[Ss]ynced/.test($("#syncLbl").textContent) && $("#syncOpen").classList.contains("on"), "Sync: the masthead button should show synced once sync is on");
    $("#syDone").click(); ok(!$("#sy").open, "Sync: Done should close the modal");
    $("#syncOpen").click(); $("#syX").click(); ok(!$("#sy").open, "Sync: the × should close the modal");
    // iPhone Safari shows the Home Screen tip; the Home Screen copy (standalone) asks for a code instead of making one.
    window.__ios = true; window.__standalone = false; $("#syncOpen").click(); await wait(10);
    ok($("#sTip") && /Home Screen/.test($("#sTip").textContent), "Sync: iPhone Safari should explain that the Home Screen copy needs the code too"); $("#sy").close();
    window.__ios = false; $("#syncOpen").click(); await wait(10); ok(!$("#sTip"), "Sync: the Home Screen tip is only for iPhone and iPad"); $("#sy").close();
    { const was = {...S}; S = {code:"", ver:0, last:{}, at:0, err:""}; window.__standalone = true; const n = db.size; $("#syncOpen").click(); await wait(20);
      ok(!S.code && db.size === n && $("#sJoinF") && $("#sy .sync-join").compareDocumentPosition($("#sy .sync-what")) & 4 && $("#sNew"),
        "Sync: opened from the Home Screen, the modal should ask for a code first and not make a new one");
      $("#sy").close(); window.__standalone = false; window.__ios = undefined; window.__standalone = undefined; S = was; sSave(); }
    $("#syncOpen").click(); await wait(10);   // stays open for the rest: sDraw only paints while it's open
    const code = S.code, row = [...db.values()][0];
    ok(sValid(code) && db.size === 1 && row.ver === 1 && S.ver === 1 && !/Owls|Temple|dyn-v1/.test(row.data + atob(row.data)), "Sync: turning it on should store one encrypted copy");

    // Second device: its own dynasty, joins with the code typed in lowercase; both dynasties end up on both sides.
    localStorage.setItem("dyn-v1", JSON.stringify({list:[dyn("db", "Phone Owls")], cur:"db", arch:false})); sOff("");
    await sJoin(`Join me: ${sLink(code)}`);   // the whole QR link pasted, not just the code
    const names = JSON.parse(localStorage.getItem("dyn-v1")).list.map(d => d.name).sort().join();
    ok(names === "Desk Owls,Phone Owls" && reloads === 1 && [...db.values()][0].ver === 2 && S.ver === 2, `Sync: joining should merge both devices' dynasties, got ${names}, ${reloads} reloads`);
    ok(sessionStorage.getItem("sync-note") === "1", "Sync: a merge from another device should leave the 'updated' note for after the reload");
    // A change here while another device wrote first: the 409 makes it read, merge and write again.
    const l = JSON.parse(localStorage.getItem("dyn-v1")); l.list.push(dyn("dc", "Third Owls")); localStorage.setItem("dyn-v1", JSON.stringify(l));
    ok(sChanged(), "Sync: a local edit should be noticed"); stale = 1; await sSync();
    ok(S.ver === 3 && !sChanged() && !S.err, `Sync: a stale write should retry and succeed (ver ${S.ver}, err "${S.err}")`);
    // Merge rules: one-sided changes win, deletes on one side stick, both-sided list edits union, single values keep this device's.
    const m = sMerge({"dyn-v1":"A", "rec-v1":"x", "abfav-v1":'["QB|A"]', "house-v1":"L"}, {"dyn-v1":"A", "rec-v1":null, "abfav-v1":'["QB|B"]', "house-v1":"R"}, {"dyn-v1":"A", "rec-v1":"x", "abfav-v1":"[]", "house-v1":"0"});
    ok(m["rec-v1"] === null && m["abfav-v1"] === '["QB|A","QB|B"]' && m["house-v1"] === "L" && m["dyn-v1"] === "A", `Sync: merge rules wrong: ${JSON.stringify(m)}`);
    // Wrong code, a malformed code, then a copy deleted from another device.
    await sJoin("AAAAA-BBBBB-CCCCC-DDDDD");
    ok(!S.code && /No synced data uses that code/.test($("#sy").textContent) && $("#sNew"), "Sync: an unknown code should say so, leave sync off and offer a new code");
    await sJoin("bad"); ok(/doesn't look like a sync code/.test(S.err), "Sync: a malformed code should be rejected before any request");
    await sOn(); const orphan = S.code; ok(db.size === 2, "Sync: a fresh code should create its own copy");
    await sJoin(code); ok(S.code === code && db.size === 1, "Sync: switching to another device's code should delete this device's unused one");
    db.clear(); await sSync();
    ok(!S.code && /deleted from another device/.test(S.err), "Sync: a deleted copy should turn sync off here with a note");
    window.__syncStub = null; window.__syncReload = null; sessionStorage.removeItem("sync-note");
    for (const [k, v] of Object.entries(keep)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    S = {code:"", ver:0, last:{}, at:0, err:""}; $("#sy").close(); sDraw(); showTab("board"); }
  return fails;
};
const r = await send("Runtime.evaluate", { expression: `(${inPage})()`, awaitPromise: true, returnByValue: true });
const fails = [...errors, ...(r.result.exceptionDetails ? ["Check crashed: " + r.result.exceptionDetails.exception?.description] : r.result.result.value)];
// Coach conversation suite (coach-cases.mjs): each case is a fresh conversation checked turn by turn.
const cases = (await import("./coach-cases.mjs")).default;
const coachRun = async cs => {
  const out = [];
  for (const c of cs) {
    P.plan = null; P.team = null; P.past = []; P.pref = null; P.pending = null; P.choices = null; P.last = null; localStorage.removeItem("coach-v1"); document.querySelector("#pLog").innerHTML = "";
    // c.ai: recorded Workers AI replies by message (null = the AI failed), so the understanding step is tested without the network.
    window.__aiStub = c.ai ? q => c.ai[q] ?? null : null;
    for (const [q0, e] of c.say) {
      const q = q0.replace("__NAME__", () => unesc(HR[window.__id].n)).replace("__TEAM__", () => window.__c.t.n);
      document.querySelector("#pIn").value = q; document.querySelector("#pForm").requestSubmit(); await new Promise(r => setTimeout(r, 20));
      const txt = [...document.querySelectorAll("#pLog .pm.bot")].pop()?.textContent || "", bad = [];
      for (const h of e.has || []) if (!new RegExp(h, "i").test(txt)) bad.push(`missing /${h}/`);
      for (const h of e.not || []) if (new RegExp(h, "i").test(txt)) bad.push(`should not say /${h}/`);
      try { if (e.js && !eval(e.js)) bad.push(`check failed: ${e.js}`); } catch (x) { bad.push(`check crashed: ${x.message}`); }
      if (bad.length) out.push(`Coach case "${c.name}", after "${q}": ${bad.join("; ")}. Reply: ${txt.slice(0, 300)}`);
    }
  }
  window.__aiStub = null;
  return out;
};
const cr = await send("Runtime.evaluate", { expression: `(${coachRun})(${JSON.stringify(cases)})`, awaitPromise: true, returnByValue: true });
fails.push(...(cr.result.exceptionDetails ? ["Coach suite crashed: " + cr.result.exceptionDetails.exception?.description] : cr.result.result.value));

// Refresh keeps the open tab: the tab sits in the URL hash, and Board is the bare URL.
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.result?.value;
const hb = await ev(`showTab("board"); location.hash`), ha = await ev(`$("#tabAb").click(); location.hash`);
if (hb !== "" || !/^#abilities\/[a-z/-]+$/.test(ha)) fails.push(`Refresh: tab should set the URL hash (board "${hb}", abilities "${ha}")`);
// Restore end to end: apply a backup with one dynasty, reload like the Restore button does, and the page should load it and say so.
// The Abilities view rides in the hash too, so a refresh on CB stays on CB.
await ev(`abM = "player"; abP = "CB"; abDraw()`);
await ev(`dApplyBackup({"dyn-v1": JSON.stringify({list:[{id:"dz", name:"Restored Owls", team:"Temple", rules:[], src:"", made:0, arch:false}], cur:"dz", arch:false})}); sessionStorage.setItem("dyn-restored", "1")`);
await new Promise(r => { loaded = r; send("Page.reload"); });
const rs = await ev(`[D.list.length, D.list[0]?.name, $("#dBakMsg").textContent, $("#dBakMsg").hidden].join("|")`);
if (rs !== "1|Restored Owls|Restored from backup: 1 dynasty.|false") fails.push(`Restore: after reload expected the restored dynasty and a note, got ${rs}`);
const after = await ev(`[curTab, $("#viewAb").hidden, $("#viewBoard").hidden, $("#tabAb").getAttribute("aria-selected")].join()`);
if (after !== "ab,false,true,true") fails.push(`Refresh: reloading on #abilities should reopen Abilities, got ${after}`);
const abAfter = await ev(`[location.hash, abM, abP, $('#abPos [aria-pressed="true"]')?.dataset.p].join()`);
if (abAfter !== "#abilities/cb,player,CB,CB") fails.push(`Refresh: reloading on Abilities CB should stay on CB, got ${abAfter}`);
// Player and Coach Database filters ride in the hash too.
const plH = await ev(`showTab("play"); $('#plpos [data-p="CB"]').click(); $("#plteam").value = "Georgia"; $("#plteam").dispatchEvent(new Event("change")); location.hash`);
await new Promise(r => { loaded = r; send("Page.reload"); });
const plAfter = await ev(`[curTab, plPos, $("#plteam").value, $('#plpos [aria-pressed="true"]')?.dataset.p, plList().every(p => p.team === "Georgia" && p.pos === "CB")].join()`);
if (plH !== "#players/pos=CB&team=Georgia" || plAfter !== "play,CB,Georgia,CB,true") fails.push(`Refresh: Player Database filters should survive a reload (hash ${plH}, got ${plAfter})`);
await ev(`showTab("coach"); $('#cchips [data-r="DC"]').click()`);
await new Promise(r => { loaded = r; send("Page.reload"); });
const cAfter = await ev(`[location.hash, curTab, cRole, [...document.querySelectorAll("#crows tr .role")].every(t => t.textContent === "DC")].join()`);
if (cAfter !== "#coaches/role=DC,coach,DC,true") fails.push(`Refresh: Coach Database role should survive a reload, got ${cAfter}`);
// Every other tab with its own view: Program Database conference, Pipelines team and state, Randomizer filters, Sliders difficulty.
for (const [set, want, got] of [
  [`showTab("board"); $('#chips [data-c="SEC"]').click()`, "#programs/conf=SEC", `[curTab, conf, rowsFor().every(t => t.c === "SEC")].join()`, "board,SEC,true"],
  [`showTab("pipe"); pSet("Oregon"); pPipe = $("#ppipe").options[1].value; $("#ppipe").value = pPipe; pDraw()`, null, `[curTab, pTeam, pPipe === $("#ppipe").options[1].value].join()`, "pipe,Oregon,true"],
  [`showTab("rand"); document.querySelector('#viewRand .seg [data-mode="filt"]').click(); document.querySelector('#rFilters [data-g="p"] [data-i="0"]').click()`, "#randomizer/mode=filt&p=0", `[curTab, rMode, [...rSel.p].join()].join()`, "rand,filt,0"],
  [`showTab("rec"); $('#recMode [data-m="board"]').click(); rbPick("lt"); $('#plcB [data-rba="Well Rounded"]').click()`, "#recruiting/board", `[curTab, rM, RB.lt, !$("#rbWrap").hidden, $("#recGrid").hidden, document.querySelectorAll("#rb .rb-c").length].join()`, "rec,board,Well Rounded,true,true,25"],
  [`showTab("slide"); document.querySelector('#slDiff [data-d]:not([aria-pressed="true"])').click()`, null, `[curTab, slD !== "heis"].join()`, "slide,true"]].map(([a, h, g, w]) => [a, h, [g, w]])) {
  const h = await ev(set + `; location.hash`); await new Promise(r => { loaded = r; send("Page.reload"); });
  const v = await ev(got[0]); if ((want && h !== want) || v !== got[1]) fails.push(`Refresh: ${set.slice(0, 40)}... should survive a reload (hash ${h}, got ${v})`);
}

chrome.kill(); await new Promise(r => chrome.once("exit", r)); server.close();
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {} // leftover temp files are harmless
// Deploy config: static assets, plus the Worker for /api/* only (Coach's AI step), so every page, script and data request stays
// a free static-asset request. www -> main domain is a Cloudflare Redirect Rule in the dashboard. Both hostnames stay attached.
const wr = JSON.parse((await readFile(join(import.meta.dirname, "wrangler.jsonc"), "utf8")).replace(/^\s*\/\/.*$/gm, ""));
if (wr.main !== "src/worker.js" || JSON.stringify(wr.assets?.run_worker_first) !== '["/api/*"]' || wr.assets?.directory !== "./public")
  fails.push('wrangler.jsonc: serve ./public as static assets and run src/worker.js first for "/api/*" only');
if (wr.ai?.binding !== "AI" || !wr.ratelimits?.some(r => r.name === "COACH_RL")) fails.push("wrangler.jsonc: needs the AI binding and the COACH_RL rate limit");
// The Worker itself, with fake bindings: static paths pass through, rate limit and AI failures return errors the page falls back from.
{ const W = await import("./src/worker.js"), post = (b, path = "/api/coach") => new Request("https://x" + path, {method:"POST", body:JSON.stringify(b)});
  const env = (ai, rl = true) => ({ASSETS:{fetch:() => new Response("asset")}, COACH_RL:{limit:async () => ({success:rl})}, AI:{run:ai}});
  const good = env(async (m, o) => ({choices:[{message:{content:JSON.stringify({kind:"plan", teams:[o.messages[1].content.includes("Oregon") ? "Oregon" : "?"]})}}]}));
  const r1 = await W.default.fetch(new Request("https://x/js/core.js"), good), r2 = await W.default.fetch(post({q:"tough Oregon dynasty"}), good);
  const r3 = await W.default.fetch(post({q:"x"}), env(async () => ({}), false)), r4 = await W.default.fetch(post({q:"x"}), env(async () => { throw new Error("3036: daily free allocation"); }));
  const r5 = await W.default.fetch(post({q:""}), good), j2 = await r2.json();
  if (await r1.text() !== "asset" || j2.kind !== "plan" || j2.teams[0] !== "Oregon" || r3.status !== 429 || r4.status !== 502 || r5.status !== 400)
    fails.push(`Worker: expected asset passthrough, parsed AI JSON, 429, 502 and 400; got ${[await r1.clone().text?.(), JSON.stringify(j2), r3.status, r4.status, r5.status]}`); }
// The sync route with a fake D1: create, read, compare-and-swap update (stale version gets 409), delete, bad ids rejected.
{ const W = await import("./src/worker.js"), rows = new Map(), id = "a".repeat(64);
  const DB = {prepare:sql => ({bind:(...a) => ({
    first:async () => rows.get(a[0]) || null,
    run:async () => { let ch = 0;
      if (/^INSERT/.test(sql)) { if (!rows.has(a[0])) { rows.set(a[0], {ver:1, data:a[1], iv:a[2], updated:a[3]}); ch = 1; } }
      else if (/^UPDATE/.test(sql)) { const r = rows.get(a[3]); if (r && r.ver === a[4]) { Object.assign(r, {ver:r.ver + 1, data:a[0], iv:a[1], updated:a[2]}); ch = 1; } }
      else if (/^DELETE/.test(sql)) ch = +rows.delete(a[0]);
      return {meta:{changes:ch}}; }})})};
  const env = {ASSETS:{fetch:() => new Response("asset")}, SYNC_RL:{limit:async () => ({success:true})}, DB};
  const call = (m, b, i = id) => W.default.fetch(new Request("https://x/api/sync/" + i, {method:m, ...(b ? {body:JSON.stringify(b)} : {})}), env);
  const st = [(await call("GET")).status, (await call("PUT", {ver:0, data:"x", iv:"y"})).status, (await call("PUT", {ver:0, data:"x", iv:"y"})).status,
    (await call("PUT", {ver:1, data:"x2", iv:"y"})).status, (await call("PUT", {ver:1, data:"x3", iv:"y"})).status, (await (await call("GET")).json()).data,
    (await call("DELETE")).status, (await call("GET")).status, (await call("GET", null, "nope")).status, (await call("PUT", {ver:0, data:"x".repeat(300001), iv:"y"})).status].join();
  if (st !== "404,200,409,200,409,x2,200,404,400,400") fails.push(`Worker sync route: expected 404,200,409,200,409,x2,200,404,400,400, got ${st}`); }
if (!wr.d1_databases?.some(d => d.binding === "DB") || !wr.ratelimits?.some(r => r.name === "SYNC_RL")) fails.push("wrangler.jsonc: needs the DB (D1) binding and the SYNC_RL rate limit for sync");
if (!["cfbdynastyboard.com", "www.cfbdynastyboard.com"].every(h => wr.routes?.some(r => r.pattern === h && r.custom_domain))) fails.push("wrangler.jsonc: both custom domains must stay attached");

if (fails.length) { console.log("FAIL\n- " + fails.join("\n- ")); process.exit(1); }
console.log(`PASS: all 10 tabs, player database, dossier, search, roll, pipelines, house rules, program picker, recruiting & NIL, my dynasty, sliders, player abilities, planner, ${cases.length} Coach conversations, device sync, Worker, deploy config. No JS errors.`);
process.exit(0);
