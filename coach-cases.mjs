// Coach conversation suite, run by check.mjs. Each case is a fresh conversation: a list of [message, expectations].
// has / not: case-insensitive regex sources that must / must not appear in Coach's reply text.
// js: an expression evaluated in the page after the reply (P, DATA, HR, strainOf, ... are in scope); must be truthy.
// Add a case whenever you fix a Coach bug, so the fix can't quietly regress.
export default [
  // ---- building plans
  {name: "tough plan", say: [
    ["i want a tough florida dynasty", {has: ["Florida Gators", "House rules · Hardcore"], js: "P.plan.strict === 'hard' && strainLbl(strainOf(P.plan.rules))[0] === 'Hardcore'"}]]},
  {name: "casual plan", say: [["casual oregon", {has: ["Oregon Ducks", "House rules · Casual"]}]]},
  {name: "preset by name", say: [["moneyball at temple", {has: ["Temple", "Moneyball"]}]]},
  {name: "created coach", say: [["tough florida dynasty with a created coach", {has: ["created coach", "Jon Sumrall"]}]]},
  {name: "rebuild", say: [["tough florida dynasty rebuild", {has: ["Rebuild: Florida is #\\d+ of 138"]}]]},
  {name: "longest team name wins", say: [["casual georgia tech", {has: ["Georgia Tech"], not: ["Georgia Bulldogs"]}]]},
  {name: "nickname", say: [["tough gators dynasty", {has: ["Florida Gators"]}]]},
  {name: "no team", say: [["hello", {has: ["didn't catch a program"]}]]},
  {name: "no contradictions", say: [["tough michigan dynasty", {not: ["chase 5★", "5★ talent at every position"]}]]},

  // ---- relative difficulty
  {name: "a little less difficult", say: [
    ["tough florida dynasty rebuild", {js: "(window.__s = strainOf(P.plan.rules), window.__r = [...P.plan.rules], true)"}],
    ["make it a little less difficult", {has: ["What changed"], not: ["New hardcore rule set"],
      js: "P.plan.t.n === 'Florida' && strainOf(P.plan.rules) < __s && P.plan.rules.filter(x => !__r.includes(x)).length <= 1"}]]},
  {name: "much harder, team renamed", say: [
    ["casual florida", {js: "(window.__s = strainOf(P.plan.rules), true)"}],
    ["make florida much harder", {has: ["What changed"], js: "P.plan.t.n === 'Florida' && strainOf(P.plan.rules) > __s"}]]},
  {name: "tone it down keeps named rules", say: [
    ["tough florida dynasty", {}], ["no transfers", {has: ["Closed portal"]}],
    ["tone it down a lot", {js: "P.plan.rules.includes('port-none')"}]]},

  // ---- rule editing
  {name: "remove a rule by name", say: [
    ["tough florida dynasty", {js: "(window.__id = P.plan.rules[0], true)"}],
    ["remove __NAME__", {has: ["Removed"], js: "!P.plan.rules.includes(__id)"}]]},
  {name: "swap a rule", say: [
    ["tough florida dynasty", {js: "(window.__id = P.plan.rules.find(x => HR[x].c === 'nil'), !!__id)"}],
    ["swap __NAME__", {has: ["Swapped"], js: "!P.plan.rules.includes(__id) && P.plan.rules.some(x => HR[x].c === 'nil')"}]]},
  {name: "swap for a named rule", say: [
    ["tough florida dynasty", {}], ["no transfers", {}],
    ["swap closed portal for patch the holes", {has: ["Swapped", "Patch the holes"], js: "!P.plan.rules.includes('port-none') && P.plan.rules.includes('port-patch')"}]]},
  {name: "add a rule", say: [
    ["casual florida", {}], ["add heisman or bust", {has: ["Heisman or bust"], js: "P.plan.rules.includes('game-heis')"}]]},
  {name: "category lighter", say: [
    ["tough florida dynasty", {js: "(window.__n = P.plan.rules.find(x => HR[x].c === 'nil'), true)"}],
    ["make the nil rule lighter", {has: ["What changed"], js: "!__n || !P.plan.rules.includes(__n)"}]]},
  {name: "undo", say: [
    ["tough florida dynasty", {js: "(window.__r = [...P.plan.rules], true)"}], ["make it a lot easier", {}],
    ["undo", {has: ["Undid"], not: ["\\((\\d+) pts\\) to \\w+ \\(\\1 pts\\)"], js: "JSON.stringify(P.plan.rules) === JSON.stringify(__r)"}]]},
  {name: "explain a rule in the plan", say: [
    ["tough florida dynasty", {}], ["no transfers", {}],
    ["why is closed portal in there?", {has: ["Closed portal", "Why it's in your plan", "roster spots"]}]]},
  {name: "explain without a plan", say: [["what does earn the headset mean", {has: ["Earn the headset", "coordinator"]}]]},
  {name: "new plan with a named rule is not an edit", say: [
    ["tough florida dynasty", {}], ["moneyball at temple with closed portal", {has: ["Temple"], js: "P.plan.t.n === 'Temple'"}]]},

  // ---- rosters and staff
  {name: "best player", say: [["who is the best player on ohio state?", {has: ["Jeremiah Smith"], not: ["House rules"]}]]},
  {name: "best QB follow-up", say: [["best player on ohio state", {}],
    ["best QB?", {js: "document.querySelector('#pLog .pm.bot:last-child').textContent.includes([...DATA.find(t => t.n === 'Ohio State').r].filter(p => p[1] === 'QB').sort((a, b) => b[3] - a[3] || b[5] - a[5])[0][0])"}]]},
  {name: "top 5", say: [["top 5 players at texas", {js: "(document.querySelector('#pLog .pm.bot:last-child').textContent.match(/OVR/g) || []).length === 5"}]]},
  {name: "split positions", say: [["best free safety at texas", {has: [" · FS · "], not: [" · SS · "]}], ["best linebacker at texas", {has: [" · (SAM|MIKE|WILL) · "]}], ["best mike linebacker at georgia", {has: [" · MIKE · "]}], ["best punter at texas", {has: [" · P · "], not: [" · K · "]}]]},
  {name: "head coach", say: [["who is oregon's head coach?", {has: ["Dan Lanning"]}], ["and the OC?", {has: ["Offensive coordinator"], not: ["Dan Lanning"]}]]},

  // ---- league-wide
  {name: "best QB in the country", say: [["who has the best QB in the country?",
    {js: "document.querySelector('#pLog .pm.bot:last-child').textContent.includes(DATA.flatMap(t => t.r.filter(p => p[1] === 'QB')).sort((a, b) => b[3] - a[3] || b[5] - a[5])[0][0])"}]]},
  {name: "best WR in the SEC", say: [["best wr in the sec", {has: ["SEC"], not: ["Ohio State"]}]]},
  {name: "biggest NIL in the Big Ten", say: [["which big ten team has the biggest nil budget",
    {js: "document.querySelector('#pLog .pm.bot:last-child li').textContent.includes(DATA.filter(t => t.c === 'Big Ten').sort((a, b) => b.nt - a.nt)[0].n)"}]]},
  {name: "lowest NIL", say: [["which team has the smallest nil budget", {has: ["Smallest NIL"]}]]},
  {name: "rebuild jobs", say: [["best sec team for a rebuild", {has: ["Best rebuild jobs · SEC"], not: ["Big Ten", "Georgia \\(", "Alabama \\("]}]]},
  {name: "most titles", say: [["which teams have the most national titles", {has: ["Alabama"]}]]},
  {name: "pipeline by state", say: [["who has a tier 5 pipeline in texas", {has: ["Texas pipelines", "Tier 5"]}]]},
  {name: "pipeline by region", say: [["best pipeline in metro atlanta", {has: ["Metro Atlanta pipelines"]}]]},
  {name: "compare", say: [["florida vs florida state", {has: ["Florida vs Florida State", "Overall", "Best players", "Head coaches"]}]]},
  {name: "compare word", say: [["compare ohio state and michigan", {has: ["Ohio State vs Michigan"]}]]},
  // ---- messy input
  {name: "typo", say: [["tough floida dynasty", {has: ["Reading “floida” as Florida", "Florida Gators"]}]]},
  {name: "transposed typo", say: [["casual gerogia dynasty", {has: ["Georgia Bulldogs"]}]]},
  {name: "nickname alias", say: [["tough bama dynasty", {has: ["Alabama Crimson Tide"]}]]},
  {name: "the U", say: [["best players at the u", {has: ["Miami"], not: ["Which one"]}]]},
  {name: "rule words are not typos", say: [["tough florida dynasty", {}], ["no transfers", {}],
    ["swap closed portal for patch the holes", {has: ["Patch the holes"], not: ["Reading"]}]]},
  {name: "ambiguous Miami", say: [["tough miami dynasty", {has: ["Which one", "Miami Hurricanes", "Miami University"]}],
    ["2", {has: ["Miami University"], js: "P.plan && P.plan.t.n === 'Miami University'"}]]},
  {name: "ambiguous UT by name", say: [["best player at ut", {has: ["Which one", "Tennessee"]}], ["tennessee", {has: ["Tennessee"], js: "P.team.n === 'Tennessee'"}]]},
  {name: "tailored fallback", say: [["tough oregon dynasty", {}], ["banana", {has: ["About Oregon you can ask", "Oregon vs"]}]]},
  {name: "no false typo on plain words", say: [["what can you do", {not: ["Reading"]}]]},

  // ---- challenge suggestions
  {name: "challenge ideas", say: [["what's a good dynasty challenge?", {has: ["Three dynasty challenges", "Goal"], not: ["###", "2025"], js: "P.choices.length === 3"}],
    ["2", {has: ["Your goal"], js: "P.plan && P.plan.goalName && P.plan.t === P.past.concat([P.plan]).pop().t"}]]},
  {name: "challenge by team name", say: [["give me some dynasty ideas", {js: "(window.__c = P.choices[0], true)"}],
    ["__TEAM__", {has: ["Your goal"], js: "P.plan.t === __c.t"}]]},
  {name: "more ideas", say: [["surprise me with a challenge", {}], ["more ideas", {has: ["Three dynasty challenges"]}]]},
  {name: "challenge with a team is a plan", say: [["tough florida dynasty challenge", {has: ["Florida Gators"], not: ["Three dynasty challenges"]}], ["add conference footprint", {not: ["shaded below"]}]]},
  {name: "markdown leaks", say: [["x", {js: "pMd('**### Title**\\n- -\\n- real') === '<h4>Title</h4><ul><li>real</li></ul>'"}]]},

  // ---- follow-ups carry the last kind of question
  {name: "follow-up players", say: [["best QB at ohio state", {}], ["what about michigan?", {has: ["Michigan · Best QB"], not: ["House rules"]}]]},
  {name: "follow-up their defense", say: [["best QB at michigan", {}], ["and their defense?", {has: ["Michigan · Defense", "#\\d+ of 138", "Best on that side"]}]]},
  {name: "follow-up compare", say: [["florida vs georgia", {}], ["what about lsu", {has: ["Florida vs LSU"]}]]},
  {name: "follow-up conference", say: [["best wr in the sec", {}], ["how about the big ten", {has: ["Best WR · Big Ten"], not: ["· SEC"]}]]},
  {name: "follow-up staff", say: [["who is oregon's head coach?", {}], ["what about texas?", {has: ["Texas · Head coach"]}]]},
  {name: "follow-up after plan is a plan", say: [["tough florida dynasty", {}], ["what about michigan?", {has: ["Michigan Wolverines", "House rules · Hardcore"]}]]},
  {name: "team stat", say: [["how good is alabama's defense", {has: ["Alabama · Defense", "in the SEC"]}]]},
  {name: "moneyball is still a preset", say: [["moneyball at temple", {has: ["Moneyball"], not: ["NIL budget:"]}]]},

  // ---- roster roadmap
  {name: "roadmap", say: [["plan my first 3 seasons at florida", {has: ["3-season roster roadmap", "After season 1", "After season 3", "Recruiting priorities"], not: ["House rules"]}]]},
  {name: "roadmap priorities include big losses", say: [["florida roster needs", {has: ["Recruiting priorities.*OL"]}]]},
  {name: "roadmap 2 seasons", say: [["plan my first two seasons at texas", {has: ["2-season"], not: ["After season 3"]}]]},
  {name: "roadmap follow-up", say: [["florida roster roadmap", {}], ["what about georgia?", {has: ["Georgia · 3-season roster roadmap"]}]]},

  // ---- combined filters
  {name: "filters: conference + overall + pipeline", say: [["sec teams under 85 overall with a texas pipeline",
    {has: ["SEC · overall under 85 · Texas pipeline"], js: "[...document.querySelectorAll('#pLog .pm.bot:last-child li')].slice(1).every(li => { const t = DATA.find(x => li.textContent.startsWith(x.n + ' (')); return t && t.c === 'SEC' && t.o < 85 && t.pl.some(p => regsIn('TX').includes(p[0])); })"}]]},
  {name: "filters: G5 + NIL rank", say: [["group of five teams with a top 50 nil budget", {has: ["Group of Five · top-50 NIL budget"]}]]},
  {name: "filters: prestige + titles", say: [["big ten teams with at least 4 stars prestige and a national title", {has: ["prestige at least 4★", "at least one national title"]}]]},
  {name: "filters: nothing matches", say: [["sec teams under 60 overall", {has: ["0 programs", "loosening"]}]]},

  // ---- memory
  {name: "remembers difficulty", say: [["tough florida dynasty", {}], ["oregon dynasty", {has: ["House rules · Hardcore"]}]]},
  {name: "survives reload", say: [["tough florida dynasty", {}], ["no transfers", {}],
    ["x", {js: "(pSave(), P.plan = null, P.team = null, P.past = [], document.querySelector('#pLog').innerHTML = '', pLoad()) && P.plan.t.n === 'Florida' && P.plan.rules.includes('port-none') && P.past.length === 1 && document.querySelectorAll('#pLog .pm').length >= 6"}]]},
  {name: "start over", say: [["tough florida dynasty", {}], ["start over", {has: ["I'm Coach"], js: "!P.plan && !P.pref && !localStorage.getItem('coach-v1') && document.querySelectorAll('#pLog .pm').length === 1"}]]},

  {name: "powerhouse", say: [["former powerhouse back to glory, 3 options?", {has: ["Minnesota", "1960"]}]]},
];
