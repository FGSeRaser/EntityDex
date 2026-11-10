// EntityDex – Hauptlogik. von FGSeRaser – https://github.com/FGSeRaser
import * as D from "./daten.js";
import * as W from "./wiki.js";
import { SPIELSTILE, KATEGORIEN, KOMBOS, zufall, vorschlaege, kategorienVon, enthaelt, norm } from "./builds.js";
import { KAPITEL, MONATE } from "./kapitel.js";
import { GESCHICHTE } from "./geschichte.js";
import { REALMS } from "./maps.js";
import { challengesStart } from "./challenges.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const speicher = {
  get(k, std) { try { const v = localStorage.getItem("entitydex." + k); return v == null ? std : JSON.parse(v); } catch { return std; } },
  set(k, v) { try { localStorage.setItem("entitydex." + k, JSON.stringify(v)); } catch {} },
};
function toast(t) { const e = $("#toast"); e.textContent = t; e.style.display = "block"; clearTimeout(e._t); e._t = setTimeout(() => (e.style.display = "none"), 2200); }
const lang = () => $("#sprache").value;
const istDe = () => lang() === "de";
// Anzeige-Name je nach Sprache (deutsch, falls vorhanden) + der jeweils andere Name klein darunter
const nameVon = (x) => (istDe() && x?.de ? x.de : x?.name || "");
const andererName = (x) => (x?.de && x.de !== x.name ? (istDe() ? x.name : x.de) : "");
let deMap = new Map();   // englischer Perkname -> Perk
async function perkNachName(n) { if (!deMap.size) (await D.perks()).forEach((p) => deMap.set(norm(p.name), p)); return deMap.get(norm(n)) || { name: n }; }
const perkAnzeige = (n) => nameVon(deMap.get(norm(n)) || { name: n });
const STIL_NAME = Object.fromEntries([...SPIELSTILE.survivor, ...SPIELSTILE.killer].map((s) => [s.id, s.name]));

// ================================================================ Tabs
function zeigeTab(t, push = true) {
  $$("#tabs button").forEach((b) => b.classList.toggle("an", b.dataset.tab === t));
  $$(".tab").forEach((s) => s.classList.toggle("an", s.id === "tab-" + t));
  speicher.set("tab", t);
  if (push && location.hash !== "#" + t) history.replaceState(null, "", "#" + t);
  if (t === "archiv") archivStart();
  window.scrollTo({ top: 0 });
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) zeigeTab(b.dataset.tab); });

// ================================================================ Detail-Panel (Wiki-Seite)
let panelOffen = false;
function panelZu() { $("#panel").hidden = true; panelOffen = false; document.body.style.overflow = ""; }
$("#panel-zu").addEventListener("click", () => history.back());
window.addEventListener("popstate", () => { if (panelOffen) panelZu(); });

async function oeffneWiki(titel, { vorspann = "", fokus = null, schnell = true } = {}) {
  if (!panelOffen) { history.pushState({ panel: 1 }, ""); panelOffen = true; }
  $("#panel").hidden = false; document.body.style.overflow = "hidden";
  $("#panel-titel").textContent = titel;
  $("#panel-wiki").href = W.wikiLink(titel, lang());
  $("#panel-schnell").innerHTML = "";
  const inhalt = $("#panel-inhalt");
  inhalt.innerHTML = vorspann + `<div class="lade">Lade aus dem DBD-Wiki …</div>`;
  inhalt.scrollTop = 0;
  try {
    let s;
    try { s = await W.seite(titel, lang()); }
    catch (e) { if (lang() !== "en") s = await W.seite(titel, "en"); else throw e; }
    $("#panel-titel").textContent = s.anzeige;
    $("#panel-wiki").href = s.url;
    inhalt.innerHTML = vorspann + `<div class="wiki">${s.html}</div>`;
    // Schnellsprung zu wichtigen Abschnitten
    if (schnell) {
      const knoepfe = [];
      for (const [art, muster] of Object.entries(W.ABSCHNITT_MUSTER)) {
        const a = s.abschnitte.find((x) => muster.test(x.name));
        if (a) knoepfe.push({ art, a });
      }
      const label = { verlauf: "🕓 Änderungen", lore: "📖 Geschichte", skins: "👕 Skins", perks: "🩸 Perks", preis: "💰 Preis/DLC", addons: "🧩 Add-ons" };
      const rest = s.abschnitte.filter((x) => x.ebene === 1 && !knoepfe.some((k) => k.a === x)).slice(0, 10);
      $("#panel-schnell").innerHTML =
        knoepfe.map((k) => `<button class="wichtig" data-anker="${esc(k.a.anker)}">${label[k.art]}</button>`).join("") +
        rest.map((a) => `<button data-anker="${esc(a.anker)}">${esc(a.name)}</button>`).join("");
      if (fokus) { const k = knoepfe.find((x) => x.art === fokus); if (k) setTimeout(() => springe(k.a.anker), 60); }
    }
  } catch (e) {
    inhalt.innerHTML = vorspann + `<div class="box">Das Wiki konnte gerade nicht geladen werden (${esc(e.message)}).<br>
      <a href="${W.wikiLink(titel, lang())}" target="_blank" rel="noopener">„${esc(titel)}“ direkt im Wiki öffnen ↗</a></div>`;
  }
}
function springe(anker) {
  const el = document.getElementById(anker) || $(`#panel-inhalt [id="${CSS.escape(anker)}"]`);
  if (!el) return;
  const ziel = el.closest("h2,h3,h4") || el;
  ziel.scrollIntoView({ behavior: "smooth", block: "start" });
  ziel.classList.add("markiert"); setTimeout(() => ziel.classList.remove("markiert"), 1800);
}
$("#panel-schnell").addEventListener("click", (e) => { const b = e.target.closest("button[data-anker]"); if (b) springe(b.dataset.anker); });
$("#panel-inhalt").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-wiki]");
  if (a) { e.preventDefault(); oeffneWiki(a.dataset.wiki); }
});
$("#sprache").value = speicher.get("sprache", "de");
$("#sprache").addEventListener("change", async () => {
  speicher.set("sprache", lang());
  deMap.clear();
  await perkListe(); await charListe(); buildsNeu(); startSeite();
  toast(istDe() ? "Deutsche Namen & deutsches Wiki" : "English names & English wiki");
});

