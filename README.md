# Kayron Zeiterfassung

Web-App zur Arbeitszeiterfassung für die Reinigungsfirma. Läuft im Browser auf PC, Tablet und Handy
(kann auf dem Handy über „Zum Home-Bildschirm hinzufügen“ wie eine App installiert werden).

## Funktionen

**Für Mitarbeiter (Handy)**
- Anmeldung mit Benutzername + PIN
- Stempeluhr: Objekt wählen → **Einstempeln** → beim Gehen Pause wählen → **Ausstempeln**
- „Meine Zeiten“: alle eigenen Einträge pro Monat + Stundennachweis

**Für den Chef / Admin**
- **Übersicht**: wer gerade wo im Einsatz ist (live), Stunden heute und im Monat
- **Zeiten**: alle Einträge filtern (Zeitraum, Mitarbeiter, Objekt), bearbeiten, löschen, nachtragen,
  vergessenes Ausstempeln korrigieren; Nachtschichten über Mitternacht werden automatisch erkannt
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

**Wichtig:** Im Internet nur über HTTPS betreiben, und regelmäßig unter *Einstellungen → Datensicherung*
eine Sicherung herunterladen (oder den Ordner `data/` sichern).

## Technik
- `server.js` – Node.js-Server mit eingebauter SQLite-Datenbank (`node:sqlite`), keine Abhängigkeiten
- `public/` – Oberfläche (HTML/CSS/JavaScript, ohne Framework)
- Passwörter werden mit scrypt gehasht, Anmeldung über sichere HttpOnly-Cookies
