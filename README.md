# Kayron Zeiterfassung

Web-App zur Arbeitszeiterfassung für die Reinigungsfirma. Läuft im Browser auf PC, Tablet und Handy
(kann auf dem Handy über „Zum Home-Bildschirm hinzufügen“ wie eine App installiert werden).

## Funktionen

**Für Mitarbeiter (Handy)**
- Anmeldung mit Benutzername + PIN
- Stempeluhr: Objekt wählen → **Einstempeln** → beim Gehen Pause wählen → **Ausstempeln**
- Beim Ein- und Ausstempeln wird automatisch der **GPS-Standort** gespeichert
- **Fotos hochladen** (z. B. vom gereinigten Treppenhaus) – direkt mit der Kamera oder aus der Galerie,
  mit Beschreibung (Treppenhaus, Eingang, Flur …). Fotos werden automatisch verkleinert.
- „Meine Zeiten“: alle eigenen Einträge pro Monat + Stundennachweis
- **Funktioniert auch ohne Internet** (Keller, Treppenhaus): Stempeln, Fotos und Meldungen werden auf dem
  Handy gespeichert und automatisch übertragen, sobald wieder Netz da ist – mit der echten Uhrzeit
- **Urlaub beantragen** und **krank melden**; Resturlaub und Krankheitstage immer im Blick
- **Meldungen**: Defekt, Material fehlt, Schaden, Verschmutzung, Schlüsselproblem – mit Fotos
- **Konto**: „Meine Schlüssel“ – welche Schlüssel man gerade hat

**Für den Chef / Admin**
- **Übersicht**: wer gerade wo im Einsatz ist (live), Stunden heute und im Monat
- **Zeiten**: alle Einträge filtern (Zeitraum, Mitarbeiter, Objekt), bearbeiten, löschen, nachtragen,
  vergessenes Ausstempeln korrigieren; Nachtschichten über Mitternacht werden automatisch erkannt
- **Standortprüfung**: Zu jedem Ein-/Ausstempeln siehst du „am Objekt“ (grün) oder z. B. „3,3 km entfernt“ (orange),
  mit Link zu Google Maps. Dafür beim Objekt einmal die GPS-Position hinterlegen
  (vor Ort „Aktuellen Standort übernehmen“ tippen oder Koordinaten aus Google Maps einfügen).
- **Fotos**: alle Fotos nach Tag und Objekt sortiert, filterbar; die neuesten auch auf der Übersicht
  und beim jeweiligen Zeiteintrag
- **Urlaub & Krankheit**: Anträge genehmigen/ablehnen (auch direkt auf der Übersicht), Urlaubskonto pro Jahr
  (Anspruch, genommen, geplant, Rest), Krankheitstage, Vermerk „AU liegt vor“. Gezählt werden Arbeitstage
  Mo–Fr ohne bundesweite Feiertage. Abwesenheiten erscheinen auch im Stundennachweis und in der Auswertung.
- **Meldungen**: alle Mängel-/Materialmeldungen mit Fotos und Ort; Status Offen → In Bearbeitung → Erledigt,
  Notiz für den Mitarbeiter (z. B. „Hausverwaltung informiert“). Zähler für offene Punkte im Menü.
- **Schlüssel**: Schlüssel pro Objekt anlegen, an Mitarbeiter ausgeben, weitergeben, zurücknehmen,
  als verloren melden – mit vollständigem Verlauf. Beim Mitarbeiter wird angezeigt, wie viele Schlüssel er hat.
- **Mitarbeiter**: anlegen mit PIN, Stundenlohn, Urlaubsanspruch, Anstellungsart (Minijob/Teilzeit/Vollzeit/Aushilfe), deaktivieren
- **Objekte & Kunden**: Einsatzorte mit Adresse (Link zu Google Maps) und Notizen (Schlüssel, Codes …)
- **Auswertung** pro Monat: Stunden und Bruttolohn je Mitarbeiter, Stunden je Objekt/Kunde (für Rechnungen),
  Warnung bei Überschreitung der **Minijob-Grenze** und bei Lohn unter **Mindestlohn**
- **Stundennachweis** pro Mitarbeiter und Monat – druckbar bzw. als PDF speicherbar, mit Unterschriftsfeldern
- **CSV-Export** (öffnet direkt in Excel) und **Datensicherung** als JSON

## Starten