// ================================================================ START
function leer(text) { return `<p class="fehlt">${esc(text)}</p>`; }

async function startSeite() {
  // Schrein
  const s = await D.schrein();
  const kS = $("#k-schrein .inhalt");
  const abgelaufen = s?.ende && s.ende.getTime() < Date.now();
  if (s && s.perks.length) {
    kS.innerHTML = (abgelaufen ? `<p class="fehlt">Der Schrein hat gerade gewechselt (jeden Dienstag 16 Uhr, im Sommer 17 Uhr). Die neuen Perks kommen mit dem nächsten Update, spätestens nach ein paar Stunden. Unten stehen noch die Perks der letzten Woche.</p>` : "") + `<p class="klein">Wechselt wöchentlich · ${s.ende && !abgelaufen ? `neu in <span class="countdown" data-cd="${s.ende.getTime()}">${D.countdown(s.ende)}</span> (${D.datum(s.ende)})` : ""}</p>
      <div class="schrein">${s.perks.map((p, i) => `<div class="sperk" data-i="${i}">
        <div class="rolle ${p.rolle || ""}">${p.rolle === "killer" ? "Killer" : p.rolle === "survivor" ? "Survivor" : "Perk"}</div>
        <b>${esc(p.perk ? nameVon(p.perk) : p.name)}</b>${p.perk && andererName(p.perk) ? `<div class="klein">${esc(andererName(p.perk))}</div>` : ""}
        ${p.perk?.charakter ? `<div class="klein">${esc(p.perk.charakter)}</div>` : ""}
        ${p.preis ? `<div class="preis">💎 ${Number(p.preis).toLocaleString("de-DE")} Shards</div>` : ""}</div>`).join("")}</div>`;
    $$(".sperk", kS).forEach((el) => el.addEventListener("click", () => perkDetail(s.perks[el.dataset.i].perk || { name: s.perks[el.dataset.i].name })));
  } else kS.innerHTML = leer("Noch keine Schrein-Daten – sie kommen mit dem nächsten automatischen Update.");

  // Events
  const ev = await D.events();
  const jetzt = Date.now();
  const aktuell = ev.liste.filter((e) => !e.ende || e.ende.getTime() > jetzt);
  $("#k-events .inhalt").innerHTML = aktuell.length ? `<div class="liste">${aktuell.slice(0, 8).map((e) => {
    const läuft = e.start && e.start.getTime() <= jetzt;
    return `<div class="zeile"><div class="oben"><b>${esc(e.name)}</b>${läuft ? `<span class="tag gruen">läuft</span>` : `<span class="tag gold">kommt</span>`}</div>
      <div class="unter">${läuft ? `endet <span data-cd="${e.ende?.getTime() || ""}">${D.countdown(e.ende)}</span>` : `startet <span data-cd="${e.start?.getTime() || ""}">${D.countdown(e.start)}</span>`}
      ${e.multi ? ` · ${esc(e.multi)}× BP` : ""}</div></div>`;
  }).join("")}</div>` : leer("Gerade keine Events bekannt.");

  // Codes
  const c = await D.lade("codes");
  const codes = c?.daten?.codes || [];
  $("#k-codes .inhalt").innerHTML = codes.length ? `<div class="liste">${codes.sort((a, b) => a.abgelaufen - b.abgelaufen).slice(0, 14).map((x) => `
    <div class="zeile klickbar" data-code="${esc(x.code)}"><div class="oben"><span class="code ${x.abgelaufen ? "alt" : ""}">${esc(x.code)}</span>
      <span class="klein">${x.abgelaufen ? "abgelaufen?" : "📋 kopieren"}</span></div>
      ${x.belohnung ? `<div class="unter">${esc(x.belohnung)}</div>` : ""}</div>`).join("")}</div>
    <p class="klein">Einlösen: Im Spiel unten rechts im Shop → „Code einlösen“. Codes sind automatisch gesammelt – nicht alle sind garantiert noch gültig.</p>`
    : leer("Gerade keine Codes gefunden.");
  $$("#k-codes [data-code]").forEach((el) => el.addEventListener("click", () => { navigator.clipboard?.writeText(el.dataset.code); toast(`„${el.dataset.code}“ kopiert`); }));

  // Kill Switch
  const k = await D.lade("killswitch");
  $("#k-kill .inhalt").innerHTML = k?.daten?.text
    ? `<div class="mehr" id="kill-text">${esc(k.daten.text)}</div><div class="reihe"><button id="kill-mehr">Alles anzeigen</button><a href="${esc(k.daten.url)}" target="_blank" rel="noopener">Offizielle Liste ↗</a></div>`
    : leer("Kill-Switch-Liste konnte noch nicht geladen werden.") + `<a href="https://forums.bhvr.com/dead-by-daylight/kb/articles/299-kill-switch-master-list" target="_blank" rel="noopener">Offizielle Liste ↗</a>`;
  $("#kill-mehr")?.addEventListener("click", (e) => { $("#kill-text").classList.toggle("offen"); e.target.textContent = $("#kill-text").classList.contains("offen") ? "Weniger" : "Alles anzeigen"; });

  // Rang-Reset
  const rr = await D.rangreset();
  $("#k-reset .inhalt").innerHTML = rr ? `<div class="countdown" data-cd="${rr.getTime()}" style="font-size:22px">${D.countdown(rr)}</div><p class="klein">${D.datum(rr)} – danach Belohnungen für deinen Grade abholen.</p>` : leer("Noch kein Termin bekannt.");

  // News
  newsZeigen("");
  $("#news-filter").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$("#news-filter button").forEach((x) => x.classList.toggle("an", x === b)); newsZeigen(b.dataset.f);
  });

  // Patch-Seiten im Wiki
  const pa = await D.lade("patches");
  const liste = pa?.daten || [];
  $("#k-patches .inhalt").innerHTML = liste.length ? `<div class="chips">${liste.map((p) => `<button data-wiki="${esc(p.titel)}">${esc(p.titel)}</button>`).join("")}</div>` :
    `<div class="chips"><button data-wiki="Patches">Alle Patches im Wiki</button></div>`;
  $$("#k-patches [data-wiki]").forEach((b) => b.addEventListener("click", () => oeffneWiki(b.dataset.wiki)));

  // Datenstand
  const meta = await D.lade("meta");
  if (meta) {
    const q = Object.entries(meta.quellen || {});
    const ok = q.filter(([, v]) => v.ok).length;
    $("#stand").innerHTML = `Daten zuletzt aktualisiert: ${D.datum(D.zeit(meta.aktualisiert))} · ${ok}/${q.length} Quellen ok` +
      (ok < q.length ? ` · Probleme: ${q.filter(([, v]) => !v.ok).map(([n]) => esc(n)).join(", ")}` : "");
  } else $("#stand").textContent = "Noch keine automatischen Daten – der erste Lauf der GitHub-Automatik steht noch aus.";
}

