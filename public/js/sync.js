// Device sync (My Dynasty): one sync code links a person's devices, no account.
// The code never leaves the browser: a SHA-256 of it is the record id, and a key made from it (PBKDF2) encrypts the data
// (AES-GCM), so /api/sync (src/worker.js, D1) only stores unreadable blobs. Synced: the backup keys minus the theme,
// which is per device. Each sync reads the online copy, merges it with this device's data, writes back if anything differs,
// and reloads the page when the other device changed something here (like Restore does, so the normal loaders run).
const SKEYS = BAKKEYS.filter(k => k !== "theme-v1");
let S = {code:"", ver:0, last:{}, at:0, err:""};
try { S = {...S, ...JSON.parse(localStorage.getItem("sync-v1") || "{}")}; } catch (e) {}
const sSave = () => { try { localStorage.setItem("sync-v1", JSON.stringify(S)); } catch (e) {} };
const sGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const sLocal = () => Object.fromEntries(SKEYS.map(k => [k, sGet(k)]));

// Codes: 20 characters of Crockford base32 (100 random bits, unguessable), shown as XXXXX-XXXXX-XXXXX-XXXXX.
const SALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const sNewCode = () => [...crypto.getRandomValues(new Uint8Array(20))].map(x => SALPH[x & 31]).join("");
const sNorm = c => String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");   // forgiving typing
const sValid = c => c.length === 20 && [...c].every(x => SALPH.includes(x));
const sFmt = c => c.match(/.{5}/g).join("-");

const b64 = u => btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let SK = null;   // cached {code, id, key}
async function sKeys(code){
  if (SK && SK.code === code) return SK;
  const enc = new TextEncoder(), h = await crypto.subtle.digest("SHA-256", enc.encode("cfb-sync-id:" + code));
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name:"PBKDF2", salt:enc.encode("cfb-dynasty-board-sync"), iterations:100000, hash:"SHA-256"},
    base, {name:"AES-GCM", length:256}, false, ["encrypt", "decrypt"]);
  return SK = {code, key, id:[...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("")};
}
async function sEnc(key, obj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {data:b64(await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, new TextEncoder().encode(JSON.stringify(obj)))), iv:b64(iv)};
}
const sDec = async (key, row) => JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:unb64(row.iv)}, key, unb64(row.data))));
const sApi = (id, opt) => (window.__syncStub || fetch)(`/api/sync/${id}`, opt);

// Both devices changed the same key: lists merge by id (nothing is lost), anything else keeps one side.
function sUnion(k, a, b){
  const by = (x, y) => { const ids = new Set(x.map(i => i && i.id)); return [...x, ...y.filter(i => i && !ids.has(i.id))]; };
  try {
    const A = JSON.parse(a), B = JSON.parse(b);
    if (k === "dyn-v1") return JSON.stringify({...A, list:by(A.list || [], B.list || [])});
    if (k === "poschg-v1") return JSON.stringify(by(A, B));
    if (k === "abfav-v1") return JSON.stringify([...new Set([...A, ...B])]);
    if (k === "house-custom-v1") return JSON.stringify({...A, rules:by(A.rules || [], B.rules || []), presets:by(A.presets || [], B.presets || [])});
  } catch (e) {}
  return null;
}
// local/remote/last: {key: raw string or null}. last is what both sides held after the previous sync ({} when joining).
// preferRemote: when joining, single values (current House Rules screen, Recruiting link) come from the synced copy.
function sMerge(local, remote, last, preferRemote){
  const out = {};
  for (const k of SKEYS) {
    const l = local[k] ?? null, r = remote[k] ?? null, was = k in last ? last[k] : undefined;
    const lc = l !== was, rc = r !== was;
    out[k] = !rc || l === r ? l : !lc ? r : l === null ? r : r === null ? l : sUnion(k, l, r) ?? (preferRemote ? r : l);
  }
  return out;
}

