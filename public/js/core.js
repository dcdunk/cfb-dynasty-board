// Shared setup: board columns and grades, sort state, $ and number helpers, text helpers. Loads first after the data files.
const GRADES = ["Title contender","Coach prestige","Conference","Brand exposure",
                "Facilities","Coach stability","Academics","Campus life"];
const GVAL = {"F":0,"D-":1,"D":2,"D+":3,"C-":4,"C":5,"C+":6,"B-":7,"B":8,"B+":9,"A-":10,"A":11,"A+":12};
const DEVN = ["","Impact","Star","Elite"];
const COLS = [
  {k:"rk", t:"#",        cls:"l"},
  {k:"n",  t:"Program",  cls:"l"},
  {k:"c",  t:"Conf",     cls:"l"},
  {k:"o",  t:"Ovr"},
  {k:"of", t:"Off"},
  {k:"df", t:"Def"},
  {k:"p",  t:"Prestige"},
  {k:"ti", t:"Titles"},
  {k:"nt", t:"NIL"},
  {k:"ap", t:"Roster avg"}
];

let sortKey = "o", sortDir = -1, conf = "All", query = "", picked = null;

const $ = s => document.querySelector(s);
const fmt = n => n.toLocaleString("en-US");


// Text helpers shared by every tab: accent-insensitive lowercase, HTML escaping, search-hit highlighting.
const norm = x => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// Escapes s and wraps the first match of q in <mark class="hit">. Used by the picker and the table searches.
function hl(s, q){
  const v = norm(q.trim()), i = norm(s).indexOf(v);
  return v && i >= 0 ? esc(s.slice(0, i)) + '<mark class="hit">' + esc(s.slice(i, i + v.length)) + "</mark>" + esc(s.slice(i + v.length)) : esc(s);
}

// A tab can keep its own view in the hash too (#abilities/cb), so refresh lands on the same page: TSUB[tab]() gives the "/..." part.
const TSUB = {};
// Filters as "/key=value&..." (empty ones left out), read back with new URLSearchParams.
const hashQ = o => { const q = new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString(); return q ? "/" + q : ""; };

// A roster row's archetype (r[6] indexes PARCH.a, from tools/player-archetypes.mjs); "" when TeamCrafters didn't list the player.
const parch = r => r[6] != null && typeof PARCH !== "undefined" ? PARCH.a[r[6]] || "" : "";