async function newsZeigen(filter) {
  const n = await D.lade("news");
  let liste = (n?.daten || []).filter((x) => !/[\u0400-\u04FF]/.test(x.titel));
  const muster = { patch: /patch|hotfix|bug ?fix|update/i, ptb: /ptb|public test|coming|upcoming|roadmap|preview|next/i, event: /event|anniversary|halloween|bone chill|lunar|blood hunt|haunted/i, kill: /kill ?switch|disabled|deaktiv/i, chapter: /chapter|kapitel|collection|release/i };
  if (filter) liste = liste.filter((x) => muster[filter].test(x.titel + " " + x.text.slice(0, 300)));
  $("#k-news .inhalt").innerHTML = liste.length ? `<div class="liste">${liste.slice(0, 15).map((x, i) => `
    <div class="zeile klickbar" data-i="${i}"><div class="oben"><b>${esc(x.titel)}</b><span class="klein">${D.datum(D.zeit(x.datum)).slice(0, 10)}</span></div>
      <div class="unter vorschau">${esc(x.text.slice(0, 400))}</div></div>`).join("")}</div>` : leer("Keine passenden News.");
  $$("#k-news [data-i]").forEach((el) => el.addEventListener("click", () => {
    const x = liste[el.dataset.i];
    newsDetail(x);
  }));
}
function newsDetail(x) {
  if (!panelOffen) { history.pushState({ panel: 1 }, ""); panelOffen = true; }
  $("#panel").hidden = false; document.body.style.overflow = "hidden";
  $("#panel-titel").textContent = x.titel; $("#panel-wiki").href = x.url; $("#panel-wiki").textContent = "Auf Steam lesen ↗";
  $("#panel-schnell").innerHTML = "";
  $("#panel-inhalt").innerHTML = `<p class="klein">${D.datum(D.zeit(x.datum))} · ${esc(x.quelle)}</p><div class="box" style="white-space:pre-wrap">${esc(x.text)}…</div>
    <a href="${esc(x.url)}" target="_blank" rel="noopener">Ganzen Beitrag auf Steam lesen ↗</a>`;
}
$("#panel-zu").addEventListener("click", () => setTimeout(() => ($("#panel-wiki").textContent = "Im Wiki öffnen ↗"), 300));

// Countdowns live halten
setInterval(() => $$("[data-cd]").forEach((el) => { const t = +el.dataset.cd; if (t) el.textContent = D.countdown(new Date(t)); }), 30000);

