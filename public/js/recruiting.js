// Recruiting & NIL tab: program-level recruiting plan.
/* ---- recruiting & NIL plan ---- */
// Program-level, year-agnostic: users may take a job in year 5, so nothing here depends on this save's roster or uncommitted NIL.
// Hours: sources give only the endpoints (1-star ~350, 5-star ~1,000 preseason hours); in between is a straight-line estimate.
const recHours = p => Math.round((350 + (Math.min(5, Math.max(1, p)) - 1) * 650 / 4) / 10) * 10;
const RCOST = [["Offer scholarship",5],["Search social media",5],["DM the player",10],["Scout (per session)",10],["Schedule visit","10–20"],
  ["Soft sell",20],["Contact friends and family",25],["Sway",30],["Hard sell",50],["Send the house",50]];
// Grades a coach can't move quickly vs grades earned by results and tenure (GRADES order).
const GLAST = ["Conference","Brand exposure","Facilities","Academics","Campus life"];
const ARCH = [
  [4.5, "Blue blood", "You have the most hours in the sport, so recruit nationally on top of your pipelines. Chase 5★ talent at every position, keep 2 to 4 true long shots, and spend most NIL keeping your stars from being poached."],
  [3.5, "Contender", "Win your pipelines first, then pick a few national battles for 5★ players at premium positions. Split NIL between retaining starters and closing on the handful of recruits who change your ceiling."],
  [2.5, "Climber", "Pipeline-first. Build the class from your strongest regions and use the transfer portal for immediate starters. Save NIL for a few difference makers rather than matching bigger schools on every offer."],
  [0, "Rebuild", "Hours are scarce, so stay close to home and scout early. Target recruits who care about playing time, fill holes through the portal, and avoid bidding wars you can't sustain. Keep the few good players you have."]];
