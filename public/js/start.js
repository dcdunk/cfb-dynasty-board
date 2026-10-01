// Runs last: first draw of the Program Database, then reopen the tab named in the URL hash.
draw();
{ const k = Object.keys(TSLUG).find(k => TSLUG[k] && "#" + TSLUG[k] === location.hash); if (k) showTab(k, true); }