// ================================================================ PERKS
let perkRolle = "alle", perkKat = "";
async function perkListe() {
  const alle = await D.perks();
  const q = $("#perk-suche").value.trim().toLowerCase();
  // Kategorie-Chips passend zur Rolle
  const rollen = perkRolle === "alle" ? ["survivor", "killer"] : [perkRolle];
  const kats = [...new Set(rollen.flatMap((r) => Object.keys(KATEGORIEN[r])))];
  $("#perk-kat").innerHTML = `<button data-k="" class="${perkKat ? "" : "an"}">Alle</button>` + kats.map((k) => `<button data-k="${k}" class="${perkKat === k ? "an" : ""}">${esc(STIL_NAME[k] || k)}</button>`).join("");
  const treffer = alle.filter((p) => (perkRolle === "alle" || p.rolle === perkRolle)
    && (!perkKat || enthaelt(KATEGORIEN[p.rolle]?.[perkKat], p.name))
    && (!q || (p.name + " " + (p.de || "") + " " + p.charakter + " " + (p.charakterDe || "") + " " + p.text).toLowerCase().includes(q)));
  $("#perk-anzahl").textContent = `${treffer.length} Perks${alle.ausLive ? "" : " (Offline-Liste – Beschreibungen kommen mit den Live-Daten)"}`;
  $("#perk-liste").innerHTML = treffer.map((p, i) => `<div class="perk" data-i="${i}">
    <div class="kopfz"><b>${esc(nameVon(p))}</b><span class="rolle ${p.rolle}">${p.rolle === "killer" ? "Killer" : "Survivor"}</span></div>
    ${andererName(p) ? `<div class="klein">${esc(andererName(p))}</div>` : ""}
    ${p.charakter ? `<div class="klein">${esc(p.charakter)}</div>` : ""}
    ${p.text ? `<div class="txt">${esc(D.perkText(p))}</div>` : ""}
    <div>${kategorienVon(p.rolle, p.name).map((k) => `<span class="tag">${esc(STIL_NAME[k] || k)}</span>`).join("")}</div></div>`).join("");
  $$("#perk-liste .perk").forEach((el) => el.addEventListener("click", () => perkDetail(treffer[el.dataset.i])));
}
function perkDetail(p) {
  const kats = p.rolle ? kategorienVon(p.rolle, p.name) : [];
  const vorspann = `<div class="box"><div class="kopfz" style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:18px">${esc(nameVon(p))}${andererName(p) ? ` <span class="klein">(${esc(andererName(p))})</span>` : ""}</b>
    ${p.rolle ? `<span class="rolle ${p.rolle}">${p.rolle === "killer" ? "Killer" : "Survivor"}</span>` : ""}</div>
    ${p.charakter ? `<div class="klein">Gehört zu: ${esc(p.charakter)}</div>` : ""}
    ${p.text ? `<p style="white-space:pre-wrap">${esc(D.perkText(p))}</p>${istDe() ? `<p class="klein">Beschreibung aus den Spieldaten (Englisch). Die deutsche Beschreibung steht unten im Wiki.</p>` : ""}` : ""}
    ${kats.length ? `<div>Passt zu: ${kats.map((k) => `<span class="tag rot">${esc(STIL_NAME[k] || k)}</span>`).join("")}</div>` : ""}
    <p class="klein">Unten: Wiki-Seite mit genauen Werten, und über „🕓 Änderungen“ siehst du, wann und wie der Perk geändert wurde und wie er vorher war.</p></div>`;
  oeffneWiki(istDe() && p.de ? p.de : p.name, { vorspann, fokus: null });
}
$("#perk-rolle").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; perkRolle = b.dataset.r; perkKat = ""; $$("#perk-rolle button").forEach((x) => x.classList.toggle("an", x === b)); perkListe(); });
$("#perk-kat").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; perkKat = b.dataset.k; perkListe(); });
$("#perk-suche").addEventListener("input", () => perkListe());

// ================================================================ CHARAKTERE
let charRolle = "alle";
async function charListe() {
  let alle = await D.charaktere();
  if (!alle.length) {
    // Offline: Namen aus der Kapitel-Zeitleiste
    const m = new Map();
    for (const k of KAPITEL) { k.killer.forEach((n) => m.set(n, "killer")); k.survivor.forEach((n) => m.set(n, "survivor")); }
    alle = [...m].map(([name, rolle]) => ({ name, rolle })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const q = $("#char-suche").value.trim().toLowerCase();
  const treffer = alle.filter((c) => (charRolle === "alle" || c.rolle === charRolle) && (!q || (c.name + " " + (c.de || "")).toLowerCase().includes(q)));
  $("#char-liste").innerHTML = treffer.map((c, i) => {
    const kap = KAPITEL.find((k) => k.killer.includes(c.name) || k.survivor.includes(c.name));
    return `<div class="char" data-i="${i}"><b>${esc(nameVon(c))}</b>${andererName(c) ? `<div class="klein">${esc(andererName(c))}</div>` : ""}<div class="rolle ${c.rolle}">${c.rolle === "killer" ? "Killer" : "Survivor"}</div>
      ${kap ? `<div class="klein">${esc(kap.name)} · ${kap.monat ? MONATE[kap.monat] + " " : ""}${kap.jahr}</div>` : ""}</div>`;
  }).join("") || leer("Nichts gefunden.");
  $$("#char-liste .char").forEach((el) => el.addEventListener("click", () => charDetail(treffer[el.dataset.i])));
}
function charDetail(c) {
  const kap = KAPITEL.find((k) => k.killer.includes(c.name) || k.survivor.includes(c.name));
  const vorspann = `<div class="box"><b style="font-size:18px">${esc(nameVon(c))}</b>${andererName(c) ? ` <span class="klein">(${esc(andererName(c))})</span>` : ""} <span class="rolle ${c.rolle}">${c.rolle === "killer" ? "Killer" : "Survivor"}</span>
    ${kap ? `<div class="klein">Kam mit: <b>${esc(kap.name)}</b> (${kap.monat ? MONATE[kap.monat] + " " : ""}${kap.jahr})${kap.status === "entfernt" ? " · nicht mehr erhältlich" : ""}</div>` : ""}
    <div class="reihe"><button data-such="${esc(c.name)} Cosmetics">👕 Alle Skins</button><button data-such="${esc(c.name)} DLC price">💰 Preis/DLC</button><button data-such="${esc(c.name)} Lore">📖 Geschichte</button></div>
    ${c.bio ? `<p style="white-space:pre-wrap"><b>Kurz:</b> ${esc(c.bio)}</p>` : ""}
    ${c.story ? `<details><summary><b>📖 Hintergrundgeschichte (aus dem Spiel, Englisch)</b></summary><p style="white-space:pre-wrap">${esc(c.story)}</p></details>` : ""}
    <p class="klein">Tippe oben auf „📖 Geschichte“, „👕 Skins“ oder „🩸 Perks“, um im Wiki direkt zum Abschnitt zu springen.</p></div>`;
  oeffneWiki(istDe() && c.de ? c.de : c.name, { vorspann, fokus: "lore" }).then(() => {
    $$("#panel-inhalt [data-such]").forEach((b) => b.addEventListener("click", () => { panelZu(); history.back(); zeigeTab("suche"); $("#wiki-suche").value = b.dataset.such; wikiSuche(); }));
  });
}
$("#char-rolle").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; charRolle = b.dataset.r; $$("#char-rolle button").forEach((x) => x.classList.toggle("an", x === b)); charListe(); });
$("#char-suche").addEventListener("input", () => charListe());

