// EntityDex – Datensammler. Läuft alle 3 Stunden als GitHub Action und schreibt data/*.json.
// Jede Quelle ist für sich abgesichert: fällt eine aus, bleiben die alten Daten stehen.
// von FGSeRaser – https://github.com/FGSeRaser
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HIER, "..", "data");
const UA = "EntityDex/1.0 (+https://github.com/FGSeRaser/EntityDex)";
const TRICKY = "https://dbd.tricky.lol/api";
const WIKI = "https://deadbydaylight.wiki.gg";
const STEAM_APP = 381210;

const status = {};

async function holen(url, { json = true, timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: json ? "application/json" : "text/html,*/*" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return json ? await r.json() : await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function schreibe(name, daten) {
  await writeFile(path.join(DATA, name), JSON.stringify(daten, null, 1), "utf8");
}

async function lese(name) {
  try { return JSON.parse(await readFile(path.join(DATA, name), "utf8")); } catch { return null; }
}

// Führt eine Quelle aus; bei Fehler bleibt die alte Datei, und der Fehler landet in meta.json.
async function quelle(name, datei, fn) {
  const start = Date.now();
  try {
    const daten = await fn();
    if (daten == null || (Array.isArray(daten) && daten.length === 0)) throw new Error("leer");
    await schreibe(datei, { aktualisiert: new Date().toISOString(), daten });
    status[name] = { ok: true, zeit: new Date().toISOString(), ms: Date.now() - start };
    console.log(`✔ ${name}`);
  } catch (e) {
    const alt = await lese(datei);
    status[name] = { ok: false, fehler: String(e.message || e), letzteDaten: alt?.aktualisiert || null };
    console.log(`✘ ${name}: ${e.message || e}`);
  }
}

// ------------------------------------------------------------ Hilfen
function htmlZuText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

// Codes aus einem Text ziehen: GROSSBUCHSTABEN/Ziffern, 5–24 Zeichen, mit mind. 2 Buchstaben.
export function codesAusText(text) {
  const stop = new Set(["DBD", "PTB", "BHVR", "PC", "PS4", "PS5", "XBOX", "NOTE", "UPDATE", "CODES", "CODE", "FREE", "NEW", "EXPIRED", "ACTIVE", "BLOODPOINTS", "REWARD", "REWARDS", "CHARM", "HTTPS", "HTTP", "WWW", "FAQ", "EU", "US", "UK", "DLC", "NOVEMBER", "OCTOBER", "DECEMBER"]);
  const funde = new Map();
  const zeilen = String(text).split(/\n/);
  let abgelaufen = false;
  for (const z of zeilen) {
    if (/expired|abgelaufen|no longer|nicht mehr/i.test(z) && z.length < 80) abgelaufen = true;
    if (/active|aktiv|working|gültig|funktionier/i.test(z) && z.length < 80) abgelaufen = false;
    for (const m of z.matchAll(/\b([A-Z0-9][A-Z0-9_-]{4,23})\b/g)) {
      const c = m[1];
      if (stop.has(c) || /^\d+$/.test(c) || (c.match(/[A-Z]/g) || []).length < 2) continue;
      if (!funde.has(c)) {
        let belohnung = ((z.replace(c, "").match(/[-–:]\s*(.{3,80})$/) || [])[1] || "").trim();
        if (!/[a-zäöü]{3}/i.test(belohnung) || /^\d+\.\s|\)$/.test(belohnung) && !/\(/.test(belohnung)) belohnung = "";
        funde.set(c, { code: c, belohnung, abgelaufen });
      }
    }
  }
  return [...funde.values()];
}

// Englische Wiki-Titel -> deutsche Titel (prop=langlinks), in 50er-Paketen
async function deutscheTitel(namen) {
  const map = {};
  for (let i = 0; i < namen.length; i += 50) {
    const paket = namen.slice(i, i + 50);
    const q = new URLSearchParams({ action: "query", titles: paket.join("|"), prop: "langlinks", lllang: "de", lllimit: "max", redirects: "1", format: "json", formatversion: "2" });
    const d = await holen(`${WIKI}/api.php?${q}`);
    // Weiterleitungen/Normalisierung zurückverfolgen: Originalname -> endgültiger Titel
    const ziel = new Map(paket.map((n) => [n, n]));
    for (const n of d?.query?.normalized || []) for (const [k, v] of ziel) if (v === n.from) ziel.set(k, n.to);
    for (const r of d?.query?.redirects || []) for (const [k, v] of ziel) if (v === r.from) ziel.set(k, r.to);
    const de = new Map((d?.query?.pages || []).map((p) => [p.title, p.langlinks?.[0]?.title]));
    for (const [orig, titel] of ziel) { const t = de.get(titel); if (t && t !== orig) map[orig] = t; }
    await new Promise((r) => setTimeout(r, 300));
  }
  return map;
}

// ------------------------------------------------------------ Quellen
// Hauptbild vieler Wiki-Seiten (Perk-Icons, Porträts, Map-Bilder), in 50er-Paketen
async function seitenBilder(namen, breite = 256) {
  const map = {};
  for (let i = 0; i < namen.length; i += 50) {
    const paket = namen.slice(i, i + 50);
    const q = new URLSearchParams({ action: "query", titles: paket.join("|"), prop: "pageimages", piprop: "thumbnail|original", pithumbsize: String(breite), redirects: "1", format: "json", formatversion: "2" });
    const d = await holen(`${WIKI}/api.php?${q}`);
    const ziel = new Map(paket.map((n) => [n, n]));
    for (const n of d?.query?.normalized || []) for (const [k, v] of ziel) if (v === n.from) ziel.set(k, n.to);
    for (const r of d?.query?.redirects || []) for (const [k, v] of ziel) if (v === r.from) ziel.set(k, r.to);
    const bild = new Map((d?.query?.pages || []).map((p) => [p.title, p.thumbnail?.source || p.original?.source]));
    for (const [orig, titel] of ziel) { const b = bild.get(titel); if (b) map[orig] = b; }
    await new Promise((r) => setTimeout(r, 300));
  }
  return map;
}

const normName = (n) => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9]/g, "");

