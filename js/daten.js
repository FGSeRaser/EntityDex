// EntityDex – Daten laden & vereinheitlichen. von FGSeRaser – https://github.com/FGSeRaser
// Die Rohdaten kommen vom Sammler (data/*.json). Weil sich Formate ändern können,
// wird hier alles tolerant in eine feste Form gebracht.
import { PERKNAMEN } from "./perknamen.js";

const cache = {};
// In der Android-App (oder lokal) zuerst die frischen Daten von der Webseite holen, sonst die mitgelieferten
const LIVE = "https://fgseraser.github.io/EntityDex/";
const istWebseite = location.hostname === "fgseraser.github.io";
export async function lade(name) {
  if (name in cache) return cache[name];
  const t = Math.floor(Date.now() / 600000);
  const urls = istWebseite ? [`data/${name}.json?t=${t}`] : [`${LIVE}data/${name}.json?t=${t}`, `data/${name}.json`];
  cache[name] = null;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) { cache[name] = await r.json(); break; }
    } catch {}
  }
  return cache[name];
}

export const ohneHtml = (s) => String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

export function alsListe(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.entries(x).map(([id, v]) => (v && typeof v === "object" ? { id, ...v, schluessel: id } : { id, wert: v, schluessel: id }));
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
let deutsch = null;
export async function uebersetzungen() {
  if (deutsch) return deutsch;
  const roh = await lade("deutsch");
  deutsch = { perks: roh?.daten?.perks || {}, charaktere: roh?.daten?.charaktere || {} };
  return deutsch;
}

const KEYWORD_DE = { Haste: "Eile", Hindered: "Behindert", Exposed: "Ungeschützt", Exhausted: "Erschöpft", Blindness: "Blindheit", Broken: "Gebrochen",
  DeepWound: "Tiefe Wunde", Endurance: "Ausdauer", Hemorrhage: "Blutung", Mangled: "Verstümmelt", Oblivious: "Ahnungslos", Undetectable: "Unentdeckbar",
  Elusive: "Unauffindbar", Incapacitated: "Handlungsunfähig", Madness: "Wahnsinn", Haemorrhage: "Blutung" };
const INPUT = { ActivatableButton1: "Fähigkeits-Taste 1", ActivatableButton2: "Fähigkeits-Taste 2", UseItem: "Item-Taste" };

// Beschreibung aus tricky.lol lesbar machen: {Tunable.X.Name%} -> Werte je Stufe, {Keyword.X} -> Begriff, HTML -> Text
export function formatiere(beschreibung, tunables) {
  const tun = {};
  for (const [k, v] of Object.entries(tunables || {})) tun[k.toLowerCase()] = v;
  return String(beschreibung || "")
    .replace(/\{Tunable\.[^.}]+\.([^}]+)\}/g, (m, n) => {
      const w = tun[n.toLowerCase()] ?? tun[n.toLowerCase().replace(/%$/, "")];
      if (w == null) return "?";
      return Array.isArray(w) ? [...new Set(w)].join("/") : String(w);
    })
    .replace(/\{Keyword\.([^}]+)\}/g, (m, n) => { const k = n.charAt(0).toUpperCase() + n.slice(1); return k.replace(/([a-z])([A-Z])/g, "$1 $2"); })
    .replace(/\{Input\.([^}]+)\}/g, (m, n) => INPUT[n] || n)
    .replace(/<li[^>]*>/gi, "\n• ").replace(/<\/(ul|ol)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export async function perks() {
  if (perkIndex) return perkIndex;
  const roh = await lade("perks");
  const chars = await charaktere();
  const de = await uebersetzungen();
  const nachSchluessel = new Map(chars.map((c) => [String(c.schluessel), c]));
  const liste = [];
  for (const rolle of ["survivor", "killer"]) {
    const quelle = roh?.daten?.[rolle];
    let eintraege = alsListe(quelle?.perks ?? quelle);
    eintraege = eintraege.filter((p) => p && (p.name || p.perk_name || p.id));
    for (const p of eintraege) {
      const name = ohneHtml(p.name || p.perk_name || hübsch(p.id));
      const r = String(p.role || rolle).toLowerCase().includes("killer") ? "killer" : "survivor";
      const ch = p.character != null ? nachSchluessel.get(String(p.character)) : null;
      liste.push({
        id: String(p.schluessel ?? p.id ?? name), name, de: de.perks[name] || "", rolle: r,
        text: formatiere(p.description || p.desc || p.perk_description || "", p.tunables),
        charakter: ch ? ch.name : ohneHtml(p.characterName || p.owner || ""),
        charakterDe: ch ? ch.de : "",
        bild: p.image || p.icon || null,
      });
    }
  }
  // Nur wenn (noch) keine Live-Daten da sind: Offline-Liste nehmen
  if (!liste.length) {
    for (const rolle of ["survivor", "killer"]) for (const name of PERKNAMEN[rolle]) liste.push({ id: name, name, de: de.perks[name] || "", rolle, text: "", charakter: "" });
  }
  // Doppelte Namen raus
  const gesehen = new Set();
  perkIndex = liste.filter((p) => !gesehen.has(p.rolle + p.name) && gesehen.add(p.rolle + p.name)).sort((a, b) => a.name.localeCompare(b.name));
  perkIndex.ausLive = !!roh?.daten;
  return perkIndex;
}

export const perkText = (p) => p.text || "";

let charIndex = null;
export async function charaktere() {
  if (charIndex) return charIndex;
  const roh = await lade("charaktere");
  const de = await uebersetzungen();
  charIndex = alsListe(roh?.daten).map((c) => {
    const name = ohneHtml(c.name || hübsch(c.id));
    return {
      schluessel: String(c.schluessel ?? c.id), id: String(c.id), name, de: de.charaktere[name] || "",
      rolle: String(c.role || "").toLowerCase().includes("killer") ? "killer" : "survivor",
      bio: formatiere(c.bio || ""), story: formatiere(c.story || ""), info: c,
    };
  }).filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name));
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
    multi: e.multiplier ?? e.bloodpoints_multiplier ?? (e.bonus > 0 ? e.bonus : null),
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