const NILRANK = [...DATA].sort((a, b) => b.nt - a.nt).map(t => t.n);
let rTeam = "", rLink = true;
try { const v = JSON.parse(localStorage.getItem("rec-v1") || "null"); if (v) { rLink = v.link !== false; rTeam = v.team || ""; } } catch (e) {}
const recSave = () => { try { localStorage.setItem("rec-v1", JSON.stringify({link:rLink, team:rTeam})); } catch (e) {} };
const recTeam = () => rLink ? H.team : rTeam;
function recPick(n){ if (rLink) hSetTeam(n); else rTeam = n; recSave(); recDraw(); }
function recDraw(){
  const t = DATA.find(x => x.n === recTeam());
  $("#rLink").setAttribute("aria-checked", rLink);
  if (document.activeElement !== $("#rq")) $("#rq").value = t.n;
  $("#recGrid").innerHTML = recBody(t);
}
const recSec = (n, h, sub, body) => `<section class="rec-sec"><h3 class="rec-sh"><b>0${n}</b>${h}<span>${sub}</span></h3>${body}</section>`;
// The recruiting & NIL plan for team t. dyn: the My Dynasty version, numbered after its House rules section and showing every pipeline.
function recBody(t, dyn){
  const gv = n => t.g[GRADES.indexOf(n)];
  const [, arch, plan] = ARCH.find(a => t.p >= a[0]), target = Math.min(5, Math.floor(t.p) + 1), nr = NILRANK.indexOf(t.n) + 1;
  const last = GLAST.map(n => [n, gv(n)]).sort((a, b) => GVAL[b[1]] - GVAL[a[1]]), earned = GRADES.filter(n => !GLAST.includes(n)).map(n => [n, gv(n)]);
  let hard = last.filter(x => GVAL[x[1]] >= 9); if (!hard.length) hard = last.slice(0, 2);
  const soft = last.filter(x => !hard.includes(x) && GVAL[x[1]] >= 5), weak = last.filter(x => !hard.includes(x) && GVAL[x[1]] < 5);
  const grs = (h, sub, xs) => `<div class="grp"><h4>${h}<small>${sub}</small></h4>${xs.length
    ? xs.map(([n, g]) => `<span class="gr">${n} <b>${g}</b></span>`).join("") : '<span class="gr" style="color:var(--faint)">None</span>'}</div>`;
  const [tier, regs] = purist(t), pl = t.pl.filter(p => p[1] > 0).sort((a, b) => b[2] - a[2]);
  const map = hMap(dyn ? pl.map(p => p[0]) : regs, tiersOf(t))
    .replace(/<figcaption>.*<\/figcaption>/, dyn ? `<figcaption>Every active pipeline (${pl.length} regions), colored by tier</figcaption>`
      : `<figcaption>Shaded: Tier ${tier}+ pipelines (${regs.length} regions), colored by tier</figcaption>`);
  // ---- program-specific spending + year-one advice: in-game data + real-world recruiting patterns (sources in #recSrc4)
  const cn = t.c === "Independent" ? null : t.c, cA = /^Conference/.test(t.c) ? "" : "the ";
  const peers = cn ? DATA.filter(x => x.c === t.c) : DATA.filter(isP4);           // independents compare against P4
  const confT = [...peers].sort((a, b) => b.nt - a.nt), cr = confT.indexOf(t) + 1, inConf = cn ? `${cA}${esc(cn)}` : "Power 4 football";
  const richer = confT.slice(0, cr - 1).slice(0, 3).map(x => x.n), poorer = confT.length - cr;
  const hs = hard.map(x => x[0].toLowerCase()), topP = pl[0], p4 = isP4(t);
  const rivals = topP ? DATA.filter(x => x !== t && x.pl.some(q => q[0] === topP[0] && q[1] >= 3))
    .map(x => [x, x.pl.find(q => q[0] === topP[0])[1]]).sort((a, b) => b[1] - a[1] || b[0].nt - a[0].nt).slice(0, 4) : [];
  const outspend = rivals.filter(([x]) => x.nt > t.nt), undercut = rivals.filter(([x]) => x.nt <= t.nt);
  const listRich = richer.length > 2 ? `${esc(richer.join(", "))} and others` : esc(and(richer));
  const side = t.df - t.of >= 3 ? ["defense", "offense", t.df, t.of] : t.of - t.df >= 3 ? ["offense", "defense", t.of, t.df] : null;
  const home = regsIn(stOf(t)), homeT = Math.max(0, ...t.pl.filter(q => home.includes(q[0])).map(q => q[1]));
  const hub = ["TX", "FL", "GA", "OH", "CA"].includes(stOf(t)), stN = STNAME[stOf(t)] || stOf(t), natl = t.p >= 4.5;
  const nilTips = [
    cr === 1 ? `<b>Biggest budget in ${inConf}.</b> At ${fmt(t.nt)} you can outbid every rival there, so use NIL to lock down your own pipelines first.`
      : cr <= Math.ceil(confT.length / 3) ? `<b>Top-third budget in ${inConf}</b> (#${cr} of ${confT.length}). Only ${esc(and(richer))} can outspend you; pick your fights with them and outbid the other ${poorer}.`
      : cr > confT.length * 2 / 3 ? `<b>Bottom-third budget in ${inConf}</b> (#${cr} of ${confT.length}). ${listRich} can outbid you, so don't match offers. Win on ${esc(and(hs))} instead.`
      : `<b>Middle of ${inConf} on budget</b> (#${cr} of ${confT.length}). Outbid the schools below you when it matters and let ${esc(and(richer))} win the bidding wars.`,
    p4 && t.p >= 3.5
      ? `<b>Retention first.</b> Programs at this level lose starters to poaching, not to recruiting misses. Pay the players others will call about before chasing new names.`
      : p4 ? `<b>Split it.</b> Keep your few proven starters, then put the rest into a class you can develop. Mid-tier Power 4 rosters turn over through both the portal and recruiting.`
      : `<b>Expect Power 4 schools to poach your breakout players.</b> Transfers from Group of Five to Power 4 jumped 40% in a year. Save retention money for your top two or three producers and let the rest go.`,
    `<b>Pay by position like the real market.</b> Quarterback first, then offensive tackle, edge rusher, receiver and corner. Running backs are the cheapest to replace.${side ? ` Your ${side[0]} (${side[2]}) is ahead of your ${side[1]} (${side[3]}), so tilt spending toward the ${side[1]}.` : ` Your offense (${t.of}) and defense (${t.df}) are balanced, so spend on the best player available.`}`,
    weak.length ? `<b>Weak spots cost extra.</b> Recruits whose dealbreaker is ${esc(and(weak.map(x => x[0].toLowerCase())))} will need NIL to overlook it. Usually not worth it.`
      : `<b>No weak lasting grades.</b> You rarely need NIL to cover a dealbreaker, so offers can go toward talent, not damage control.`];
  const inSt = DATA.filter(x => x !== t && stOf(x) === stOf(t)).sort((a, b) => b.p - a.p);
  const above = inSt.filter(x => x.p > t.p), below = inSt.filter(x => x.p <= t.p);
  const lowE = [...earned].sort((a, b) => GVAL[a[1]] - GVAL[b[1]])[0];
  const pr = [...peers].sort((a, b) => b.p - a.p).indexOf(t) + 1;
  const yearTips = [
    `<b>${natl ? "Recruit nationally, but own home." : "Win your backyard."}</b> ${natl ? "Your brand travels, yet the most stable national programs (Georgia, Ohio State, Notre Dame) still keep strong homegrown pipelines." : "Outside a handful of national brands, programs build through their own region."} ${hub ? `${esc(stN)} is one of the five richest recruiting states` : `${esc(stN)} isn't one of the top talent states`}${homeT >= 3 ? `, and your home pipeline is ${TIERN[homeT]}. Protect it before recruiting anywhere else.` : homeT ? `${hub ? ", but" : ", and"} your home pipeline is only ${TIERN[homeT]}. Building it up is the cheapest long-term win.` : `, and you have no pipeline at home yet. Start there.`}`,
    inSt.length ? `<b>In-state competition.</b> ${above.length ? `${esc(and(above.slice(0, 3).map(x => `${x.n} (${x.p}★)`)))} ${above.length > 1 ? "outrank" : "outranks"} you at home.` : `No in-state program outranks you.`}${below.length ? ` You should win recruits over ${esc(and(below.slice(0, 3).map(x => x.n)))}.` : ""}`
      : `<b>Only FBS program in ${esc(stN)}.</b> In-state recruits are yours to lose; lean on proximity to home.`,
    topP ? (outspend.length ? `<b>${esc(topP[0])} is contested.</b> ${esc(and(outspend.map(([x, tr]) => `${x.n} (${TIERN[tr]})`)))} ${outspend.length > 1 ? "recruit" : "recruits"} there with more NIL than you. Beat them on relationships and your hard-sell grades.`
      : undercut.length ? `<b>You're the money in ${esc(topP[0])}.</b> ${esc(and(undercut.map(([x]) => x.n)))} also recruit${undercut.length > 1 ? "" : "s"} there with less NIL, so a strong offer usually wins.`
      : `<b>${esc(topP[0])} is yours.</b> No other program holds a Tier 3+ pipeline there.`) : `<b>No established pipelines.</b> Every region is a fair fight, so let scouting decide where you spend hours.`,
    p4 && t.p >= 4 ? `<b>High school first, portal to patch.</b> The most stable programs (Georgia, Ohio State, Notre Dame) take the fewest transfers. Use the portal for one or two plug-in starters a year.`
      : `<b>Use the portal every year.</b> Every program now gets at least a fifth of its new players there. ${p4 ? "Target proven Group of Five starters ready to move up." : "FCS standouts and Power 4 backups give you instant starters high school recruits can't."}`,
    `<b>Know your standing.</b> #${pr} of ${peers.length} on prestige in ${cn ? `${cA}${esc(cn)}` : "Power 4"}. ${pr <= 3 || natl ? "Anything short of a title run is a step back." : pr > peers.length / 2 ? "A winning conference record is a real first-year goal." : "A top-half finish and a bowl build the prestige recruits notice."}${GVAL[lowE[1]] <= 6 ? ` Expect ${esc(lowE[0].toLowerCase())} (${lowE[1]}) to stay low until you win.` : ""} <button type="button" class="ghost" data-roster="${esc(t.n)}">Current roster</button>`];
  const sec = (n, ...a) => recSec(n + (dyn ? 1 : 0), ...a);
  return sec(1, "The program", `${esc(t.n)} · ${esc(t.c)}`, `<div class="sl-card rec-hero">
    <div><div class="arch">${arch}</div>
      <p class="note" style="margin-top:8px">${plan}</p>
      <p class="note">Prestige moves with results. If it rises or falls by the time you're there, use that tier's approach instead.</p></div>
    <div><div class="kpis">
      <div><div class="big">${t.p}★</div><span>Prestige</span></div>
      <div><div class="big">${target}★</div><span>Recruits to target</span></div>
      <div><div class="big">${fmt(t.nt)}</div><span>NIL budget · #${nr} of ${DATA.length}</span></div>
      <div><div class="big">~${fmt(recHours(t.p))}</div><span>Preseason hours</span></div></div>
      <p class="note">Target about one star above prestige. Each recruit takes at most <b>50 hours a week</b> from you, or 70 with the Always Be Crootin coach ability.</p></div></div>`)
  + sec(2, dyn ? "Pipelines" : "Where to recruit", `${pl.length} active pipelines`, `<div class="sl-card rec-where">
    <div>${map}</div>
    <div><table><tbody>${(dyn ? pl : pl.slice(0, 10)).map(p => `<tr><td class="swc"><i class="sw" style="background:var(--t${p[1]})" role="img" aria-label="Tier ${p[1]}"></i></td><td class="l">${esc(p[0])}</td><td class="sub">${TIERN[p[1]]}</td><td class="mono">${p[2]}</td></tr>`).join("")}</tbody></table>${dyn ? `<button type="button" class="ghost" data-pipe="${esc(t.n)}">Open in Program Pipelines</button>` : ""}</div></div>`)
  + sec(3, "What to pitch", "From the grades that last", `<div class="sl-card">
    <div class="rec-pitch">${grs("Hard sell", "big swing, worth the risk", hard)}${grs("Soft sell", "steady, smaller gains", soft)}${grs("Avoid", "skip recruits whose dealbreaker is here", weak)}</div>
    <div class="earned"><h4>Earned grades</h4>${earned.map(([n, g]) => `<span class="gr" style="color:var(--dim)">${n} <b>${g}</b></span>`).join("")}<span class="sub">change with your results and tenure; recheck when you take over</span></div>
    <p class="note" style="padding:0 16px 14px;margin:0">Target recruits whose top motivations match your hard-sell grades. Breaking a promise on a dealbreaker is a top reason players enter the portal.</p></div>`)
  + sec(4, "Spending and year one", `Built from ${esc(t.n)}'s budget, rivals and grades`, `<div class="rec-2">
    <div class="sl-card"><h3>NIL plan<span>${esc(t.n)}</span></h3><ul class="tips">${nilTips.map(x => `<li>${x}</li>`).join("")}</ul>
      <p class="note" style="padding:0 12px 12px;margin:0">How NIL works: an offer becomes the player's floor and rises as they produce, offers are refunded if the recruit goes elsewhere, and graduating seniors free up money each offseason.</p></div>
    <div class="sl-card"><h3>Recruiting plan<span>Year one at ${esc(t.n)}</span></h3><ul class="tips">${yearTips.map(x => `<li>${x}</li>`).join("")}</ul></div></div>`)
  + sec(5, "Hour costs", "Per recruiting action. A visit uses only your hours, not the recruit's 50-hour cap", `<div class="sl-card"><div class="rec-costs">${
    RCOST.map(([n, h]) => `<div><span>${n}</span><b>${h} hrs</b></div>`).join("")}</div></div>`);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-roster]"); if (b) openTeam(b.dataset.roster); });
$("#rLink").addEventListener("click", () => { rLink = !rLink; if (!rLink) rTeam = H.team; recSave(); recDraw(); });
