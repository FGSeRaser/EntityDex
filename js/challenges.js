// EntityDex – Challenges planen (z. B. für den Stream) und mit dem DBD Companion am PC teilen.
// Konto über Supabase (js/sync.js). Ohne Konto bleiben die Challenges nur auf diesem Gerät.
// von FGSeRaser – https://github.com/FGSeRaser
import * as D from "./daten.js";
import * as Sync from "./sync.js";
import { REALMS } from "./maps.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
function toast(t) { const e = $("#toast"); e.textContent = t; e.style.display = "block"; clearTimeout(e._t); e._t = setTimeout(() => (e.style.display = "none"), 2400); }
const istDe = () => $("#sprache").value === "de";
const nameVon = (x) => (istDe() && x?.de ? x.de : x?.name || "");
const normN = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const SPEICHER = "entitydex.challenges";
let liste = [];
try { liste = JSON.parse(localStorage.getItem(SPEICHER)) || []; } catch {}
let aktiv = null, filter = "", konto = null, letzterSync = null, syncLaeuft = false;
let PERKS = [], CHARS = [], BILDER = { charaktere: {}, perks: {} };
const MAPS = REALMS.flatMap((r) => r.maps);

function speichern(sync = true) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(liste)); } catch {}
  if (sync) syncBald();
}

const VORLAGEN = [
  { name: "Gegen jeden Killer entkommen", rolle: "survivor", art: "killer", regel: "Gegen jeden Killer einmal escapen.", ziel: "Escape" },
  { name: "Adept mit jedem Survivor", rolle: "survivor", art: "survivor", regel: "Nur die 3 eigenen Perks des Survivors.", ziel: "Escape" },
  { name: "No Perk Escape", rolle: "survivor", art: "keine", regel: "Keine Perks, keine Items, keine Opfergaben.", ziel: "Escape", anzahl: 1 },
  { name: "Adept mit jedem Killer", rolle: "killer", art: "killer", regel: "Nur die 3 eigenen Perks, Merciless Killer.", ziel: "Merciless" },
  { name: "No Perk 4K mit jedem Killer", rolle: "killer", art: "killer", regel: "Keine Perks, keine Add-ons.", ziel: "4K" },
  { name: "4K auf jeder Map", rolle: "killer", art: "maps", regel: "Auf jeder Map einmal alle 4 opfern.", ziel: "4K" },
  { name: "Escape auf jeder Map", rolle: "survivor", art: "maps", regel: "Auf jeder Map einmal entkommen.", ziel: "Escape" },
  { name: "Fester Build: 10 Escapes", rolle: "survivor", art: "keine", regel: "Nur die gewählten 4 Perks.", ziel: "Escape", anzahl: 10 },
];

function zielListe(art) {
  if (art === "killer") return CHARS.filter((c) => c.rolle === "killer").map((c) => c.name);
  if (art === "survivor") return CHARS.filter((c) => c.rolle === "survivor").map((c) => c.name);
  if (art === "maps") return MAPS.slice();
  return [];
}
function werte(c) {
  const Z = c.ziele || [], log = c.log || [];
  const vers = log.length, erf = log.filter((l) => l.ok).length;
  const fertig = Z.length ? Z.filter((z) => z.ok).length : Math.min(erf, c.anzahl || 1);
  const ges = Z.length || c.anzahl || 1;
  return { vers, erf, fertig, ges, proz: Math.round((fertig / ges) * 100) };
}
const naechstes = (c) => (c.ziele || []).find((z) => !z.ok)?.name || null;
const charVon = (n) => CHARS.find((c) => c.name === n);
const perkVon = (n) => PERKS.find((p) => normN(p.name) === normN(n) || normN(p.de) === normN(n));
const zielName = (n) => { const c = charVon(n); return c ? nameVon(c) : n; };
const datumText = (d) => { try { return new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }); } catch { return d; } };

