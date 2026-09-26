// Smoke test: opens public/index.html in headless Chrome and clicks through every tab.
// Run: node check.mjs   (needs Node 22+ and Google Chrome; no npm install)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGE = pathToFileURL(resolve(process.argv[2] || join(import.meta.dirname, "public/index.html"))).href;
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
});
await send("Runtime.enable"); await send("Page.enable");
await new Promise(r => { loaded = r; send("Page.navigate", { url: PAGE }); });

// Runs inside the page. Returns a list of failed checks.
const inPage = async () => {
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fails = [], ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const views = { tabBoard: "viewBoard", tabRand: "viewRand", tabCoach: "viewCoach", tabPipe: "viewPipe", tabHouse: "viewHouse", tabRec: "viewRec", tabSlide: "viewSlide" };
  const open = async tab => {
    $("#" + tab).click(); await wait(50);
    for (const [t, v] of Object.entries(views)) ok($("#" + v).hidden === (t !== tab), `${tab}: #${v} visibility wrong`);
    ok($("#" + tab).getAttribute("aria-selected") === "true", `${tab}: not marked selected`);
    ok($("#" + views[tab]).innerText.trim().length > 50, `${tab}: view looks empty`);
  };

  ok(document.querySelector('link[rel="icon"]'), "Favicon link missing");
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
  // Split states (CA, TX, FL) must clip to their own outline; duplicate clipPath ids across maps drew them as rectangles.
  const ids = [...$$("clipPath")].map(c => c.id);
  ok(ids.length === new Set(ids).size, "Maps: duplicate clipPath ids");

  await open("tabSlide");
  const row = name => [...$$("#slGrid tr")].find(r => r.cells[0]?.innerText === name)?.innerText.replace(/\s+/g, " ");
  ok(row("QB Accuracy") === "QB Accuracy 38 32was 38", `Sliders: Heisman QB accuracy wrong: ${row("QB Accuracy")}`);
  ok($$("#slGrid .sl-card").length === 6, "Sliders: expected 6 cards");
  $('#slDiff [data-d="aa"]').click(); await wait(50);
  ok(row("WR Catching") === "WR Catching 50 60", `Sliders: All-American WR catching wrong: ${row("WR Catching")}`);
  ok($('#slDiff [data-d="aa"]').getAttribute("aria-pressed") === "true", "Sliders: difficulty chip not selected");
  return fails;
};
const r = await send("Runtime.evaluate", { expression: `(${inPage})()`, awaitPromise: true, returnByValue: true });
const fails = [...errors, ...(r.result.exceptionDetails ? ["Check crashed: " + r.result.exceptionDetails.exception?.description] : r.result.result.value)];

chrome.kill(); await new Promise(r => chrome.once("exit", r));
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {} // leftover temp files are harmless
// Worker: www must 301 to the main domain, keeping the path.
const worker = (await import("./src/index.js")).default;
const env = { ASSETS: { fetch: () => new Response("site") } };
const www = await worker.fetch(new Request("https://www.cfbdynastyboard.com/a?b=1"), env);
if (www.status !== 301 || www.headers.get("location") !== "https://cfbdynastyboard.com/a?b=1") fails.push("Worker: www redirect broken");
if (await (await worker.fetch(new Request("https://cfbdynastyboard.com/"), env)).text() !== "site") fails.push("Worker: main domain not served");

if (fails.length) { console.log("FAIL\n- " + fails.join("\n- ")); process.exit(1); }
console.log("PASS: all 7 tabs, dossier, search, roll, pipelines, house rules, program picker, recruiting & NIL, sliders, www redirect. No JS errors.");
process.exit(0);
