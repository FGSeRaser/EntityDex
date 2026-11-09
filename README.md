<p align="center"><img src="icons/icon-192.png" width="120" alt="EntityDex"></p>

<h1 align="center">EntityDex</h1>
<p align="center"><b>Das Dead-by-Daylight-Nachschlagewerk – live, kostenlos, ohne Werbung.</b><br>
von <a href="https://github.com/FGSeRaser">FGSeRaser</a></p>

---

EntityDex ist eine Web-App (PWA) für alles rund um **Dead by Daylight** – am Handy und am PC, auch ohne dass du gerade spielst.
Einfach öffnen, nachschlagen, und am Handy über „Zum Startbildschirm hinzufügen“ wie eine echte App mit Icon installieren.

[Zu EntityDex](https://fgseraser.github.io/EntityDex/)

## Was kann EntityDex?

| Bereich | Inhalt |
|---|---|
| 🏠 **Start** | Schrein der Geheimnisse (mit Shard-Preisen & Countdown), laufende & kommende **Events**, **Codes** zum Kopieren, aktuelle **Kill-Switch**-Liste, **Patches & News** (filterbar: Patch, PTB/Demnächst, Event, Kill Switch, Kapitel), Rang-Reset-Countdown |
| 🩸 **Perks** | Alle Killer- und Survivor-Perks mit Suche, Beschreibung (Werte je Stufe), Kategorie – und aus dem Wiki **wann und wie der Perk geändert wurde und wie er vorher war** |
| 🔪 **Charaktere** | Alle Killer & Survivor: Geschichte, Perks, Skins, Preis/DLC – direkt aus dem offiziellen Wiki |
| 🎯 **Challenges** | Challenges anlegen (Vorlagen, Listen „jeder Killer/Survivor/Map“, Perks), Fortschritt abhaken, **für den Stream planen** (Datum + Notiz) – mit Konto **automatisch im [DBD Companion](https://github.com/FGSeRaser/DBD-Companion) am PC**, inklusive Ingame-Overlay |
| 🎲 **Builds** | **Perk-Roulette** (Perks festhalten 🔒), Builds nach **Spielstil** (Team/Unhooks, Heilen, Gens, Chase, Taschenlampe, Stealth, Info, Solo-Queue · Killer: Gen-Bremse, Chase, Tracking, Haken, Hex, Endgame, Stealth) und bewährte **Perk-Kombos** |
| 📜 **Archiv** | Eine lange, eigene **Geschichte von Dead by Daylight** von 2016 bis heute mit Bildern · **Kapitel-Zeitleiste** mit Jahr & Monat (Killer, Survivor, Maps) · alle **Maps** nach Realm |
| 🔎 **Suche** | Alles aus dem DBD-Wiki: Maps, Items, Add-ons, Opfergaben, Skins, Shop-Preise, Spielmodi … |
| 📊 **Spieler** | **Steam-Profil-Link einfügen** → Steam-ID wird automatisch erkannt → Stats von [dbd.tricky.lol](https://dbd.tricky.lol) |

## Android-App

Unter **[Releases](../../releases)** liegt `EntityDex-x.y.z.apk` (Tag `app-v…`). Auf dem Handy öffnen und installieren. Die App holt ihre Daten immer frisch von der Webseite.

## Verbindung mit dem DBD Companion

EntityDex (Handy/Web) und der [DBD Companion](https://github.com/FGSeRaser/DBD-Companion) (PC) teilen sich die Challenges über ein Konto:
in beiden mit derselben E-Mail anmelden → was du am Handy planst, steht am PC bereit (und Fortschritt vom PC landet auf dem Handy).
Die Builds und Maps im Companion kommen ebenfalls direkt aus EntityDex.

**Einmal einrichten** (kostenlos, ca. 5 Minuten):
1. Auf [supabase.com](https://supabase.com) ein Gratis-Konto und ein neues Projekt anlegen.
2. Im Projekt *SQL Editor* öffnen, den Inhalt von [`supabase/einrichten.sql`](supabase/einrichten.sql) einfügen und *Run* klicken.
3. *Authentication → URL Configuration → Site URL* auf `https://fgseraser.github.io/EntityDex/` setzen.
4. *Project Settings → API*: **Project URL** und den **anon public**-Schlüssel in [`js/sync-config.js`](js/sync-config.js) eintragen. Fertig – der Companion liest die Werte automatisch von hier.

## So funktioniert es

- **Live-Daten** (Schrein, Events, Codes, Kill Switch, News, Perks, Charaktere) holt eine **GitHub Action alle 3 Stunden** und legt sie in `data/`. Es braucht keinen eigenen Server.
- **Wiki-Inhalte** (Suche, Perk-Änderungen, Lore, Skins, Bilder) werden beim Öffnen **live** aus dem [offiziellen DBD-Wiki](https://deadbydaylight.wiki.gg) geladen – auf Englisch oder Deutsch (oben umschaltbar).
- Fällt eine Quelle mal aus, bleiben die letzten Daten stehen. Unten auf der Startseite steht, wann zuletzt aktualisiert wurde und welche Quelle Probleme hatte.

## Einrichten (einmalig)

1. **GitHub Pages einschalten:** *Settings → Pages → Build and deployment → Source: „Deploy from a branch“ → Branch `main`, Ordner `/ (root)` → Save.*
   Nach ca. 1 Minute läuft die App unter `https://fgseraser.github.io/EntityDex/`.
2. **Der Action Schreibrechte geben:** *Settings → Actions → General → Workflow permissions → „Read and write permissions“ → Save.*
3. **Ersten Datenlauf starten:** *Actions → „Daten aktualisieren“ → „Run workflow“.* Danach läuft es automatisch alle 3 Stunden.

### Codes selbst ergänzen
Findet der Sammler einen Code nicht, trag ihn in [`data/codes_manuell.json`](data/codes_manuell.json) ein:
```json
{ "codes": [ { "code": "BEISPIELCODE", "belohnung": "250.000 Bloodpoints", "abgelaufen": false } ] }
```

## Projektaufbau

```
index.html            Oberfläche
css/app.css           Design (dunkel, mobil zuerst)
js/app.js             Hauptlogik (Tabs, Ansichten, Spieler-Suche)
js/daten.js           Live-Daten laden & vereinheitlichen
js/wiki.js            Zugriff auf das DBD-Wiki
js/builds.js          Spielstile, Perk-Kategorien, Kombos, Roulette
js/kapitel.js         Kapitel-Zeitleiste
js/geschichte.js      Die Geschichte von Dead by Daylight
js/maps.js            Realms & Maps
js/challenges.js      Challenges & Stream-Plan
js/sync.js            Konto & Sync mit dem DBD Companion (Supabase)
js/sync-config.js     Zugangsdaten der Online-Datenbank
supabase/             SQL zum Einrichten der Datenbank
scripts/sammeln.mjs   Datensammler (läuft in der GitHub Action)
.github/workflows/    Daten alle 3 Stunden, Android-App bei jeder App-Änderung
```

Lokal testen: `python -m http.server` im Ordner starten und `http://localhost:8000` öffnen.

## Quellen & Hinweis

Daten von [dbd.tricky.lol](https://dbd.tricky.lol), dem [offiziellen Dead by Daylight Wiki](https://deadbydaylight.wiki.gg), der Steam-News-API und dem [BHVR-Forum](https://forums.bhvr.com/dead-by-daylight/kb/articles/299-kill-switch-master-list).
EntityDex ist ein **Fan-Projekt** und nicht mit Behaviour Interactive verbunden. Dead by Daylight sowie alle Namen, Bilder und Marken gehören ihren jeweiligen Inhabern. Bilder werden live aus dem Wiki geladen und nicht im Repo gespeichert.

---
<p align="center">Gemacht von <a href="https://github.com/FGSeRaser">FGSeRaser</a></p>
