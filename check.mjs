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
  ok(tabs() === "tabDyn,tabBoard,tabPipe,tabCoach,tabPlay,tabRand,tabHouse,tabRec,tabSlide,tabAb" && !$("#viewBoard").hidden && curTab === "board", `Nav: expected all ten tabs with Board open, got ${tabs()}`);
  ok(!$("#tabGroups") && !$("#subtabs") && $(".tabs").getAttribute("role") === "tablist", "Nav: grouped navigation should be gone");
  $("#tabAb").click(); await wait(50); ok(!$("#viewAb").hidden && $("#tabAb").getAttribute("aria-selected") === "true", "Nav: clicking Abilities should open it");
  $("#tabAb").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(curTab === "dyn", `Nav: ArrowRight from Abilities should wrap to My Dynasty, got ${curTab}`);
  $("#tabDyn").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(curTab === "board", `Nav: ArrowRight from My Dynasty should go to Program Database, got ${curTab}`);
  ok(tabs().split(",").length === 10, "Nav: tabs should stay visible after switching");
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
  const unrated = PLAYERS.find(p => !RATINGS.p[p.team]?.[p.name]); await plCard(unrated.i); ok(/doesn't list/.test($("#plcB").textContent), "Players: unrated players should say so"); $("#plc").close();
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
  const gsC = COACHES[0].name; await gs(gsC); ok(curTab === "coach" && $("#cq").value === gsC && $$("#crows tr").length >= 1, `Search: coach ${gsC} should open Coach Database filtered`);
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
  $('#abMode [data-m="player"]').click(); await wait(20);
  $('#abPos [data-p="DL"]').click(); await wait(50);
  ok(/Speed Rusher/.test($("#abGrid").textContent) && $$("#abGrid .sl-card").length === 5, "Abilities: DL chip should show 5 archetypes");
  ok(/Puts more pressure on the quarterback/.test($("#abGrid").textContent), "Abilities: descriptions should show on the cards without clicking");
  // Unlock gates (CFB 27 game files): every archetype ability has Bronze-Platinum gates, split DE/DT only where they differ
  ok(ABARCH.every(([p, n, ab]) => ab.every(x => ABGATE[p + "|" + n]?.[x]?.every(g => g[2].split(" ").length === 4 && g[5].split(" ").length === 4))), "Abilities: every archetype ability needs 4 unlock gates and costs");
  const gr = [...$$("#abGrid .sl-card")].find(c => /^Power Rusher/.test(c.querySelector("h3").textContent));
  const gb = [...gr.querySelectorAll("li")].find(li => /Grip Breaker/.test(li.querySelector("b").textContent));
  ok(gb.querySelectorAll(".ab-gl").length === 2 && /DE/.test(gb.textContent) && /DT/.test(gb.textContent) && gb.querySelectorAll(".mt").length === 8, "Abilities: DL Power Rusher Grip Breaker should show separate DE and DT gates");
  ok(!$("#abMent .mt"), "Abilities: mental abilities have no unlock gates");
  find("#abQ", "sure hands");
  ok($$("#abGrid .sl-card").length === 6, `Abilities: Sure Hands should be in 6 archetypes, got ${$$("#abGrid .sl-card").length}`);
  find("#abQ", "");
  ok($$("#abMent li").length === 16 && !/Hot Head/.test($("#abMent").textContent), "Abilities: expected the 16 mental abilities, without Hot Head");
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
if (hb !== "" || ha !== "#abilities") fails.push(`Refresh: tab should set the URL hash (board "${hb}", abilities "${ha}")`);
// Restore end to end: apply a backup with one dynasty, reload like the Restore button does, and the page should load it and say so.
await ev(`dApplyBackup({"dyn-v1": JSON.stringify({list:[{id:"dz", name:"Restored Owls", team:"Temple", rules:[], src:"", made:0, arch:false}], cur:"dz", arch:false})}); sessionStorage.setItem("dyn-restored", "1")`);
await new Promise(r => { loaded = r; send("Page.reload"); });
const rs = await ev(`[D.list.length, D.list[0]?.name, $("#dBakMsg").textContent, $("#dBakMsg").hidden].join("|")`);
if (rs !== "1|Restored Owls|Restored from backup: 1 dynasty.|false") fails.push(`Restore: after reload expected the restored dynasty and a note, got ${rs}`);
const after = await ev(`[curTab, $("#viewAb").hidden, $("#viewBoard").hidden, $("#tabAb").getAttribute("aria-selected")].join()`);
if (after !== "ab,false,true,true") fails.push(`Refresh: reloading on #abilities should reopen Abilities, got ${after}`);

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
if (!["cfbdynastyboard.com", "www.cfbdynastyboard.com"].every(h => wr.routes?.some(r => r.pattern === h && r.custom_domain))) fails.push("wrangler.jsonc: both custom domains must stay attached");

if (fails.length) { console.log("FAIL\n- " + fails.join("\n- ")); process.exit(1); }
console.log(`PASS: all 10 tabs, player database, dossier, search, roll, pipelines, house rules, program picker, recruiting & NIL, my dynasty, sliders, player abilities, planner, ${cases.length} Coach conversations, Worker, deploy config. No JS errors.`);
process.exit(0);