// ================================================================ BUILDS
let buildRolle = speicher.get("buildRolle", "survivor");
let slots = speicher.get("slots", { survivor: [null, null, null, null], killer: [null, null, null, null] });
let fest = speicher.get("fest", { survivor: [false, false, false, false], killer: [false, false, false, false] });
let stile = speicher.get("stile", { survivor: ["team"], killer: ["slowdown"] });

async function perkNamen(rolle) { await perkNachName(""); return (await D.perks()).filter((p) => p.rolle === rolle).map((p) => p.name); }

async function roulette(drehen = false) {
  const alle = await perkNamen(buildRolle);
  const kat = $("#roulette-kat").value;
  const pool = kat ? alle.filter((n) => enthaelt(KATEGORIEN[buildRolle][kat], n)) : alle;
  if (drehen) {
    const behalten = slots[buildRolle].filter((p, i) => fest[buildRolle][i] && p);
    const neu = zufall(pool.length >= 4 ? pool : alle, 4, behalten);
    // gesperrte Slots an ihrer Stelle lassen
    const rest = neu.filter((p) => !behalten.includes(p));
    slots[buildRolle] = slots[buildRolle].map((p, i) => (fest[buildRolle][i] && p ? p : rest.shift()));
    speicher.set("slots", slots);
  }
  $("#roulette").innerHTML = slots[buildRolle].map((p, i) => `<div class="slot ${fest[buildRolle][i] ? "fest" : ""} ${drehen && !fest[buildRolle][i] ? "dreht" : ""}" data-i="${i}">
    <b>${p ? esc(perkAnzeige(p)) : "?"}</b><div class="info">${p ? kategorienVon(buildRolle, p).map((k) => STIL_NAME[k]).join(", ") : "Drehen!"}</div></div>`).join("");
  $$("#roulette .slot").forEach((el) => {
    el.addEventListener("click", () => { const i = +el.dataset.i; if (!slots[buildRolle][i]) return; fest[buildRolle][i] = !fest[buildRolle][i]; speicher.set("fest", fest); roulette(); });
    el.addEventListener("dblclick", async () => { const n = slots[buildRolle][+el.dataset.i]; if (n) perkDetail(await perkNachName(n)); });
  });
}
function rouletteKats() {
  $("#roulette-kat").innerHTML = `<option value="">aus allen Perks</option>` + SPIELSTILE[buildRolle].map((s) => `<option value="${s.id}">nur ${esc(s.name)}</option>`).join("");
}
async function stilAnzeige() {
  $("#stile").innerHTML = SPIELSTILE[buildRolle].map((s) => `<div class="stil ${stile[buildRolle].includes(s.id) ? "an" : ""}" data-s="${s.id}"><b>${s.icon} ${esc(s.name)}</b><small>${esc(s.text)}</small></div>`).join("");
  $$("#stile .stil").forEach((el) => el.addEventListener("click", () => {
    const l = stile[buildRolle]; const i = l.indexOf(el.dataset.s);
    if (i >= 0) l.splice(i, 1); else l.push(el.dataset.s);
    speicher.set("stile", stile); stilAnzeige();
  }));
  const alle = await perkNamen(buildRolle);
  const v = stile[buildRolle].length ? vorschlaege(buildRolle, stile[buildRolle], alle, 2) : KOMBOS[buildRolle];
  $("#vorschlaege").innerHTML = (stile[buildRolle].length ? "" : `<p class="klein">Kein Stil gewählt – hier alle bewährten Kombos:</p>`) +
    v.map((b) => `<div class="vorschlag"><div class="oben" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(b.name)}</b>
      <span>${String(b.stil).split("+").map((s) => `<span class="tag rot">${esc(STIL_NAME[s] || s)}</span>`).join("")}</span></div>
      <div class="perks4">${b.perks.map((p) => `<div data-perk="${esc(p)}">${esc(perkAnzeige(p))}</div>`).join("")}</div>
      <div class="klein">${esc(b.warum)}</div>
      <div class="reihe"><button data-uebernehmen='${esc(JSON.stringify(b.perks))}'>🎰 Ins Roulette übernehmen</button><button data-kopie="${esc(b.perks.map(perkAnzeige).join(", "))}">📋 Kopieren</button></div></div>`).join("") +
    (stile[buildRolle].length ? `<div class="reihe"><button id="neu-mischen">🔀 Neue Mix-Vorschläge</button></div>` : "");
  $("#neu-mischen")?.addEventListener("click", stilAnzeige);
  $$("#vorschlaege [data-perk]").forEach((el) => el.addEventListener("click", async () => perkDetail(await perkNachName(el.dataset.perk))));
  $$("#vorschlaege [data-kopie]").forEach((el) => el.addEventListener("click", () => { navigator.clipboard?.writeText(el.dataset.kopie); toast("Build kopiert"); }));
  $$("#vorschlaege [data-uebernehmen]").forEach((el) => el.addEventListener("click", () => {
    const p = JSON.parse(el.dataset.uebernehmen); slots[buildRolle] = [0, 1, 2, 3].map((i) => p[i] || null); fest[buildRolle] = [true, true, true, true];
    speicher.set("slots", slots); speicher.set("fest", fest); roulette(); window.scrollTo({ top: 0, behavior: "smooth" }); toast("Ins Roulette übernommen (alle gesperrt)");
  }));
}
function buildsNeu() {
  $$("#build-rolle button").forEach((x) => x.classList.toggle("an", x.dataset.r === buildRolle));
  rouletteKats(); roulette(); stilAnzeige();
}
$("#build-rolle").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; buildRolle = b.dataset.r; speicher.set("buildRolle", buildRolle); buildsNeu(); });
$("#dreh").addEventListener("click", () => roulette(true));
$("#roulette-teilen").addEventListener("click", () => { const t = slots[buildRolle].filter(Boolean).map(perkAnzeige).join(", "); if (t) { navigator.clipboard?.writeText(t); toast("Build kopiert"); } });