Voraussetzung: [Node.js](https://nodejs.org) **Version 22.5 oder neuer**. Es müssen keine weiteren Pakete installiert werden.

```bash
npm start
```

Dann im Browser öffnen: <http://localhost:3000>

Beim ersten Aufruf legst du dein Admin-Konto an. Danach unter **Mitarbeiter** deine Leute anlegen
und ihnen Benutzername + PIN geben.

### Einstellungen über Umgebungsvariablen
| Variable   | Standard  | Bedeutung                          |
|------------|-----------|------------------------------------|
| `PORT`     | `3000`    | Port des Webservers                |
| `DATA_DIR` | `./data`  | Ordner für die Datenbank (`kayron.db`) |

## Online stellen mit Railway (empfohlen, ca. 5 $/Monat)

1. Auf <https://railway.com> mit dem GitHub-Konto anmelden und den **Hobby-Plan** wählen.
2. **New Project → Deploy from GitHub repo →** `Kayron-app` auswählen.
   Railway erkennt das `Dockerfile` automatisch und baut die App.
3. Im Service unter **Settings → Source → Branch** den Branch mit der App wählen
   (solange sie noch nicht auf `main` liegt).
4. **Volume anlegen** (sonst gehen bei jedem Update alle Daten verloren!):
   Rechtsklick auf den Service → *Attach Volume* → Mount Path: **`/data`**
5. Unter **Settings → Networking → Generate Domain** klicken. Du bekommst eine Adresse wie
   `kayron-app-production.up.railway.app` – mit HTTPS, damit funktionieren Standort, Kamera und Offline-Modus.
6. Adresse im Browser öffnen → Chef-Konto anlegen → Mitarbeiter und Objekte anlegen.

Optional eigene Adresse: unter *Networking → Custom Domain* z. B. `zeiten.kayron-reinigung.de` eintragen und
den angezeigten CNAME-Eintrag bei deinem Domain-Anbieter setzen.

### Auf dem Handy als App installieren
- **iPhone (Safari):** Adresse öffnen → Teilen-Symbol → *Zum Home-Bildschirm*
- **Android (Chrome):** Adresse öffnen → Menü ⋮ → *App installieren* bzw. *Zum Startbildschirm hinzufügen*

Beim ersten Stempeln fragt das Handy, ob die App den Standort verwenden darf → **Erlauben** tippen.

## Damit Mitarbeiter von unterwegs stempeln können

Die App muss auf einem Server laufen, der aus dem Internet erreichbar ist, z. B.:
- einem kleinen VPS (Hetzner, IONOS, Strato …) mit Node.js, dahinter Caddy oder nginx für **HTTPS**
- einer Plattform wie Railway, Render oder Fly.io (dort ein dauerhaftes Volume für `DATA_DIR` einrichten!)

**Wichtig:** Im Internet nur über HTTPS betreiben – ohne HTTPS erlauben Handys **keinen Standortzugriff**
(Kamera-Upload funktioniert trotzdem). Wird der Standort verweigert, kann trotzdem gestempelt werden;
der Eintrag zeigt dann „kein Standort“.

**Datenschutz (DSGVO):** Der Standort wird nur im Moment des Ein-/Ausstempelns und beim Foto-Upload
erfasst, nicht dauerhaft. Informiere deine Mitarbeiter schriftlich darüber (Zweck: Nachweis der
Arbeitszeit am Einsatzort gegenüber Kunden).

**Offline-Modus:** Die App muss einmal mit Internet geöffnet worden sein (und der Mitarbeiter angemeldet),
danach startet sie auch ohne Netz. Offline gespeicherte Aktionen, die älter als 3 Tage sind, werden nicht mehr
angenommen. Einträge, die offline erfasst wurden, sind in der Datenbank markiert.

Fotos liegen im Ordner `data/photos/` – bei der Datensicherung diesen Ordner mitsichern.

Bitte außerdem regelmäßig unter *Einstellungen → Datensicherung*
eine Sicherung herunterladen (oder den Ordner `data/` sichern).

## Technik
- `server.js` – Node.js-Server mit eingebauter SQLite-Datenbank (`node:sqlite`), keine Abhängigkeiten
- `public/` – Oberfläche (HTML/CSS/JavaScript, ohne Framework)
  - `app.js` Grundfunktionen, Stempeluhr, Zeiten, Mitarbeiter, Objekte, Auswertung
  - `extra.js` Urlaub & Krankheit, Meldungen, Schlüssel
  - `offline.js` + `sw.js` Offline-Modus (Warteschlange in IndexedDB, Service Worker)
- Passwörter werden mit scrypt gehasht, Anmeldung über sichere HttpOnly-Cookies