let sBusy = null;
const sReload = () => (window.__syncReload || (() => location.reload()))();
function sOff(why){ S = {code:"", ver:0, last:{}, at:0, err:why || ""}; SK = null; sSave(); sDraw(); }
// join: this device is adding an existing code, so the code has to exist online.
function sSync(join){
  if (!S.code || sBusy) return sBusy;
  sBusy = (async () => {
    const {id, key} = await sKeys(S.code);
    for (let tries = 0; tries < 3; tries++) {
      const r = await sApi(id, {method:"GET"});
      let remote = {}, ver = 0;
      if (r.status === 200) { const row = await r.json(); remote = await sDec(key, row); ver = row.ver; }
      else if (r.status === 404) {
        if (join) return sOff("No synced data uses that code. Check it and try again.");
        if (S.ver) return sOff("Sync was turned off: the synced copy was deleted from another device.");
      } else throw new Error(r.status === 429 ? "Too many sync requests. It will try again shortly." : "Couldn't reach sync. It will try again.");
      const local = sLocal(), out = sMerge(local, remote, join ? {} : S.last, join);
      if (!ver || SKEYS.some(k => out[k] !== (remote[k] ?? null))) {
        const p = await sApi(id, {method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({ver, ...(await sEnc(key, out))})});
        if (p.status === 409) continue;   // another device wrote first: read again and merge
        if (!p.ok) throw new Error("Couldn't save to sync. It will try again.");
        ver = (await p.json()).ver;
      }
      Object.assign(S, {ver, last:out, at:Date.now(), err:""}); sSave();
      const here = SKEYS.filter(k => out[k] !== local[k]);
      if (here.length) {
        here.forEach(k => { try { out[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, out[k]); } catch (e) {} });
        try { sessionStorage.setItem("sync-note", "1"); } catch (e) {}
        sReload();
      }
      return;
    }
    throw new Error("Sync is busy on another device. It will try again.");
  })().catch(e => { S.err = e.message; sSave(); }).finally(() => { sBusy = null; sDraw(); });
  return sBusy;
}
const sChanged = () => S.code && SKEYS.some(k => sGet(k) !== (S.last[k] ?? null));
async function sOn(){ S = {code:sNewCode(), ver:0, last:{}, at:0, err:""}; sSave(); sDraw(); await sSync(); }
async function sJoin(raw){
  const c = sNorm(raw);
  if (!sValid(c)) { S.err = "That doesn't look like a sync code: it's 20 letters and numbers."; sDraw(); return; }
  S = {code:c, ver:0, last:{}, at:0, err:""}; sSave(); sDraw(); await sSync(true);
}
async function sDelete(){
  if (!S.code || !confirm("Delete the synced copy for every device using this code? Each device keeps its own saved data.")) return;
  try { const {id} = await sKeys(S.code); await sApi(id, {method:"DELETE"}); sOff(""); } catch (e) { S.err = "Couldn't delete the synced copy. Try again."; sDraw(); }
}

// QR code: qrcode-generator (MIT, vendored in js/vendor), loaded only when a code is shown.
let sQrLib = null;
const sQr = () => sQrLib || (sQrLib = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "js/vendor/qrcode.js"; s.onload = ok; s.onerror = no; document.head.append(s); }));
const sLink = code => `${location.origin}${location.pathname}#sync=${code}`;
const sAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : dDate(t); };
// Masthead button: "Sync your devices" until sync is on, then a quiet status. Opens the sync section on My Dynasty.
function sBtn(){ const b = $("#syncOpen"); if (!b) return; b.classList.toggle("on", !!S.code);
  $("#syncLbl").textContent = S.code ? (innerWidth <= 600 ? "Synced" : "Devices synced") : (innerWidth <= 600 ? "Sync" : "Sync your devices"); }