// ================================================================ SUCHE
const SCHNELL = ["Realms", "Items", "Add-ons", "Offerings", "Chapters", "Cosmetics", "Auric Cells", "Iridescent Shards", "Status Effects", "Patches", "Bloodweb", "Archives", "Tome", "Game Modes", "Kill Switch"];
$("#schnell").innerHTML = SCHNELL.map((s) => `<button data-q="${esc(s)}">${esc(s)}</button>`).join("");
$("#schnell").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $("#wiki-suche").value = b.dataset.q; wikiSuche(); });
let suchTimer;
$("#wiki-suche").addEventListener("input", () => { clearTimeout(suchTimer); suchTimer = setTimeout(wikiSuche, 450); });
$("#wiki-suche").addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(suchTimer); wikiSuche(); } });
async function wikiSuche() {
  const q = $("#wiki-suche").value.trim();
  const ziel = $("#such-ergebnis");
  if (q.length < 2) return;
  ziel.innerHTML = `<div class="lade">Suche im DBD-Wiki …</div>`;
  try {
    const t = await W.suche(q, lang());
    // Zusätzlich lokale Treffer: Perks, Kapitel
    const perks = (await D.perks()).filter((p) => (p.name + " " + (p.de || "")).toLowerCase().includes(q.toLowerCase())).slice(0, 6);
    const kaps = KAPITEL.filter((k) => (k.name + k.killer.join() + k.survivor.join() + k.map.join()).toLowerCase().includes(q.toLowerCase())).slice(0, 4);
    ziel.innerHTML =
      (perks.length ? `<h3 class="klein">PERKS</h3>` + perks.map((p, i) => `<div class="treffer" data-perk="${i}"><b>${esc(nameVon(p))}</b>${andererName(p) ? ` <span class="klein">(${esc(andererName(p))})</span>` : ""} <span class="rolle ${p.rolle}">${p.rolle}</span><div class="auszug">${esc(D.perkText(p).slice(0, 140))}</div></div>`).join("") : "") +
      (kaps.length ? `<h3 class="klein">KAPITEL</h3>` + kaps.map((k) => `<div class="treffer" data-wiki="${esc(k.name)}"><b>${esc(k.name)}</b> <span class="klein">${k.monat ? MONATE[k.monat] + " " : ""}${k.jahr}</span><div class="auszug">${esc([...k.killer, ...k.survivor, ...k.map].join(" · "))}</div></div>`).join("") : "") +
      `<h3 class="klein">IM WIKI</h3>` + (t.length ? t.map((x) => `<div class="treffer" data-wiki="${esc(x.titel)}"><b>${esc(x.titel)}</b><div class="auszug">${x.auszug}</div></div>`).join("") : leer("Im Wiki nichts gefunden."));
    $$("#such-ergebnis [data-wiki]").forEach((el) => el.addEventListener("click", () => oeffneWiki(el.dataset.wiki)));
    $$("#such-ergebnis [data-perk]").forEach((el) => el.addEventListener("click", () => perkDetail(perks[el.dataset.perk])));
  } catch (e) {
    ziel.innerHTML = `<div class="box">Die Wiki-Suche ist gerade nicht erreichbar (${esc(e.message)}). <a href="https://deadbydaylight.wiki.gg/index.php?search=${encodeURIComponent(q)}" target="_blank" rel="noopener">Im Wiki suchen ↗</a></div>`;
  }
}

// ================================================================ ARCHIV
let archivGeladen = false;
function archivStart() {
  if (archivGeladen) return; archivGeladen = true;
  geschichteZeigen(); kapitelZeigen(); mapsZeigen();
}
$("#archiv-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $$("#archiv-seg button").forEach((x) => x.classList.toggle("an", x === b));
  for (const a of ["geschichte", "kapitel", "maps"]) $("#archiv-" + a).hidden = a !== b.dataset.a;
  if (b.dataset.a === "maps") mapBilderLaden();
});

function geschichteZeigen() {
  $("#archiv-geschichte").innerHTML = `<div class="kapitel-geschichte">
    <div class="gintro"><h2>Im Nebel: Die Geschichte von Dead by Daylight</h2>
      <p class="klein">Von der ersten Idee in Montreal bis zum zehnten Geburtstag – wie aus einem kleinen Horrorspiel das meistgespielte Horrorspiel der Welt wurde, und wie sich Perks, Regeln und Spielweise Schritt für Schritt verändert haben.</p></div>
    ${GESCHICHTE.map((g, i) => `<section class="gkap"><div class="zeit">${esc(g.zeit)}</div><h3>${esc(g.titel)}</h3>
      ${g.absaetze.slice(0, 1).map((p) => `<p>${esc(p)}</p>`).join("")}
      <div class="gbilder">${g.bilder.map((b, j) => `<figure class="gbild" data-g="${i}" data-b="${j}"><figcaption>${esc(b.text)} · Bild: DBD-Wiki</figcaption></figure>`).join("")}</div>
      ${g.absaetze.slice(1).map((p) => `<p>${esc(p)}</p>`).join("")}</section>`).join("")}
    <p class="klein">Text: EntityDex (FGSeRaser). Jahreszahlen nach Wikipedia und dem offiziellen DBD-Wiki. Bilder werden live aus dem DBD-Wiki geladen (© Behaviour Interactive).</p></div>`;
  // Bilder nachladen, wenn sie in Sicht kommen
  const io = new IntersectionObserver((einträge) => {
    for (const e of einträge) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const b = GESCHICHTE[e.target.dataset.g].bilder[e.target.dataset.b];
      const lade = b.seite ? W.bildVonSeite(b.seite) : W.bildSuche(b.suche);
      lade.then((url) => {
        if (!url) { e.target.classList.add("leer"); return; }
        const img = new Image(); img.src = url; img.alt = b.text; img.loading = "lazy";
        img.onerror = () => e.target.classList.add("leer");
        e.target.prepend(img);
      }).catch(() => e.target.classList.add("leer"));
    }
  }, { rootMargin: "300px" });
  $$("#archiv-geschichte .gbild").forEach((f) => io.observe(f));
}

