// EntityDex – Zugriff auf das offizielle DBD-Wiki (deadbydaylight.wiki.gg) über die MediaWiki-API.
// von FGSeRaser – https://github.com/FGSeRaser
export const WIKIS = {
  en: { name: "Englisch", basis: "https://deadbydaylight.wiki.gg" },
  de: { name: "Deutsch", basis: "https://deadbydaylight.wiki.gg/de" },
};

const ROOT = "https://deadbydaylight.wiki.gg";

async function api(lang, params) {
  const basis = WIKIS[lang]?.basis || WIKIS.en.basis;
  const q = new URLSearchParams({ format: "json", origin: "*", formatversion: "2", ...params });
  const r = await fetch(`${basis}/api.php?${q}`);
  if (!r.ok) throw new Error(`Wiki HTTP ${r.status}`);
  return r.json();
}

export function wikiLink(titel, lang = "en") {
  return `${WIKIS[lang]?.basis || WIKIS.en.basis}/wiki/${encodeURIComponent(String(titel).replace(/ /g, "_"))}`;
}

export async function suche(text, lang = "en", limit = 25) {
  const d = await api(lang, { action: "query", list: "search", srsearch: text, srlimit: String(limit), srprop: "snippet|timestamp" });
  return (d?.query?.search || []).map((s) => ({ titel: s.title, auszug: s.snippet, zeit: s.timestamp }));
}

// Seite holen und für die App aufbereiten
export async function seite(titel, lang = "en") {
  const d = await api(lang, { action: "parse", page: titel, prop: "text|sections|displaytitle|categories", redirects: "1", disableeditsection: "1", disabletoc: "1" });
  if (d.error) throw new Error(d.error.info || "Seite nicht gefunden");
  const p = d.parse;
  return {
    titel: p.title,
    anzeige: p.displaytitle?.replace(/<[^>]+>/g, "") || p.title,
    html: aufraeumen(p.text, lang),
    abschnitte: (p.sections || []).map((s) => ({ name: s.line.replace(/<[^>]+>/g, ""), anker: s.anchor, ebene: Number(s.toclevel) })),
    kategorien: (p.categories || []).map((c) => c.category.replace(/_/g, " ")),
    url: wikiLink(p.title, lang),
  };
}

function aufraeumen(html, lang) {
  const doc = new DOMParser().parseFromString(`<div id="w">${html}</div>`, "text/html");
  const w = doc.getElementById("w");
  w.querySelectorAll("script, style, link, meta, .mw-editsection, .navbox, .noprint, .printfooter, .mw-empty-elt, #toc, .toc").forEach((e) => e.remove());
  w.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
    if (src.startsWith("/")) img.setAttribute("src", ROOT + src);
    img.removeAttribute("srcset");
    img.setAttribute("loading", "lazy");
    img.removeAttribute("width"); img.removeAttribute("height");
  });
  w.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const m = href.match(/^(?:\/[a-z]{2})?\/wiki\/([^#?]+)(#.*)?$/);
    if (m && !/^(File|Datei|Special|Spezial|Category|Kategorie|Template|Vorlage):/i.test(decodeURIComponent(m[1]))) {
      a.setAttribute("href", "#");
      a.dataset.wiki = decodeURIComponent(m[1]).replace(/_/g, " ");
    } else if (href.startsWith("/")) {
      a.setAttribute("href", ROOT + href); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
    } else if (/^https?:/.test(href)) {
      a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
    }
  });
  w.querySelectorAll("[style]").forEach((e) => {
    // Farben/Fonts aus dem Wiki weg, damit es zum dunklen Design passt (Breiten behalten)
    e.style.removeProperty("background"); e.style.removeProperty("background-color"); e.style.removeProperty("color");
  });
  return w.innerHTML;
}

// Abschnitte, die für EntityDex besonders interessant sind
export const ABSCHNITT_MUSTER = {
  verlauf: /change ?log|patch|histor|änderung|verlauf/i,
  lore: /lore|geschichte|biograph|backstory|hintergrund/i,
  skins: /cosmetic|customi[sz]ation|outfit|kosmet|anpassung|skin/i,
  perks: /^perks?$|unique perks|eigene perks|teachable/i,
  preis: /dlc|price|cost|purchas|kauf|preis|chapter/i,
  addons: /add-?ons?/i,
};

// Bild einer Wiki-Seite (Hauptbild)
export async function bildVonSeite(titel, breite = 800) {
  const d = await api("en", { action: "query", titles: titel, prop: "pageimages", piprop: "thumbnail|original", pithumbsize: String(breite), redirects: "1" });
  const p = d?.query?.pages?.[0];
  return p?.thumbnail?.source || p?.original?.source || null;
}

// Erstes passendes Bild aus der Dateisuche des Wikis
export async function bildSuche(begriff, breite = 800) {
  const d = await api("en", { action: "query", list: "search", srsearch: begriff, srnamespace: "6", srlimit: "5" });
  for (const t of d?.query?.search || []) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(t.title)) continue;
    const i = await api("en", { action: "query", titles: t.title, prop: "imageinfo", iiprop: "url", iiurlwidth: String(breite) });
    const info = i?.query?.pages?.[0]?.imageinfo?.[0];
    if (info) return info.thumburl || info.url;
  }
  return null;
}
