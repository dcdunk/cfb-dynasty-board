// Runs last: first draw of the Program Database, then reopen the tab named in the URL hash.
const H0 = location.hash;   // read before the first draw, which rewrites the hash for the Program Database
draw();
// Each tab can also restore its own view after the slash (#abilities/cb, #players/pos=QB, #programs/conf=SEC), so refresh stays put.
{ const [h, sub] = H0.slice(1).split(/\/(.*)/), k = h === "programs" ? "board" : Object.keys(TSLUG).find(k => TSLUG[k] && TSLUG[k] === h);
  if (sub) ({board: () => { bFromHash(sub); draw(); }, ab: () => { abFromHash(sub); abDraw(); }, play: () => plFromHash(sub), coach: () => { cFromHash(sub); cDraw(); },
    pipe: () => { pFromHash(sub); pDraw(); }, slide: () => { slFromHash(sub); slDraw(); }, rand: () => { rFromHash(sub); rDraw(); }, rec: () => recFromHash(sub)})[k]?.();
  if (k) showTab(k, true); }