function kapitelZeigen() {
  const q = ($("#kap-suche").value || "").toLowerCase();
  const liste = KAPITEL.filter((k) => !q || (k.name + k.killer.join() + k.survivor.join() + k.map.join() + k.jahr).toLowerCase().includes(q));
  let jahr = null, html = "";
  for (const k of liste) {
    if (k.jahr !== jahr) { jahr = k.jahr; html += `<div class="jahr">${jahr}</div>`; }
    const wer = [
      ...k.killer.map((n) => `<span class="tag rot" data-wiki="${esc(n)}">🔪 ${esc(n)}</span>`),
      ...k.survivor.map((n) => `<span class="tag" data-wiki="${esc(n)}">🏃 ${esc(n)}</span>`),
      ...k.map.map((n) => `<span class="tag gold" data-wiki="${esc(n)}">🗺️ ${esc(n)}</span>`),
    ].join("");
    html += `<div class="kap ${k.status || ""}"><div class="kk"><b data-wiki="${esc(k.name)}" style="cursor:pointer">${k.nr ? `Kapitel ${k.nr}: ` : ""}${esc(k.name)}</b>
      <span class="klein">${k.monat ? MONATE[k.monat] + " " : ""}${k.jahr}${k.status === "entfernt" ? " · entfernt" : k.status === "angekündigt" ? " · angekündigt" : ""}</span></div>
      <div class="wer">${wer}</div>${k.info ? `<div class="klein" style="margin-top:4px">${esc(k.info)}</div>` : ""}</div>`;
  }
  $("#kap-liste").innerHTML = html || leer("Nichts gefunden.");
  $$("#kap-liste [data-wiki]").forEach((el) => el.addEventListener("click", () => oeffneWiki(el.dataset.wiki)));
}
$("#kap-suche").addEventListener("input", kapitelZeigen);

function mapsZeigen() {
  $("#map-liste").innerHTML = REALMS.map((r) => `<div class="realm">${esc(r.realm)}</div>` + r.maps.map((m) => {
    const kap = KAPITEL.find((k) => k.map.includes(m) || k.map.includes(r.realm));
    return `<div class="mapkarte" data-wiki="${esc(m)}"><div class="mbild" data-bild="${esc(m)}"></div>
      <div class="mtext"><b>${esc(m)}</b>${kap ? `<div class="klein">${esc(kap.name)} · ${kap.jahr}</div>` : ""}</div></div>`;
  }).join("")).join("");
  $$("#map-liste .mapkarte").forEach((el) => el.addEventListener("click", () => oeffneWiki(el.dataset.wiki)));
}
let mapBilder = false;
function mapBilderLaden() {
  if (mapBilder) return; mapBilder = true;
  const io = new IntersectionObserver((einträge) => {
    for (const e of einträge) {
      if (!e.isIntersecting) continue; io.unobserve(e.target);
      W.bildVonSeite(e.target.dataset.bild, 500).then((u) => { if (u) e.target.style.backgroundImage = `url("${u}")`; }).catch(() => {});
    }
  }, { rootMargin: "200px" });
  $$("#map-liste .mbild").forEach((m) => io.observe(m));
}

