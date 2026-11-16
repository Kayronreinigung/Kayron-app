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

**Für den Chef / Admin**
- **Übersicht**: wer gerade wo im Einsatz ist (live), Stunden heute und im Monat
- **Zeiten**: alle Einträge filtern (Zeitraum, Mitarbeiter, Objekt), bearbeiten, löschen, nachtragen,
  vergessenes Ausstempeln korrigieren; Nachtschichten über Mitternacht werden automatisch erkannt
- **Standortprüfung**: Zu jedem Ein-/Ausstempeln siehst du „am Objekt“ (grün) oder z. B. „3,3 km entfernt“ (orange),
  mit Link zu Google Maps. Dafür beim Objekt einmal die GPS-Position hinterlegen
  (vor Ort „Aktuellen Standort übernehmen“ tippen oder Koordinaten aus Google Maps einfügen).
- **Fotos**: alle Fotos nach Tag und Objekt sortiert, filterbar; die neuesten auch auf der Übersicht
  und beim jeweiligen Zeiteintrag
- **Mitarbeiter**: anlegen mit PIN, Stundenlohn, Anstellungsart (Minijob/Teilzeit/Vollzeit/Aushilfe), deaktivieren
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

Fotos liegen im Ordner `data/photos/` – bei der Datensicherung diesen Ordner mitsichern.

Bitte außerdem regelmäßig unter *Einstellungen → Datensicherung*
eine Sicherung herunterladen (oder den Ordner `data/` sichern).

## Technik
- `server.js` – Node.js-Server mit eingebauter SQLite-Datenbank (`node:sqlite`), keine Abhängigkeiten
- `public/` – Oberfläche (HTML/CSS/JavaScript, ohne Framework)
- Passwörter werden mit scrypt gehasht, Anmeldung über sichere HttpOnly-Cookies
