// Sliders tab: Matt10's, Armor & Sword's and Ratings Matter slider sets.
/* ---- sliders (Matt10 v5.5, transcribed from his revised image; first posted 9/25/26) ---- */
// Each row: [name, value] or [name, value, previous value]. Skill rows: [name, user, cpu, prevUser, prevCpu].
const SLPEN = [["Offside",50],["False Start",50],["Offensive Holding",52,50],["Facemask",40],["Block in the Back",70,50],
  ["Roughing the Passer",42,48],["Defensive PI",95],["Offensive PI","On"],["Kick Catch Interference","On"],
  ["Intentional Grounding","On"],["Roughing the Kicker","On"],["Running into Kicker","On"],["Illegal Contact","On"]];
const SLDIFF = {
  heis:{n:"Heisman", skill:[["QB Accuracy",38,32,null,38],["Pass Blocking",50,50],["WR Catching",52,52,50,50],["Run Blocking",45,45],
    ["Ball Security",55,55],["Interceptions",20,20],["Pass Coverage",50,50],["Tackling",48,48,42,42],["FG Power",40,40],
    ["FG Accuracy",40,40],["Punt Power",35,35],["Punt Accuracy",40,40],["Kickoff Power",50,50]]},
  aa:{n:"All-American", skill:[["QB Accuracy",38,45],["Pass Blocking",45,50],["WR Catching",50,60],["Run Blocking",35,50],
    ["Ball Security",55,55],["Interceptions",15,25],["Pass Coverage",50,50],["Tackling",42,50],["FG Power",40,40],
    ["FG Accuracy",40,40],["Punt Power",35,35],["Punt Accuracy",40,50],["Kickoff Power",45,50]]}
};
const SLFIX = [
  ["Game options", "Both difficulties", [["Quarter Length","12 min"],["Accelerated Clock","On"],["Min Play Clock","15 sec"],["Injuries",25],
    ["Fatigue",40],["Min Player Speed Threshold",75],["Auto-Subs","Default"]]],
  ["Wear and tear", "Impact and recovery", [["Normal Tackle",30],["Catch Tackle",35],["Hit Stick",40],["Cut Stick",40],
    ["Defender Tackle Advantage",45],["Sack",35],["Block",25],["Impact Block",40],["Per-Play Recovery",60],["Per-Timeout Recovery",60],
    ["Between-Quarter Recovery",65],["Halftime Recovery",70],["Week-to-Week / In-Game Healing","90 / 85"]]],
  ["Weather", "Precipitation impact", [["Catch Chance",50],["Pass Accuracy",50],["Pass Strength",50],["Broken Tackle",50],
    ["Kicking Accuracy",50],["Kicking Strength",50],["Movement Penalty",50]]],
  ["Preferences", "Optional", [["Kicking","Tap & Hold"],["Passing Type","Revamped"],["Pass Slowdown","Off"],["Pass Lead Increase","Small"],
    ["Reticle Speed",7],["Reticle Visibility","User Only"],["Meter Visibility","User Only"],["AI WR for User","On"],["Ball Hawk","On"],
    ["Heat Seeker","Off"],["Defensive Switch","Off"],["Passing Cam","On"]]]
];
// Armor & Sword's user-played sets (owner, Oct 2026), transcribed from his Operation Sports thread, post #1: All-American
// v5.0 (equal user/CPU, his "Coach Mode & User Played" set) and Average Joe Varsity V4, both dated 9/6/26.
// Previous values come from his (+/-) notes; his CPU Run Blocking "52 (23)" on All-American reads as a typo and is shown unchanged.
const ASEQ = (n, v, was) => [n, v, v, was, was];
const ASPEN = (o, fs, h, dpi, ibb, was) => [["Offside",o,was[0]],["False Start",fs,was[1]],["Offensive Holding",h,was[2]],["Facemask",60],
  ["Defensive PI",dpi,was[3]],["Block in the Back",ibb],["Roughing the Passer",50],["Roughing the Kicker","On"],["Running into Kicker","On"],["Illegal Contact","On"]];