$("#syncOpen").addEventListener("click", () => {
  showTab("dyn"); const el = $("#dSync");
  el.scrollIntoView({block:"center", behavior:"smooth"}); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  const f = $("#sOn") || $("#sCopy"); if (f) f.focus({preventScroll:true});
});
addEventListener("resize", sBtn);
function sDraw(){
  sBtn();
  const el = $("#dSync"); if (!el) return;
  const err = S.err ? `<p class="hint sync-err" role="alert">${esc(S.err)}</p>` : "";
  if (!S.code) {
    el.innerHTML = `<h3 class="sync-h">Sync across devices</h3>
      <p class="hint">Keep My Dynasty, House Rules, custom rules, favorite archetypes and position changes the same on your phone and computer. No account: you get a sync code.</p>
      <div class="dbak-b"><button class="ghost pri" type="button" id="sOn">Turn on sync</button></div>
      <form class="sync-join" id="sJoinF"><input id="sCode" autocomplete="off" spellcheck="false" placeholder="Have a code? Enter it here" aria-label="Sync code">
        <button class="ghost" type="submit">Join</button></form>${err}`;
    return;
  }
  const busy = !!sBusy && !S.ver;
  el.innerHTML = `<h3 class="sync-h">Sync is on</h3>
    <div class="sync-on"><div class="sync-qr" id="sQR" aria-label="QR code to join sync on another device"></div>
      <div><p class="hint">On your other device, scan this code with the camera, or open My Dynasty there and enter:</p>
        <code class="sync-code" id="sCodeShow">${sFmt(S.code)}</code>
        <p class="hint">Anyone with this code can see and change your synced data. Treat it like a password.</p>
        <p class="hint sync-st" role="status">${busy ? "Setting up…" : S.at ? `Last synced ${sAgo(S.at)}` : "Not synced yet"}</p>${err}
        <div class="dbak-b"><button class="ghost" type="button" id="sCopy">Copy code</button><button class="ghost" type="button" id="sNow">Sync now</button></div>
        <div class="dbak-b"><button class="ghost" type="button" id="sStop">Stop syncing on this device</button><button class="ghost" type="button" id="sDel">Delete synced data</button></div></div></div>`;
  sQr().then(() => { const q = qrcode(0, "M"); q.addData(sLink(S.code)); q.make(); const box = $("#sQR"); if (box) box.innerHTML = q.createSvgTag({cellSize:4, margin:2, scalable:true}); }).catch(() => {});
}
$("#viewDyn").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "sOn") sOn();
  else if (b.id === "sNow") { S.err = ""; sSync(); }
  else if (b.id === "sStop" && confirm("Stop syncing on this device? Your data stays here, and other devices keep syncing.")) sOff("");
  else if (b.id === "sDel") sDelete();
  else if (b.id === "sCopy") navigator.clipboard.writeText(sFmt(S.code)).then(() => { b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy code", 1500); }, () => {});
});
$("#viewDyn").addEventListener("submit", e => { if (e.target.id === "sJoinF") { e.preventDefault(); sJoin($("#sCode").value); } });

// When to sync: on load, when the tab comes back into view (other device may have changed things), and every 15 s
// while visible if something changed here. Reads are cheap (one row); writes happen only when data differs.
let sSeen = 0;
document.addEventListener("visibilitychange", () => {
  if (!S.code) return;
  if (document.visibilityState === "hidden") { if (sChanged()) sSync(); }
  else if (Date.now() - sSeen > 10000) { sSeen = Date.now(); sSync(); }
});
setInterval(() => { if (document.visibilityState === "visible" && sChanged()) sSync(); }, 15000);
// A scanned QR code opens #sync=CODE: land on My Dynasty and ask before joining (the hash never reaches the server).
const sHash = location.hash.startsWith("#sync=") ? sNorm(decodeURIComponent(location.hash.slice(6))) : "";
if (sHash) { try { history.replaceState(null, "", "#my-dynasty"); } catch (e) {} }
setTimeout(() => {
  sDraw();
  try { if (sessionStorage.getItem("sync-note")) { sessionStorage.removeItem("sync-note"); const m = $("#dBakMsg"); m.textContent = "Updated with changes from your other device."; m.hidden = false; } } catch (e) {}
  if (sHash && sHash !== S.code) {
    if (confirm(`Turn on sync with code ${sValid(sHash) ? sFmt(sHash) : sHash}?\n\nThis device's saved dynasties, rules and favorites are merged with the synced copy.`)) sJoin(sHash);
  } else if (S.code) { sSeen = Date.now(); sSync(); }
}, 0);
