// Sliders tab: Matt10's slider sets.
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
    ["Fatigue",40],["Speed Parity",75],["Auto-Subs","Default"]]],
  ["Wear and tear", "Impact and recovery", [["Normal Tackle",30],["Catch Tackle",35],["Hit Stick",40],["Cut Stick",40],
    ["Defender Tackle Advantage",45],["Sack",35],["Block",25],["Impact Block",40],["Per-Play Recovery",60],["Per-Timeout Recovery",60],
    ["Between-Quarter Recovery",65],["Halftime Recovery",70],["Week-to-Week / In-Game Healing","90 / 85"]]],
  ["Weather", "Precipitation impact", [["Catch Chance",50],["Pass Accuracy",50],["Pass Strength",50],["Broken Tackle",50],
    ["Kicking Accuracy",50],["Kicking Strength",50],["Movement Penalty",50]]],
  ["Preferences", "Optional", [["Kicking","Tap & Hold"],["Passing Type","Revamped"],["Pass Slowdown","Off"],["Pass Lead Increase","Small"],
    ["Reticle Speed",7],["Reticle Visibility","User Only"],["Meter Visibility","User Only"],["AI WR for User","On"],["Ball Hawk","On"],
    ["Heat Seeker","Off"],["Defensive Switch","Off"],["Passing Cam","On"]]]
];
let slD = "heis";
const slCell = (v, was) => was == null ? `<td class="mono">${v}</td>`
  : `<td class="mono chg" title="Was ${was}">${v}</td>`;
const slCard = (h, sub, rows) => `<section class="sl-card"><h3>${h}<span>${sub}</span></h3><table><tbody>${
  rows.map(([n, v, w]) => `<tr><td class="l">${n}</td>${slCell(v, w)}</tr>`).join("")}</tbody></table></section>`;
// Difficulty in the URL: #sliders/d=aa (Heisman is the default, so it's left out).
TSUB.slide = () => hashQ({d: slD === "heis" ? "" : slD});
function slFromHash(sub){ const d = new URLSearchParams(sub).get("d"); if (SLDIFF[d]) slD = d; }
function slDraw(){
  if (curTab === "slide") tabHash();
  const d = SLDIFF[slD];
  $("#slDiff").innerHTML = Object.entries(SLDIFF).map(([k, x]) =>
    `<button type="button" class="chip" data-d="${k}" aria-pressed="${k === slD}">${x.n}</button>`).join("");
  $("#slNew").textContent = slD === "heis"
    ? "CPU QB accuracy drops to 32 so CPU quarterbacks take more shots downfield, and WR catching goes up to 52 for both sides. Tackling rises to 48 for both sides so missed tackles are less common. Block in the back goes up to give QBs a cleaner pocket, and roughing the passer comes down so they have to decide faster."
    : "The All-American set was already playing well, so only penalties changed. Block in the back goes up and roughing the passer comes down, adding aggression on both sides of the line.";
  $("#slGrid").innerHTML = `<section class="sl-card"><h3>${d.n} sliders<span>You vs CPU</span></h3><table>
    <thead><tr><th class="l">Slider</th><th>You</th><th>CPU</th></tr></thead><tbody>${
    d.skill.map(([n, u, c, pu, pc]) => `<tr><td class="l">${n}</td>${slCell(u, pu)}${slCell(c, pc)}</tr>`).join("")}</tbody></table></section>`
    + slCard("Penalties", "Both difficulties", SLPEN)
    + SLFIX.map(([h, sub, rows]) => slCard(h, sub, rows)).join("");
}
$("#slDiff").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) { slD = b.dataset.d; slDraw(); } });
slDraw();