// ------------------------------------------------------------------ Konto
async function zeichneKonto() {
  const box = $("#ch-konto");
  if (!box) return;
  if (!(await Sync.verfuegbar())) {
    box.innerHTML = `<p class="klein">☁ Online-Sync ist noch nicht eingerichtet. Deine Challenges bleiben vorerst auf diesem Gerät.</p>`;
    return;
  }
  if (konto) {
    box.innerHTML = `<div class="reihe" style="margin:0"><span>☁ Angemeldet als <b>${esc(konto.email)}</b></span>
      <span class="klein" id="ch-syncstatus">${syncLaeuft ? "Synchronisiere …" : letzterSync ? "✔ Synchron mit dem DBD Companion · " + letzterSync.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
      <button id="ch-sync">⟳ Jetzt</button><button id="ch-abmelden">Abmelden</button></div>`;
    $("#ch-sync").onclick = () => syncJetzt(true);
    $("#ch-abmelden").onclick = async () => { await Sync.abmelden(); konto = null; zeichneKonto(); };
  } else {
    box.innerHTML = `<p class="klein" style="margin-top:0">☁ Melde dich an, dann tauchen deine Challenges automatisch im <b>DBD Companion</b> am PC auf (und umgekehrt).</p>
      <div class="reihe"><input id="k-mail" type="email" placeholder="E-Mail" autocomplete="email"><input id="k-pw" type="password" placeholder="Passwort (mind. 6 Zeichen)" autocomplete="current-password"></div>
      <div class="reihe"><button class="haupt" id="k-login">Anmelden</button><button id="k-neu">Konto erstellen</button><button id="k-vergessen">Passwort vergessen</button></div>`;
    const mail = () => $("#k-mail").value.trim(), pw = () => $("#k-pw").value;
    $("#k-login").onclick = async () => { try { konto = await Sync.anmelden(mail(), pw()); toast("Angemeldet"); zeichneKonto(); syncJetzt(true); } catch (e) { toast(e.message); } };
    $("#k-neu").onclick = async () => { try { const r = await Sync.registrieren(mail(), pw()); if (r.bestaetigen) toast("📧 Fast fertig: Bitte den Link in der E-Mail anklicken, dann anmelden."); else { konto = r.user; zeichneKonto(); syncJetzt(true); } } catch (e) { toast(e.message); } };
    $("#k-vergessen").onclick = async () => { try { await Sync.passwortVergessen(mail()); toast("📧 E-Mail zum Zurücksetzen ist unterwegs"); } catch (e) { toast(e.message); } };
  }
}

let syncTimer = null;
function syncBald() { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncJetzt(false), 1500); }
async function syncJetzt(laut) {
  if (!konto || syncLaeuft) return;
  syncLaeuft = true; zeichneKonto();
  try {
    const r = await Sync.synchronisieren(liste);
    liste = r.liste; speichern(false); letzterSync = new Date();
    if (laut || r.runter) toast(r.runter ? `☁ ${r.runter} Challenge(s) vom PC übernommen` : "☁ Alles synchron");
    zeichne();
  } catch (e) { if (laut) toast("Sync fehlgeschlagen: " + e.message); }
  syncLaeuft = false; zeichneKonto();
}