const SLSETS = {
  matt:{n:"Matt10", v:"v5.5 · Posted 9/25/26", d:SLDIFF, pen:SLPEN, fix:SLFIX},
  as:{n:"Armor & Sword", v:"Posted 9/6/26", fix:[
    ["Game options", "Both difficulties", [["Quarter Length","12 min"],["Accelerated Clock","On"],["Min Play Clock","25 sec"],["Coach Mode","Off"],["Auto Pass","Off"],
      ["Injuries",35],["Fatigue",65],["Min Player Speed Threshold",75]]],
    ["Wear and tear", "V3, impact and recovery", [["Normal Tackle",48],["Catch Tackle",48],["Hit Stick",60],["Cut Stick",52],["Defender Tackle Advantage",60],
      ["Sack",60],["Block",45],["Impact Block",60],["Pre-Play Recovery",50],["Per-Timeout Recovery",50],["Between-Quarter Recovery",50],["Halftime Recovery",50],
      ["Week-to-Week Recovery",60,50],["In-Game Healing Pool",55,50]]],
    ["Weather", "Precipitation impact", [["Catch Chance",60],["Pass Accuracy",65],["Pass Strength",55],["Broken Tackle",55],
      ["Kicking Accuracy",65],["Kicking Strength",65],["Slip",60],["Movement Penalty",65]]],
    ["Player XP", "Progression %", [["QB",110],["HB",125],["TE",110],["WR",50],["FB",100],["OT",100],["OG",100],["C",120],
      ["EDGE",90],["DT",90],["MLB",110],["OLB",90],["CB",100],["FS",100],["SS",120],["K / P",80]]],
    ["Transfer portal", "League settings", [["Max Transfers per Team",15],["User Transfer Chance","38 (Years 1-2), then 50"],["CPU Transfer Chance","38 (Years 1-2), then 50"]]],
    ["Preferences", "Optional", [["Kicking","Tap & Hold"],["Passing Type","Classic"],["Pass Slowdown","None"],["Pass Lead Increase","Medium"],
      ["Reticle Speed",7],["Reticle Visibility","Hidden"],["Meter Visibility","Hidden"],["AI WR for User","On"],["Ball Hawk","On"],
      ["Heat Seeker","On"],["Defensive Switch","On"],["Passing Cam","Off"]]]],
    d:{
      aa:{n:"All-American", v:"v5.0", skill:[ASEQ("QB Accuracy",39),ASEQ("Pass Blocking",60),ASEQ("WR Catching",52,45),ASEQ("Run Blocking",52),
        ASEQ("Ball Security",20),ASEQ("Interceptions",25,20),ASEQ("Pass Coverage",50),ASEQ("Tackling",49,46),ASEQ("FG Power",50,55),
        ASEQ("FG Accuracy",35),ASEQ("Punt Power",50),ASEQ("Punt Accuracy",50,45),ASEQ("Kickoff Power",50)],
        pen:ASPEN(51, 90, 60, 99, 95, [55, 55, 95, 95])},
      var:{n:"Varsity", v:"Average Joe V4", skill:[["QB Accuracy",30,30],["Pass Blocking",55,70],["WR Catching",52,52,45,45],["Run Blocking",42,60],
        ["Ball Security",20,20],["Interceptions",25,25,30,30],["Pass Coverage",50,50],["Tackling",49,49],["FG Power",50,50],
        ["FG Accuracy",35,35],["Punt Power",50,50],["Punt Accuracy",50,50],["Kickoff Power",50,50]],
        pen:ASPEN(51, 90, 60, 99, 99, [99, 99, 99])}}}
,
  // MassChaos's Ratings Matter Slider Project V4.0 (post 9/3 patch), from his thread's image (owner sent it, Oct 2026; post last
  // edited 9/7/26). All-American only. He marks changes in bold without old values, so changed cells use "" as the previous value.
  rm:{n:"Ratings Matter", v:"Posted 9/7/26", fix:[
    ["Game options", "All-American", [["Injuries",5],["Fatigue",75],["Min Player Speed Threshold",44,""],["Special Teams","SuperSim ST plays"]]],
    ["League settings", "His picks", [["Difficulty","All-American"],["Quarter Length","Your choice"],["Min Play Clock","Your choice"],["Player Progression","Automatic"]]],
    ["Transfer portal", "Still testing", [["Max Transfers per Team","Your choice"],["User Transfer Chance","Your choice"],["CPU Transfer Chance","Your choice"]]],
    ["Preferences", "Optional", [["Pass Lead Increase","Medium"],["Passing Type","Classic"],["Reticle Speed",10],["AI WR for User","On"],["Timing Catching","Off"]]]],
    d:{aa:{n:"All-American", v:"V4.0", skill:[["QB Accuracy",30,30,"",""],["Pass Blocking",53,56,"",""],["WR Catching",48,48,"",""],["Run Blocking",42,55,"",""],
      ["Ball Security",50,50],["Interceptions",30,30],["Pass Coverage",60,60,"",""],["Tackling",40,48,"",""]],
      pen:[["Offside",49],["False Start",62,""],["Offensive Holding",53,""],["Facemask",50,""],["Defensive PI",70,""],["Block in the Back",50],
        ["Roughing the Passer",50],["All Other Penalties","On"]]}}}
};
let slS = "matt", slD = "heis";
const slCell = (v, was) => was == null ? `<td class="mono">${v}</td>`
  : `<td class="mono chg" title="${was === "" ? "Changed in this version" : `Was ${was}`}">${v}</td>`;
