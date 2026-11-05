// EntityDex – Daten laden & vereinheitlichen. von FGSeRaser – https://github.com/FGSeRaser
// Die Rohdaten kommen vom Sammler (data/*.json). Weil sich Formate ändern können,
// wird hier alles tolerant in eine feste Form gebracht.
import { PERKNAMEN } from "./perknamen.js";

const cache = {};
export async function lade(name) {
  if (name in cache) return cache[name];
  try {
    const r = await fetch(`data/${name}.json?t=${Math.floor(Date.now() / 600000)}`);
    cache[name] = r.ok ? await r.json() : null;
  } catch { cache[name] = null; }
  return cache[name];
}

export const ohneHtml = (s) => String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

export function alsListe(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.entries(x).map(([id, v]) => (v && typeof v === "object" ? { id, ...v } : { id, wert: v }));
  return [];
}

// Zeit: Unix-Sekunden, Millisekunden oder ISO-Text
export function zeit(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  if (/^\d+$/.test(String(v))) return zeit(Number(v));
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export function hübsch(id) {
  return String(id ?? "").replace(/^(Perk_|T_UI_iconPerks_|iconPerks_)/i, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

let perkIndex = null;
export async function perks() {
  if (perkIndex) return perkIndex;
  const roh = await lade("perks");
  const chars = await charaktere();
  const nachId = new Map(chars.map((c) => [String(c.id), c]));
  const liste = [];
  for (const rolle of ["survivor", "killer"]) {
    const quelle = roh?.daten?.[rolle];
    let eintraege = alsListe(quelle?.perks ?? quelle);
    eintraege = eintraege.filter((p) => p && (p.name || p.perk_name || p.id));
    for (const p of eintraege) {
      const name = ohneHtml(p.name || p.perk_name || hübsch(p.id));
      const r = String(p.role || rolle).toLowerCase().includes("killer") ? "killer" : "survivor";
      const ch = p.character != null ? nachId.get(String(p.character)) : null;
      liste.push({
        id: String(p.id ?? name), name, rolle: r,
        text: ohneHtml(p.description || p.desc || p.perk_description || ""),
        tunables: p.tunables || null,
        charakter: ch ? ch.name : ohneHtml(p.characterName || p.owner || ""),
        bild: p.image || p.icon || null,
      });
    }
  }
  // Offline-Liste ergänzen: so fehlen nie Perks, auch wenn die Live-Daten unvollständig sind
  const vorhanden = new Set(liste.map((p) => p.rolle + "|" + p.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
  for (const rolle of ["survivor", "killer"]) for (const name of PERKNAMEN[rolle]) {
    if (!vorhanden.has(rolle + "|" + name.toLowerCase().replace(/[^a-z0-9]/g, ""))) liste.push({ id: name, name, rolle, text: "", charakter: "" });
  }
  // Doppelte Namen raus
  const gesehen = new Set();
  perkIndex = liste.filter((p) => !gesehen.has(p.rolle + p.name) && gesehen.add(p.rolle + p.name)).sort((a, b) => a.name.localeCompare(b.name));
  perkIndex.ausLive = !!roh?.daten;
  perkIndex.offline = liste.filter((p) => !p.text).length;
  return perkIndex;
}

// Tunables wie {0},{1} in der Beschreibung ersetzen (Werte Stufe 1/2/3)
export function perkText(p) {
  let t = p.text || "";
  if (p.tunables && Array.isArray(p.tunables)) {
    t = t.replace(/\{(\d+)\}/g, (m, i) => {
      const w = p.tunables[+i];
      return Array.isArray(w) ? w.join("/") : w ?? m;
    });
  }
  return t;
}

let charIndex = null;
export async function charaktere() {
  if (charIndex) return charIndex;
  const roh = await lade("charaktere");
  charIndex = alsListe(roh?.daten).map((c) => ({
    id: String(c.id), name: ohneHtml(c.name || hübsch(c.id)),
    rolle: String(c.role || "").toLowerCase().includes("killer") ? "killer" : "survivor",
    info: c,
  })).filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name));
  return charIndex;
}

export async function schrein() {
  const roh = await lade("schrein");
  const d = roh?.daten;
  if (!d) return null;
  const alle = await perks();
  const nachId = new Map(alle.map((p) => [p.id.toLowerCase(), p]));
  const nachName = new Map(alle.map((p) => [p.name.toLowerCase(), p]));
  const einträge = alsListe(d.perks ?? d.shrine ?? d).filter((x) => x && typeof x === "object");
  return {
    aktualisiert: roh.aktualisiert,
    start: zeit(d.start ?? d.startDate), ende: zeit(d.end ?? d.endDate),
    perks: einträge.map((x) => {
      const id = String(x.id ?? x.perk ?? x.name ?? "");
      const p = nachId.get(id.toLowerCase()) || nachName.get(String(x.name ?? "").toLowerCase());
      return { name: p?.name || ohneHtml(x.name) || hübsch(id), rolle: p?.rolle, preis: x.shards ?? x.cost ?? x.iridescent_shards, bp: x.bloodpoints, perk: p };
    }),
  };
}

export async function events() {
  const roh = await lade("events");
  const liste = alsListe(roh?.daten?.events ?? roh?.daten).map((e) => ({
    name: ohneHtml(e.name || e.title || e.type || hübsch(e.id)),
    typ: e.type || "", start: zeit(e.start ?? e.startDate ?? e.begin), ende: zeit(e.end ?? e.endDate),
    multi: e.multiplier ?? e.bloodpoints_multiplier ?? null,
  }));
  return { aktualisiert: roh?.aktualisiert, liste: liste.sort((a, b) => (a.start || 0) - (b.start || 0)) };
}

export async function rangreset() {
  const roh = await lade("rangreset");
  const d = roh?.daten;
  if (d == null) return null;
  const kandidat = typeof d === "object" ? (d.rankreset ?? d.next ?? d.reset ?? Object.values(d).find((v) => zeit(v))) : d;
  return zeit(kandidat);
}

export function countdown(ziel) {
  if (!ziel) return "";
  let s = Math.round((ziel - Date.now()) / 1000);
  const vorbei = s < 0; s = Math.abs(s);
  const t = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const txt = t ? `${t} T ${h} Std` : h ? `${h} Std ${m} Min` : `${m} Min`;
  return vorbei ? `seit ${txt}` : `noch ${txt}`;
}

export const datum = (d) => (d ? d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