// ================================================================ SPIELER
export function steamIdAus(text) {
  const t = String(text || "").trim();
  const id64 = t.match(/(7656119\d{10})/);
  if (id64) return { id: id64[1] };
  const vanity = t.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i) || (/^[A-Za-z0-9_-]{2,32}$/.test(t) ? [null, t] : null);
  if (vanity) return { vanity: vanity[1] };
  return null;
}
async function vanityAufloesen(name) {
  // Steam erlaubt das direkte Auslesen aus dem Browser meist nicht (CORS) – Versuch, sonst Hinweis.
  try {
    const r = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(name)}/?xml=1`);
    const t = await r.text();
    const m = t.match(/<steamID64>(\d{17})<\/steamID64>/);
    if (m) return m[1];
  } catch {}
  return null;
}
const STAT_NAMEN = {
  bloodpoints: "Bloodpoints gesamt", killer_rank: "Killer-Rang", survivor_rank: "Survivor-Rang", killer_grade: "Killer-Grade", survivor_grade: "Survivor-Grade",
  playtime: "Spielzeit", killed: "Getötet", sacrificed: "Geopfert", escaped: "Entkommen", gensrepaired: "Generatoren repariert", generators: "Generatoren",
  healed: "Geheilt", unhooked: "Vom Haken gerettet", skillchecks: "Great Skillchecks", hooked: "Gehakt", killedall: "4K-Runden",
};
async function spielerSuchen() {
  const roh = $("#steam-id").value;
  const ziel = $("#spieler-ergebnis");
  const x = steamIdAus(roh);
  if (!x) { ziel.innerHTML = `<div class="box">Das sieht nicht nach einem Steam-Profil aus. Kopiere den Link aus Steam: Profil → Rechtsklick → „Seiten-URL kopieren“.</div>`; return; }
  let id = x.id;
  if (!id) {
    ziel.innerHTML = `<div class="lade">Steam-Name „${esc(x.vanity)}“ wird aufgelöst …</div>`;
    id = await vanityAufloesen(x.vanity);
    if (!id) {
      ziel.innerHTML = `<div class="box">Dein Link enthält einen eigenen Profilnamen (<b>${esc(x.vanity)}</b>) statt der Nummer – den kann Steam im Browser leider nicht umrechnen.<br><br>
        So geht's trotzdem: Öffne <a href="https://steamid.io/lookup/${encodeURIComponent(x.vanity)}" target="_blank" rel="noopener">steamid.io/lookup/${esc(x.vanity)}</a>, kopiere die <b>steamID64</b> (17 Ziffern, beginnt mit 7656…) und füge sie hier ein.
        <br><br>Oder direkt bei tricky schauen: <a href="https://dbd.tricky.lol/playerstats/${encodeURIComponent(x.vanity)}" target="_blank" rel="noopener">dbd.tricky.lol ↗</a></div>`;
      return;
    }
  }
  const verlauf = [id, ...speicher.get("spieler", []).filter((s) => s !== id)].slice(0, 6);
  speicher.set("spieler", verlauf); spielerVerlauf();
  ziel.innerHTML = `<div class="lade">Lade Stats von tricky.lol …</div>`;
  const link = `https://dbd.tricky.lol/playerstats/${id}`;
  try {
    const r = await fetch(`https://dbd.tricky.lol/api/playerstats?steamid=${id}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (!d || d.error || typeof d !== "object") throw new Error(d?.error || "keine Daten");
    const werte = Object.entries(d).filter(([, v]) => v != null && typeof v !== "object");
    const wichtig = werte.filter(([k]) => STAT_NAMEN[k]);
    const rest = werte.filter(([k]) => !STAT_NAMEN[k]);
    const zeile = ([k, v]) => `<div class="stat"><div class="w">${typeof v === "number" ? v.toLocaleString("de-DE") : esc(v)}</div><div class="n">${esc(STAT_NAMEN[k] || k.replace(/_/g, " "))}</div></div>`;
    ziel.innerHTML = `<p>SteamID64: <b>${id}</b> · <a href="${link}" target="_blank" rel="noopener">Ausführlich auf tricky.lol ↗</a></p>
      <div class="stats">${wichtig.map(zeile).join("")}</div>
      ${rest.length ? `<details style="margin-top:12px"><summary>Alle ${rest.length} weiteren Werte</summary><div class="stats">${rest.map(zeile).join("")}</div></details>` : ""}`;
  } catch (e) {
    ziel.innerHTML = `<div class="box">SteamID64 gefunden: <b>${id}</b>.<br>Die Stats konnten hier nicht direkt geladen werden (${esc(e.message)}) –
      entweder ist das Profil privat, oder tricky.lol erlaubt den direkten Abruf aus der App nicht.<br><br>
      <a class="haupt" href="${link}" target="_blank" rel="noopener" style="display:inline-block;padding:8px 14px;background:var(--rot);color:#fff;border-radius:10px;text-decoration:none">Stats auf dbd.tricky.lol öffnen ↗</a>
      <p class="klein">Tipp: Steam → Profil bearbeiten → Privatsphäre → „Spieldetails“ auf <b>Öffentlich</b> stellen.</p></div>`;
  }
}
function spielerVerlauf() {
  const v = speicher.get("spieler", []);
  $("#spieler-liste").innerHTML = v.map((s) => `<button data-s="${s}">🕓 ${s}</button>`).join("");
  $$("#spieler-liste button").forEach((b) => b.addEventListener("click", () => { $("#steam-id").value = b.dataset.s; spielerSuchen(); }));
}
$("#steam-los").addEventListener("click", spielerSuchen);
$("#steam-id").addEventListener("keydown", (e) => { if (e.key === "Enter") spielerSuchen(); });
$("#steam-id").addEventListener("paste", () => setTimeout(spielerSuchen, 50));

// ================================================================ Start
// Notfall: alten Cache und Service Worker löschen und neu laden
async function reparieren() {
  try {
    if ("serviceWorker" in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
  location.reload();
}
function fehlerAnzeigen(was, e) {
  console.error(was, e);
  if ($("#fehler-box")) return;
  const d = document.createElement("div");
  d.id = "fehler-box";
  d.className = "box";
  d.style.cssText = "margin:12px;border:2px solid var(--rot)";
  d.innerHTML = `<b>Hier ist etwas schiefgelaufen</b> (${esc(was)}: ${esc(e && e.message || e)}).<br>
    Meist hilft es, die gespeicherte alte Version zu löschen.<br><br>
    <button class="haupt" id="fehler-reparieren" style="padding:8px 14px;background:var(--rot);color:#fff;border:0;border-radius:10px">Neu laden &amp; reparieren</button>`;
  document.querySelector("main")?.prepend(d);
  $("#fehler-reparieren").addEventListener("click", reparieren);
}
window.addEventListener("error", (e) => fehlerAnzeigen("Skriptfehler", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => fehlerAnzeigen("Ladefehler", e.reason));

(async function init() {
  // Service Worker zuerst, damit ein Update auch dann ankommt, wenn unten etwas schiefgeht
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").then((r) => r.update()).catch(() => {});
    // neue Version übernommen → einmal neu laden, damit keine alten Dateien mehr aktiv sind
    let neu = false;
    const hatteAlten = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hatteAlten && !neu) { neu = true; location.reload(); } });
  }
  const start = (location.hash || "").slice(1) || "start";
  zeigeTab($("#tab-" + start) ? start : "start", false);
  spielerVerlauf();
  for (const [name, fn] of [["Startseite", startSeite], ["Perks", perkListe], ["Charaktere", charListe], ["Builds", buildsNeu], ["Challenges", challengesStart]]) {
    try { await fn(); } catch (e) { fehlerAnzeigen(name, e); }
  }
})();