// ------------------------------------------------------------------ Liste & Detail
function zeichne() {
  const el = $("#ch-inhalt");
  if (!el) return;
  const heute = new Date().toISOString().slice(0, 10);
  let l = liste;
  if (filter === "geplant") l = l.filter((c) => c.geplant).sort((a, b) => a.geplant.localeCompare(b.geplant));
  else if (filter === "offen") l = l.filter((c) => !c.ok);
  else if (filter === "fertig") l = l.filter((c) => c.ok);
  else if (filter === "pin") l = l.filter((c) => c.pin);
  el.innerHTML = `
    <div class="chips">${[["", "Alle"], ["geplant", "📅 Stream-Plan"], ["offen", "Offen"], ["pin", "📌 Overlay"], ["fertig", "🏆 Geschafft"]].map(([k, n]) => `<button class="chip ${filter === k ? "an" : ""}" data-f="${k}">${n}</button>`).join("")}</div>
    <div class="ch-liste">${l.map((c) => { const w = werte(c); return `<div class="ch-karte ${c.id === aktiv ? "an" : ""}" data-c="${c.id}">
      <div class="reihe" style="margin:0;justify-content:space-between"><b>${c.pin ? "📌 " : ""}${esc(c.name)}${c.ok ? " 🏆" : ""}</b>
      ${c.geplant ? `<span class="ch-datum ${c.geplant < heute && !c.ok ? "alt" : ""}">📅 ${esc(datumText(c.geplant))}</span>` : ""}</div>
      <div class="klein">${w.fertig}/${w.ges} · ${w.vers} Versuche · ${c.rolle === "killer" ? "Killer" : "Survivor"}${c.jetzt ? " · jetzt: " + esc(zielName(c.jetzt)) : ""}</div>
      <div class="ch-balken"><i style="width:${w.proz}%"></i></div></div>`; }).join("") || `<p class="klein">Noch keine Challenges${filter ? " in dieser Ansicht" : ""}. Leg mit „+ Neue Challenge“ los!</p>`}</div>`;
  $$("[data-f]", el).forEach((b) => (b.onclick = () => { filter = b.dataset.f; zeichne(); }));
  $$("[data-c]", el).forEach((d) => (d.onclick = () => { aktiv = aktiv === d.dataset.c ? null : d.dataset.c; zeichne(); if (aktiv) $("#ch-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  zeichneDetail();
}

function aktion(c, a) {
  const z = (c.ziele || []).find((x) => x.name === c.jetzt);
  if (a === "erfolg" || a === "versuch") {
    const ok = a === "erfolg";
    (c.log = c.log || []).push({ zeit: Date.now(), ok, ziel: c.jetzt || null });
    if (z) { z.versuche = (z.versuche || 0) + 1; if (ok) { z.ok = true; c.jetzt = naechstes(c); } }
    const w = werte(c);
    if (w.fertig >= w.ges && !c.ok) { c.ok = true; toast("🏆 Challenge geschafft!"); }
  } else if (a === "zurueck") {
    const l = (c.log || []).pop();
    if (l?.ziel) { const zz = c.ziele.find((x) => x.name === l.ziel); if (zz) { if (l.ok) { zz.ok = false; c.jetzt = l.ziel; } zz.versuche = Math.max(0, (zz.versuche || 1) - 1); } }
    c.ok = false;
  } else if (a === "pin") c.pin = !c.pin;
  speichern(); zeichne();
}

function zeichneDetail() {
  const h = $("#ch-detail");
  const c = liste.find((x) => x.id === aktiv);
  if (!h) return;
  if (!c) { h.innerHTML = ""; return; }
  const w = werte(c);
  const perks = (c.perks || []).map((n) => perkVon(n) || { name: n });
  const bildListe = c.art === "killer" || c.art === "survivor";
  h.innerHTML = `<article class="karte">
    <div class="reihe" style="margin:0;justify-content:space-between"><h2 style="margin:0">${c.ok ? "🏆 " : ""}${esc(c.name)}</h2>
      <div class="reihe" style="margin:0"><button id="cd-pin" class="${c.pin ? "haupt" : ""}">📌 ${c.pin ? "Im Overlay" : "Ans Overlay"}</button><button id="cd-edit">✏</button><button id="cd-del">🗑</button></div></div>
    ${c.geplant ? `<p>📅 Geplant für <b>${esc(datumText(c.geplant))}</b>${c.planNotiz ? " – " + esc(c.planNotiz) : ""}</p>` : ""}
    ${c.regel ? `<p style="white-space:pre-line">${esc(c.regel)}</p>` : ""}${c.ziel ? `<p class="klein">Ziel: <b>${esc(c.ziel)}</b></p>` : ""}
    ${perks.length ? `<div class="ch-perks">${perks.map((p) => `<div>${p.bild || BILDER.perks[p.name] ? `<img src="${esc(p.bild || BILDER.perks[p.name])}" alt="">` : ""}<span>${esc(nameVon(p))}</span></div>`).join("")}</div>` : ""}
    <div class="ch-balken gross"><i style="width:${w.proz}%"></i></div>
    <p class="klein">${w.fertig} von ${w.ges} geschafft · ${w.vers} Versuche${c.jetzt ? ` · aktuelles Ziel: <b>${esc(zielName(c.jetzt))}</b>` : ""}</p>
    <div class="reihe"><button class="haupt" data-a="erfolg">✔ Geschafft</button><button data-a="versuch">✘ Versuch</button><button data-a="zurueck">↶</button></div>
    ${c.ziele?.length ? `<h3>Ziele <span class="klein">(tippen = aktuelles Ziel, lange drücken = abhaken)</span></h3>
      <div class="${bildListe ? "ch-portraits" : "chips"}">${c.ziele.map((z) => { const ch = charVon(z.name); const bild = ch && BILDER.charaktere[ch.name];
        return bildListe ? `<div class="ch-portrait ${z.ok ? "ok" : ""} ${z.name === c.jetzt ? "jetzt" : ""}" data-z="${esc(z.name)}">${bild ? `<img src="${esc(bild)}" alt="" loading="lazy">` : ""}<span>${esc(zielName(z.name))}</span></div>`
          : `<button class="chip ${z.ok ? "an" : ""}" data-z="${esc(z.name)}" style="${z.name === c.jetzt ? "outline:2px solid var(--gold)" : ""}">${esc(zielName(z.name))}</button>`; }).join("")}</div>` : ""}
  </article>`;
  $$("[data-a]", h).forEach((b) => (b.onclick = () => aktion(c, b.dataset.a)));
  $("#cd-pin").onclick = () => aktion(c, "pin");
  $("#cd-edit").onclick = () => bearbeiten(c);
  $("#cd-del").onclick = () => { if (confirm(`„${c.name}“ löschen?`)) { liste = liste.filter((x) => x.id !== c.id); aktiv = null; speichern(); zeichne(); } };
  $$("[data-z]", h).forEach((d) => {
    let t = null;
    const abhaken = () => { const z = c.ziele.find((x) => x.name === d.dataset.z); z.ok = !z.ok; if (z.ok && c.jetzt === z.name) c.jetzt = naechstes(c); c.ok = werte(c).fertig >= werte(c).ges; speichern(); zeichne(); };
    d.addEventListener("pointerdown", () => { t = setTimeout(() => { t = "lang"; abhaken(); }, 550); });
    d.addEventListener("pointerup", () => { if (t === "lang") { t = null; return; } clearTimeout(t); t = null; c.jetzt = d.dataset.z; speichern(); zeichne(); });
    d.addEventListener("pointerleave", () => { if (t && t !== "lang") clearTimeout(t); t = null; });
    d.addEventListener("dblclick", abhaken);
    d.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}

// ------------------------------------------------------------------ Bearbeiten
function bearbeiten(alt, vorlage = null) {
  const neu = !alt;
  const v = alt ? JSON.parse(JSON.stringify(alt)) : { id: uid(), name: vorlage?.name || "", regel: vorlage?.regel || "", ziel: vorlage?.ziel || "", art: vorlage?.art || "keine",
    rolle: vorlage?.rolle || "survivor", perks: [], anzahl: vorlage?.anzahl || 1, ziele: [], log: [], pin: false, erstellt: Date.now(), geplant: "", planNotiz: "" };
  let auswahl = (v.perks || []).slice();
  const h = $("#ch-detail");
  aktiv = null;
  h.innerHTML = `<article class="karte">
    <h2>${neu ? "Neue Challenge" : "Challenge bearbeiten"}</h2>
    ${neu ? `<div class="chips">${VORLAGEN.map((x, i) => `<button class="chip" data-v="${i}">${esc(x.name)}</button>`).join("")}</div>` : ""}
    <label class="feld">Name<input id="e-name" value="${esc(v.name)}" placeholder="z. B. Gegen jeden Killer entkommen"></label>
    <label class="feld">Regeln<textarea id="e-regel" rows="3">${esc(v.regel)}</textarea></label>
    <div class="reihe">
      <label class="feld">Ziel<input id="e-ziel" value="${esc(v.ziel)}" placeholder="Escape, 4K …"></label>
      <label class="feld">Rolle<select id="e-rolle"><option value="survivor">Survivor</option><option value="killer" ${v.rolle === "killer" ? "selected" : ""}>Killer</option></select></label>
    </div>
    <label class="feld">Liste<select id="e-art">
      <option value="keine">Keine – einfach zählen</option>
      <option value="killer" ${v.art === "killer" ? "selected" : ""}>Jeder Killer (${zielListe("killer").length})</option>
      <option value="survivor" ${v.art === "survivor" ? "selected" : ""}>Jeder Survivor (${zielListe("survivor").length})</option>
      <option value="maps" ${v.art === "maps" ? "selected" : ""}>Jede Map (${MAPS.length})</option>
      <option value="eigen" ${v.art === "eigen" ? "selected" : ""}>Eigene Liste</option></select></label>
    <label class="feld" id="e-anz-box">Wie oft schaffen?<input id="e-anzahl" type="number" min="1" value="${v.anzahl || 1}"></label>
    <label class="feld" id="e-eigen-box">Eigene Liste (eine Zeile pro Ziel)<textarea id="e-eigen" rows="4">${esc(v.art === "eigen" ? (v.ziele || []).map((z) => z.name).join("\n") : "")}</textarea></label>
    <div class="reihe">
      <label class="feld">📅 Für den Stream geplant am<input id="e-datum" type="date" value="${esc(v.geplant || "")}"></label>
      <label class="feld" style="flex:1">Notiz zum Stream<input id="e-notiz" value="${esc(v.planNotiz || "")}" placeholder="z. B. Zuschauer wählen den Killer"></label>
    </div>
    <label class="klein"><input type="checkbox" id="e-pin" ${v.pin ? "checked" : ""}> 📌 Im Companion-Overlay anzeigen</label>
    <h3>Perks (bis 4, optional)</h3>
    <div class="ch-perks" id="e-slots"></div>
    <div class="reihe"><input id="e-suche" type="search" placeholder="Perk suchen …"><button id="e-zufall">🎲</button></div>
    <div class="ch-perkwahl" id="e-perks"></div>
    <div class="reihe"><button class="haupt" id="e-ok">${neu ? "Erstellen" : "Speichern"}</button><button id="e-ab">Abbrechen</button></div>
  </article>`;
  h.scrollIntoView({ behavior: "smooth" });
  const artUm = () => { const a = $("#e-art").value; $("#e-anz-box").style.display = a === "keine" ? "" : "none"; $("#e-eigen-box").style.display = a === "eigen" ? "" : "none"; };
  $("#e-art").onchange = artUm; artUm();
  const slots = () => {
    $("#e-slots").innerHTML = auswahl.map((n, i) => { const p = perkVon(n) || { name: n }; return `<div data-s="${i}">${BILDER.perks[p.name] ? `<img src="${esc(BILDER.perks[p.name])}" alt="">` : ""}<span>${esc(nameVon(p))} ✕</span></div>`; }).join("") || `<span class="klein">Keine Perks gewählt</span>`;
    $$("[data-s]", h).forEach((d) => (d.onclick = () => { auswahl.splice(+d.dataset.s, 1); slots(); perkListe(); }));
  };
  const perkListe = () => {
    const q = normN($("#e-suche").value), r = $("#e-rolle").value;
    $("#e-perks").innerHTML = q.length < 2 ? `<span class="klein">Mindestens 2 Buchstaben eintippen …</span>` : PERKS.filter((p) => p.rolle === r && normN(p.name + p.de + p.charakter).includes(q)).slice(0, 40)
      .map((p) => `<button class="chip ${auswahl.includes(p.name) ? "an" : ""}" data-p="${esc(p.name)}">${esc(nameVon(p))}</button>`).join("");
    $$("[data-p]", h).forEach((b) => (b.onclick = () => { const n = b.dataset.p; if (auswahl.includes(n)) auswahl = auswahl.filter((x) => x !== n); else if (auswahl.length < 4) auswahl.push(n); else toast("Höchstens 4 Perks"); slots(); perkListe(); }));
  };
  $("#e-suche").oninput = perkListe; $("#e-rolle").onchange = () => { auswahl = []; slots(); perkListe(); };
  $("#e-zufall").onclick = () => { const pool = PERKS.filter((p) => p.rolle === $("#e-rolle").value).map((p) => p.name); auswahl = []; while (auswahl.length < 4 && pool.length) auswahl.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); slots(); perkListe(); };
  slots(); perkListe();
  $$("[data-v]", h).forEach((b) => (b.onclick = () => { const x = VORLAGEN[+b.dataset.v]; $("#e-name").value = x.name; $("#e-regel").value = x.regel; $("#e-ziel").value = x.ziel; $("#e-art").value = x.art; $("#e-rolle").value = x.rolle; $("#e-anzahl").value = x.anzahl || 1; artUm(); }));
  $("#e-ab").onclick = () => { aktiv = alt?.id || null; zeichne(); };
  $("#e-ok").onclick = () => {
    const name = $("#e-name").value.trim();
    if (!name) return toast("Bitte einen Namen eingeben");
    const art = $("#e-art").value;
    const namen = art === "eigen" ? [...new Set($("#e-eigen").value.split("\n").map((x) => x.trim()).filter(Boolean))] : zielListe(art);
    const altZiele = new Map((v.ziele || []).map((z) => [z.name, z]));
    Object.assign(v, { name, regel: $("#e-regel").value.trim(), ziel: $("#e-ziel").value.trim(), art, rolle: $("#e-rolle").value, perks: auswahl.slice(),
      anzahl: Math.max(1, +$("#e-anzahl").value || 1), pin: $("#e-pin").checked, geplant: $("#e-datum").value || "", planNotiz: $("#e-notiz").value.trim() });
    v.ziele = namen.map((n) => altZiele.get(n) || { name: n, versuche: 0, ok: false });
    if (!v.ziele.find((z) => z.name === v.jetzt)) v.jetzt = naechstes(v);
    if (neu) liste.unshift(v); else liste[liste.findIndex((x) => x.id === v.id)] = v;
    aktiv = v.id; speichern(); zeichne(); toast(konto ? "Gespeichert – kommt gleich im Companion an" : "Gespeichert");
  };
}

// ------------------------------------------------------------------ Start
export async function challengesStart() {
  const sec = $("#tab-challenges");
  if (!sec) return;
  sec.innerHTML = `<article class="karte"><div class="reihe" style="margin:0;justify-content:space-between"><h2 style="margin:0">🎯 Challenges & Stream-Plan</h2><button class="haupt" id="ch-neu">+ Neue Challenge</button></div>
    <div id="ch-konto" style="margin-top:10px"></div></article>
    <div id="ch-detail"></div><div id="ch-inhalt"></div>`;
  $("#ch-neu").onclick = () => bearbeiten(null);
  try {
    [PERKS, CHARS] = await Promise.all([D.perks(), D.charaktere()]);
    const b = await D.lade("bilder");
    const nn = (n) => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9]/g, "");
    const mitNorm = (roh, norm) => new Proxy(roh, { get: (o, k) => o[k] || norm?.[nn(k)] });
    BILDER = { charaktere: mitNorm(b?.daten?.charaktere || {}, b?.daten?.charNorm), perks: mitNorm(b?.daten?.perks || {}, b?.daten?.perksNorm) };
  } catch {}
  zeichne();
  $("#sprache").addEventListener("change", zeichne);
  try { konto = await Sync.nutzer(); } catch {}
  await zeichneKonto();
  Sync.beiAenderungKonto((u) => { const war = konto; konto = u; if (!!war !== !!u) { zeichneKonto(); if (u) syncJetzt(false); } });
  if (konto) {
    syncJetzt(false);
    Sync.live(() => syncBald());
    setInterval(() => syncJetzt(false), 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncJetzt(false); });
  }
}
