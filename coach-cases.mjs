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
  {name: "powerhouse", say: [["former powerhouse back to glory, 3 options?", {has: ["Minnesota", "1960"]}]]},
];