// Alle Perk-Icons des Wikis (IconPerks_xyz.png) – Zuordnung über den Namen, klappt auch bei Sonderzeichen
async function allePerkIcons() {
  const icons = {};
  let weiter = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ action: "query", generator: "allimages", gaiprefix: "IconPerks_", gailimit: "500", prop: "imageinfo", iiprop: "url", format: "json", formatversion: "2" });
    if (weiter) q.set("gaicontinue", weiter);
    const d = await holen(`${WIKI}/api.php?${q}`);
    for (const p of d?.query?.pages || []) {
      const datei = p.title.replace(/^(File|Datei):IconPerks[ _]/i, "").replace(/\.png$/i, "");
      const url = p.imageinfo?.[0]?.url;
      if (url) icons[normName(datei)] = url;
    }
    weiter = d?.continue?.gaicontinue;
    if (!weiter) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return icons;
}

// Echtes Porträt einer Charakter-Seite (Datei mit „_Portrait“ im Namen), statt des allgemeinen Killer-Symbols
async function portraitVonSeite(titel) {
  // Alle Bilder der Seite (mit Fortsetzung), dann das Porträt nehmen, dessen Dateiname zum Charakter passt
  const alle = [];
  let weiter = null;
  for (let i = 0; i < 4; i++) {
    const q = new URLSearchParams({ action: "query", titles: titel, generator: "images", gimlimit: "500", prop: "imageinfo", iiprop: "url", redirects: "1", format: "json", formatversion: "2" });
    if (weiter) q.set("gimcontinue", weiter);
    const d = await holen(`${WIKI}/api.php?${q}`);
    alle.push(...(d?.query?.pages || []));
    weiter = d?.continue?.gimcontinue;
    if (!weiter) break;
  }
  const portraits = alle.filter((p) => /[ _]Portrait\.png$/i.test(p.title) && !/Icon|Render/i.test(p.title));
  const ganz = normName(titel);
  const woerter = titel.split(/[\s"]+/).map(normName).filter((w) => w.length > 3 && w !== "the");
  const passt = portraits.find((p) => normName(p.title).includes(ganz))
    || portraits.find((p) => woerter.some((w) => normName(p.title).includes(w)));
  return passt ? passt.imageinfo?.[0]?.url || null : null;
}

// Einleitungstext einer Wiki-Seite
async function seitenText(titel) {
  try {
    const q = new URLSearchParams({ action: "parse", page: titel, prop: "text", section: "0", redirects: "1", format: "json", formatversion: "2" });
    const d = await holen(`${WIKI}/api.php?${q}`);
    let t = htmlZuText(d?.parse?.text || "");
    t = t.split("\n").map((z) => z.trim()).filter((z) => z.length > 60 && !/^(Map|Realm|Location|Size|Tiles|Released)/i.test(z)).slice(0, 3).join("\n\n");
    return t.replace(/\[\d+\]/g, "").slice(0, 1500);
  } catch { return ""; }
}

// Schrein: tricky.lol meldet direkt nach dem Wechsel (Dienstag 15:00 UTC) oft "shrine is currently unavailable".
// Dann bleibt die alte Datei stehen; die App zeigt einen Hinweis und der nächste Lauf holt den neuen Schrein.
async function schreinHolen() {
  const r = await fetch(`${TRICKY}/shrine`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 120)}`);
  return JSON.parse(text);
}

async function main() {
  await mkdir(DATA, { recursive: true });

  // tricky.lol – Schrein, Events, Rang-Reset, Perks, Charaktere
  await quelle("schrein", "schrein.json", schreinHolen);
  await quelle("events", "events.json", () => holen(`${TRICKY}/events`));
  await quelle("rangreset", "rangreset.json", () => holen(`${TRICKY}/rankreset`));
  await quelle("perks", "perks.json", async () => {
    const [k, s] = await Promise.all([holen(`${TRICKY}/perks?role=killer`), holen(`${TRICKY}/perks?role=survivor`)]);
    return { killer: k, survivor: s };
  });
  await quelle("charaktere", "charaktere.json", () => holen(`${TRICKY}/characters`));

  // Steam – News & Patch-Notes
  await quelle("news", "news.json", async () => {
    const d = await holen(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP}&count=40&maxlength=1200&format=json`);
    const items = (d?.appnews?.newsitems || []).filter((n) => !/[\u0400-\u04FF]/.test(n.title + " " + (n.contents || "").slice(0, 200)));
    return items.map((n) => ({
      titel: n.title, url: n.url, datum: new Date(n.date * 1000).toISOString(),
      quelle: n.feedlabel || n.feedname || "", text: htmlZuText(n.contents).replace(/\[\/?[a-z0-9*=]+[^\]]*\]/gi, "").slice(0, 1200),
      tags: n.tags || [],
    }));
  });

  // Kill Switch – offizielle Liste im BHVR-Forum (Knowledge-Base-Artikel 299)
  await quelle("killswitch", "killswitch.json", async () => {
    const url = "https://forums.bhvr.com/dead-by-daylight/kb/articles/299-kill-switch-master-list";
    let text = "";
    try {
      const api = await holen("https://forums.bhvr.com/api/v2/articles/299");
      text = htmlZuText(api.body || api.bodyRendered || "");
    } catch { /* Fallback: HTML-Seite */ }
    if (!text) {
      const html = await holen(url, { json: false });
      const body = (html.match(/<div[^>]+class="[^"]*userContent[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) || [])[1]
        || (html.match(/<article[\s\S]*?<\/article>/i) || [])[0] || html;
      text = htmlZuText(body);
    }
    if (text.length < 40) throw new Error("Kill-Switch-Text nicht gefunden");
    return { url, text: text.slice(0, 8000) };
  });

  // Codes – mehrere Quellen probieren, Codes herausfiltern; dazu manuelle Liste (data/codes_manuell.json)
  await quelle("codes", "codes.json", async () => {
    const quellen = [
      { name: "space4games", url: "https://space4games.com/en/wp-json/wp/v2/posts/65840", wp: true },
    ];
    const alle = new Map();
    const genutzt = [];
    for (const q of quellen) {
      try {
        const d = await holen(q.url, { json: q.wp });
        const text = q.wp ? htmlZuText(d?.content?.rendered || "") : htmlZuText(d);
        const funde = codesAusText(text);
        if (funde.length) genutzt.push(q.name);
        for (const f of funde) if (!alle.has(f.code)) alle.set(f.code, { ...f, quelle: q.name });
      } catch (e) {
        console.log(`  Codes-Quelle ${q.name}: ${e.message}`);
      }
    }
    const manuell = (await lese("codes_manuell.json"))?.codes || [];
    for (const m of manuell) alle.set(m.code, { ...m, quelle: "manuell" });
    const liste = [...alle.values()];
    if (!liste.length) throw new Error("keine Codes gefunden");
    return { quellen: genutzt, codes: liste };
  });

  // Wiki – letzte Patch-Seiten (für „Was kommt demnächst“)
  await quelle("patches", "patches.json", async () => {
    const d = await holen(`${WIKI}/api.php?action=query&list=categorymembers&cmtitle=Category:Patches&cmsort=timestamp&cmdir=desc&cmlimit=15&format=json`);
    const liste = d?.query?.categorymembers || [];
    return liste.map((p) => ({ titel: p.title, url: `${WIKI}/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}` }));
  });

  // Deutsche Namen (Perks & Charaktere) über die Sprach-Verknüpfungen des englischen Wikis
  await quelle("deutsch", "deutsch.json", async () => {
    const perksRoh = (await lese("perks.json"))?.daten || {};
    const charsRoh = (await lese("charaktere.json"))?.daten || {};
    const { PERKNAMEN } = await import("../js/perknamen.js");
    const perkNamen = new Set([...PERKNAMEN.survivor, ...PERKNAMEN.killer]);
    for (const r of ["survivor", "killer"]) for (const p of Object.values(perksRoh[r] || {})) if (p?.name) perkNamen.add(htmlZuText(p.name).replace(/\u00a0/g, " ").trim());
    const charNamen = new Set(Object.values(charsRoh).map((c) => htmlZuText(c?.name || "")).filter(Boolean));
    const ergebnis = { perks: await deutscheTitel([...perkNamen]), charaktere: await deutscheTitel([...charNamen]) };
    if (Object.keys(ergebnis.perks).length < 20) throw new Error("zu wenige deutsche Namen gefunden");
    return ergebnis;
  });

  // Bilder & Map-Texte (für EntityDex und DBD Companion)
  await quelle("bilder", "bilder.json", async () => {
    const perksRoh = (await lese("perks.json"))?.daten || {};
    const charsRoh = (await lese("charaktere.json"))?.daten || {};
    const perkNamen = new Set();
    for (const r of ["survivor", "killer"]) for (const p of Object.values(perksRoh[r] || {})) if (p?.name) perkNamen.add(htmlZuText(p.name).replace(/\u00a0/g, " ").trim());
    const charNamen = [...new Set(Object.values(charsRoh).map((c) => htmlZuText(c?.name || "")).filter(Boolean))];
    const { REALMS } = await import("../js/maps.js");
    const mapNamen = REALMS.flatMap((r) => r.maps);
    const maps = {};
    const mapBilder = await seitenBilder(mapNamen, 640);
    for (const r of REALMS) for (const m of r.maps) {
      maps[m] = { realm: r.realm, bild: mapBilder[m] || null, text: await seitenText(m) };
      await new Promise((res) => setTimeout(res, 250));
    }
    const perks = await seitenBilder([...perkNamen], 128);
    // fehlende Perk-Icons über die Dateiliste des Wikis ergänzen (Sonderzeichen, andere Schreibweise)
    const icons = await allePerkIcons();
    console.log(`  Perk-Icons aus Dateiliste: ${Object.keys(icons).length}`);
    console.log("  Ohne Icon: " + [...perkNamen].filter((n) => !perks[n]).map((n) => `${n} → ${normName(n)}`).join(" | "));
    for (const n of perkNamen) if (!perks[n] && icons[normName(n)]) perks[n] = icons[normName(n)];
    const charaktere = await seitenBilder(charNamen, 256);
    for (const n of charNamen) {
      if (charaktere[n] && /[_ ]Portrait/i.test(charaktere[n]) && !/IconHelp/i.test(charaktere[n])) continue;
      const p = await portraitVonSeite(n);
      if (p) charaktere[n] = p;
      await new Promise((r) => setTimeout(r, 250));
    }
    // Schlüssel ohne Sonderzeichen für tolerante Suche
    const perksNorm = {}; for (const [k, v] of Object.entries(perks)) perksNorm[normName(k)] = v;
    const charNorm = {}; for (const [k, v] of Object.entries(charaktere)) charNorm[normName(k)] = v;
    const ergebnis = { perks, charaktere, maps, perksNorm, charNorm };
    if (Object.keys(ergebnis.perks).length < 50) throw new Error("zu wenige Perk-Bilder gefunden");
    return ergebnis;
  });

  await schreibe("meta.json", { aktualisiert: new Date().toISOString(), quellen: status });
  const fehler = Object.entries(status).filter(([, s]) => !s.ok).map(([n]) => n);
  console.log(fehler.length ? `Fertig – Quellen mit Problemen: ${fehler.join(", ")}` : "Fertig – alle Quellen ok");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
