// Device sync (masthead "Sync your devices" modal): one sync code links a person's devices, no account.
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
function sUnion(k, a, b, was){
  const by = (x, y) => { const ids = new Set(x.map(i => i && i.id)); return [...x, ...y.filter(i => i && !ids.has(i.id))]; };
  try {
    const A = JSON.parse(a), B = JSON.parse(b);
    if (k === "dyn-v1") return JSON.stringify({...A, list:by(A.list || [], B.list || [])});
    if (k === "poschg-v1") return JSON.stringify(by(A, B));
    if (k === "abfav-v1") return JSON.stringify([...new Set([...A, ...B])]);
    // Archetype notes merge note by note: a note only the other device changed (or cleared) comes over; both changed keeps this one.
    if (k === "abnote-v1") { const W = was ? JSON.parse(was) : {}, o = {};
      for (const n of new Set([...Object.keys(A), ...Object.keys(B)])) { const v = B[n] !== W[n] && A[n] === W[n] ? B[n] : A[n]; if (v) o[n] = v; }
      return JSON.stringify(o); }
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
    out[k] = !rc || l === r ? l : !lc ? r : l === null ? r : r === null ? l : sUnion(k, l, r, was) ?? (preferRemote ? r : l);
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
  const m = String(raw).match(/#sync=([^&\s]+)/), c = sNorm(m ? decodeURIComponent(m[1]) : raw);   // a pasted QR link works too
  if (!sValid(c)) { S.err = "That doesn't look like a sync code: it's 20 letters and numbers."; sDraw(); return; }
  if (c === S.code) return;
  // Opening the modal made this device a code; if no other device ever used it (ver 1), remove it before switching.
  if (S.code && S.ver === 1) { try { const {id} = await sKeys(S.code); await sApi(id, {method:"DELETE"}); } catch (e) {} }
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
// Masthead button: "Sync your devices" until sync is on, then a quiet status. It opens the sync modal (#sy).
function sBtn(){ const b = $("#syncOpen"); if (!b) return; b.classList.toggle("on", !!S.code);
  $("#syncLbl").textContent = S.code ? (innerWidth <= 600 ? "Synced" : "Devices synced") : (innerWidth <= 600 ? "Sync" : "Sync your devices"); }
addEventListener("resize", sBtn);
// Opening the modal turns sync on straight away (a code and QR to scan); "Have a code?" switches this device to another one.
// iPhone/iPad: a site added to the Home Screen keeps its own storage, apart from Safari, and a scanned QR code always
// opens Safari. So the Home Screen copy (sApp) has to join by code: its modal leads with the code box instead of
// making a new code, and Safari on iOS tells people to paste the code into their Home Screen copy too.
const sApp = () => window.__standalone ?? (navigator.standalone === true || matchMedia("(display-mode: standalone)").matches);
const sIOS = () => window.__ios ?? (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
function sOpen(){
  $("#sy").showModal(); sDraw(); $("#syX").focus();
  if (!S.code && !sApp()) sOn();
}
const SWHAT = [["My Dynasty", "every saved dynasty, active and archived"], ["House Rules", "the current rule set, plus your custom rules and presets"],
  ["Recruiting & NIL", "which program it follows, and your recruiting board"], ["Abilities", "favorite archetypes, archetype notes and planned position changes"], ["Phone tab bar", "which tabs you pinned"]];
function sDraw(){
  sBtn();
  const el = $("#syBody"); if (!el || !$("#sy").open) return;
  const err = S.err ? `<p class="hint sync-err" role="alert">${esc(S.err)}</p>` : "";
  const st = !S.code ? "" : !S.ver ? "Setting up…" : S.at ? `Synced ${sAgo(S.at)}` : "Not synced yet";
  const join = `<form class="sync-join" id="sJoinF"><input id="sCode" autocomplete="off" spellcheck="false" placeholder="Code from another device" aria-label="Sync code from another device">
      <button class="ghost${S.code ? "" : " pri"}" type="submit">Join</button></form>`, appFirst = !S.code && sApp();
  // Top of the modal: the Home Screen copy asks for a code; otherwise this device's code and QR, or a button to make one.
  const top = appFirst ? `<p class="hint">Enter (or paste) the sync code shown on your other device under Sync your devices.</p>${join}
      <div class="sync-row sync-alt"><button class="ghost" type="button" id="sNew">Or make a new sync code</button></div>`
    : S.code ? `<div class="sync-on"><div class="sync-qr" id="sQR" role="img" aria-label="QR code that opens this site and joins sync"></div>
      <div class="sync-txt"><p class="hint">Scan this with your phone's camera, or enter the code on your other device:</p>
        <code class="sync-code" id="sCodeShow">${sFmt(S.code)}</code>
        <div class="sync-row"><button class="ghost" type="button" id="sCopy">Copy code</button><span class="hint sync-st" role="status">${st}</span></div>
        <p class="hint">Anyone with this code can see and change your synced data. Treat it like a password.</p></div></div>
      ${sIOS() && !sApp() ? `<p class="sync-tip" id="sTip"><b>Saved this site to your Home Screen?</b> On iPhone and iPad it keeps its own data, separate from Safari. Open it from your Home Screen, tap Sync your devices, and paste this code there too.</p>` : ""}`
    : `<div class="sync-row"><button class="ghost pri" type="button" id="sNew">Make a sync code</button></div>`;
  el.innerHTML = `${top}${err}
    <h3 class="sync-h">What syncs</h3>
    <ul class="sync-what">${SWHAT.map(([a, b]) => `<li><b>${a}:</b> ${b}</li>`).join("")}</ul>
    <p class="hint">Stays on each device: light or dark theme, and your Coach chat.</p>
    ${appFirst ? "" : join}
    ${S.code ? `<div class="sync-more"><button class="sync-link" type="button" id="sStop">Stop syncing on this device</button><button class="sync-link" type="button" id="sDel">Delete synced data</button></div>` : ""}`;
  if (S.code) sQr().then(() => { const q = qrcode(0, "M"); q.addData(sLink(S.code)); q.make(); const box = $("#sQR"); if (box) box.innerHTML = q.createSvgTag({cellSize:4, margin:2, scalable:true}); }).catch(() => {});
}
$("#syncOpen").addEventListener("click", sOpen);
$("#syX").addEventListener("click", () => $("#sy").close());
$("#syDone").addEventListener("click", () => $("#sy").close());
$("#sy").addEventListener("click", e => {
  if (e.target === $("#sy")) return $("#sy").close();   // backdrop
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "sNew") sOn();
  else if (b.id === "sStop" && confirm("Stop syncing on this device? Your data stays here, and other devices keep syncing.")) sOff("");
  else if (b.id === "sDel") sDelete();
  else if (b.id === "sCopy") navigator.clipboard.writeText(sFmt(S.code)).then(() => { b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy code", 1500); }, () => {});
});
$("#sy").addEventListener("submit", e => { if (e.target.id === "sJoinF") { e.preventDefault(); sJoin($("#sCode").value); } });
$("#sy").addEventListener("keydown", e => { if (e.key === "Escape") e.stopPropagation(); });

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
if (sHash) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
setTimeout(() => {
  sDraw();
  // After a reload caused by another device's changes, say so on the masthead button for a few seconds.
  try { if (sessionStorage.getItem("sync-note")) { sessionStorage.removeItem("sync-note"); $("#syncLbl").textContent = "Updated from your other device"; setTimeout(sBtn, 5000); } } catch (e) {}
  if (sHash && sHash !== S.code) {
    if (confirm(`Turn on sync with code ${sValid(sHash) ? sFmt(sHash) : sHash}?\n\nThis device's saved dynasties, rules and favorites are merged with the synced copy.`)) { $("#sy").showModal(); sJoin(sHash); }
  } else if (S.code) { sSeen = Date.now(); sSync(); }
}, 0);