const slCard = (h, sub, rows) => `<section class="sl-card"><h3>${h}<span>${sub}</span></h3><table><tbody>${
  rows.map(([n, v, w]) => `<tr><td class="l">${n}</td>${slCell(v, w)}</tr>`).join("")}</tbody></table></section>`;
// Set and difficulty in the URL: #sliders/s=as&d=var (Matt10 and each set's first difficulty are left out).
const slFirst = k => Object.keys(SLSETS[k].d)[0];
TSUB.slide = () => hashQ({s: slS === "matt" ? "" : slS, d: slD === slFirst(slS) ? "" : slD});
function slFromHash(sub){
  const q = new URLSearchParams(sub), k = q.get("s"), d = q.get("d");
  if (SLSETS[k]) { slS = k; slD = slFirst(k); }
  if (SLSETS[slS].d[d]) slD = d;
}
function slDraw(){
  if (curTab === "slide") tabHash();
  const S = SLSETS[slS], d = S.d[slD];
  $("#slSet").innerHTML = Object.entries(SLSETS).map(([k, x]) =>
    `<button type="button" class="chip" data-s="${k}" aria-pressed="${k === slS}">${x.n}</button>`).join("");
  $("#slDiff").innerHTML = Object.entries(S.d).map(([k, x]) =>
    `<button type="button" class="chip" data-d="${k}" aria-pressed="${k === slD}">${x.n}</button>`).join("");
  $("#slVer").textContent = d.v ? `${d.v} · ${S.v}` : S.v;
  $("#slGrid").innerHTML = `<section class="sl-card"><h3>${d.n} sliders<span>You vs CPU</span></h3><table>
    <thead><tr><th class="l">Slider</th><th>You</th><th>CPU</th></tr></thead><tbody>${
    d.skill.map(([n, u, c, pu, pc]) => `<tr><td class="l">${n}</td>${slCell(u, pu)}${slCell(c, pc)}</tr>`).join("")}</tbody></table></section>`
    + slCard("Penalties", d.pen ? d.n : "Both difficulties", d.pen || S.pen)
    + S.fix.map(([h, sub, rows]) => slCard(h, sub, rows)).join("");
}
$("#slSet").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (b) { slS = b.dataset.s; slD = slFirst(slS); slDraw(); } });
$("#slDiff").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) { slD = b.dataset.d; slDraw(); } });
slDraw();
