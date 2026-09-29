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
// Never let the test browser start Coach's 1.8 GB AI model download.
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__noAI = true" });
await new Promise(r => { loaded = r; send("Page.navigate", { url: PAGE }); });

// Runs inside the page. Returns a list of failed checks.
const inPage = async () => {
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fails = [], ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const views = { tabBoard: "viewBoard", tabRand: "viewRand", tabCoach: "viewCoach", tabPipe: "viewPipe", tabHouse: "viewHouse", tabRec: "viewRec", tabSlide: "viewSlide", tabAb: "viewAb" };
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
  $('#abPos [data-p="DL"]').click(); await wait(50);
  ok(/Speed Rusher/.test($("#abGrid").textContent) && $$("#abGrid .sl-card").length === 5, "Abilities: DL chip should show 5 archetypes");
  ok(/Puts more pressure on the quarterback/.test($("#abGrid").textContent), "Abilities: descriptions should show on the cards without clicking");
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

  ok(!$("#pAi") && window.__noAI && !P.aiLoading && !P.ai, "Coach: AI toggle should be gone and the test browser must not load the model");
  // Dynasty planner: plain chat. Parses team/difficulty/extras from text and replies in prose only.
  $("#pOpen").click(); await wait(50);
  ok($("#pChat").classList.contains("on") && $("#pLog .pm.bot"), "Coach: sidebar didn't open with a greeting");
  // Desktop: the sidebar pushes the page instead of covering it.
  if (innerWidth > 900) { await wait(300); ok($("#pChat").getBoundingClientRect().left >= $(".masthead").getBoundingClientRect().right - 1, "Coach: sidebar covers the page"); }
  const ask = async q => { $("#pIn").value = q; $("#pForm").requestSubmit(); await wait(50); return [...$$("#pLog .pm.bot")].pop().textContent; };
  ok(/didn't catch a program/.test(await ask("hello")), "Planner: text with no program should get the help reply");
  let m = await ask("plan a tough Florida dynasty with a created coach");
  ok(/Florida Gators/.test(m) && /House rules · Hardcore/.test(m) && /NIL rank #\d+ of 138/.test(m) && /NIL rank: #/.test(P.facts) && /You replace|created coach starts/.test(m), "Planner: tough Florida reply missing team, hardcore or created coach");
  ok(P.plan.rules.length === 8, "Planner: Hardcore should deal 8 rules");
  ok(P.plan.rules.every(id => m.includes(unesc(HR[id].n) + ":") && m.includes(unesc(HR[id].x(P.plan.t).replace(/<[^>]+>/g, "")).slice(0, 20))), "Coach: every house rule should show its title and its rule text");
  const last = [...$$("#pLog .pm.bot")].pop();
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
  ok(!$("#pLog button, #pLog ol"), "Planner: chat should be plain messages, no cards or buttons");
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
    P.plan = null; P.team = null; P.past = []; P.facts = ""; P.pref = null; P.pending = null; localStorage.removeItem("coach-v1"); document.querySelector("#pLog").innerHTML = "";
    for (const [q0, e] of c.say) {
      const q = q0.replace("__NAME__", () => unesc(HR[window.__id].n));
      document.querySelector("#pIn").value = q; document.querySelector("#pForm").requestSubmit(); await new Promise(r => setTimeout(r, 20));
      const txt = [...document.querySelectorAll("#pLog .pm.bot")].pop()?.textContent || "", bad = [];
      for (const h of e.has || []) if (!new RegExp(h, "i").test(txt)) bad.push(`missing /${h}/`);
      for (const h of e.not || []) if (new RegExp(h, "i").test(txt)) bad.push(`should not say /${h}/`);
      try { if (e.js && !eval(e.js)) bad.push(`check failed: ${e.js}`); } catch (x) { bad.push(`check crashed: ${x.message}`); }
      if (bad.length) out.push(`Coach case "${c.name}", after "${q}": ${bad.join("; ")}. Reply: ${txt.slice(0, 300)}`);
    }
  }
  return out;
};
const cr = await send("Runtime.evaluate", { expression: `(${coachRun})(${JSON.stringify(cases)})`, awaitPromise: true, returnByValue: true });
fails.push(...(cr.result.exceptionDetails ? ["Coach suite crashed: " + cr.result.exceptionDetails.exception?.description] : cr.result.result.value));

chrome.kill(); await new Promise(r => chrome.once("exit", r));
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {} // leftover temp files are harmless
// Worker: www must 301 to the main domain, keeping the path.
const worker = (await import("./src/index.js")).default;
const env = { ASSETS: { fetch: () => new Response("site") } };
const www = await worker.fetch(new Request("https://www.cfbdynastyboard.com/a?b=1"), env);
if (www.status !== 301 || www.headers.get("location") !== "https://cfbdynastyboard.com/a?b=1") fails.push("Worker: www redirect broken");
if (await (await worker.fetch(new Request("https://cfbdynastyboard.com/"), env)).text() !== "site") fails.push("Worker: main domain not served");

if (fails.length) { console.log("FAIL\n- " + fails.join("\n- ")); process.exit(1); }
console.log(`PASS: all 8 tabs, dossier, search, roll, pipelines, house rules, program picker, recruiting & NIL, sliders, player abilities, planner, ${cases.length} Coach conversations, www redirect. No JS errors.`);
process.exit(0);
