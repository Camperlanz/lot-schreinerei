# Lot — Web-App für die Schreinerei

Diese Datei ist die Übergabe. Wer hier neu einsteigt (Mensch oder KI), liest sie zuerst.

**Stand: 28.08.2026**

---

## Worum es geht

Ricardo baut seine eigene Schreinerei auf (Schweiz, Gründungsphase) und dazu **Lot** —
eine Web-App, die am Büro-PC und am iPad in der Werkstatt läuft. Der Name kommt vom
Senklot: „alles im Lot".

Der Aufbau läuft ausdrücklich **strukturiert und Schritt für Schritt**. Fertig sind
Farbkonzept, Anmeldung und der Bereich Bestellung. Ein Technologie-Stack ist noch
**nicht** gewählt — alles sind eigenständige HTML-Dateien, die ohne Server im Browser
laufen. Kein Backend, keine Datenbank, keine echte Anmeldung.

## Arbeitsstil

Deutsch, kurz und direkt. Ricardo will durchziehen, keine langen Erklärungen und keine
Rückfragen bei Kleinigkeiten. Bei echten Weggabelungen kurz fragen, sonst bauen und die
Annahme dazusagen.

---

## Dateien

| Datei | Inhalt |
|---|---|
| `design/tokens.css` | Das Farbsystem als CSS-Variablen. **Grundlage für alles.** |
| `design/farbkonzept.html` | Das Farbkonzept zum Anschauen, mit Kontrastwerten |
| `app/login.html` | Anmeldung |
| `app/bestellung.html` | Lager, Scannen, Bestellliste |

Die HTML-Dateien tragen die Tokens **inline**, damit sie einzeln laufen. Beim echten
Build stattdessen `tokens.css` einbinden — die Werte sind identisch.

---

## Farbsystem „Späne & Eiche"

Orange **#F26419** als Marke, warme Neutrals (Holz statt Beton), Petrol als Sekundärfarbe.

**Vier Regeln, die nicht verhandelbar sind:**

1. **Orange trägt niemals weissen Text.** Weiss auf #F26419 erreicht nur 3,18:1 und fällt
   durch WCAG AA. Orangeflächen bekommen dunklen Text (`--text-on-brand`, 5,82:1).
2. **Orange als Text** nur über `--brand-text` (Stufe 700 hell / 400 dunkel), nie `--brand`.
3. **Status ist nie orange** — sonst verschwimmt Marke mit Warnung. Grün/Gelb/Rot/Blau.
4. **Nur semantische Tokens in Komponenten**, nie Hex-Werte. Sonst bricht der Dunkelmodus.

Dunkelmodus ist gleichwertig, nicht Zugabe — drei Zustände sind abgedeckt: System hell,
System dunkel, ausdrückliche Wahl (`data-theme`).

Werkstatt-Kontext treibt die Entscheidungen: Gegenlicht vom Tor, Staub, oft nur eine freie
Hand. Bedienelemente mindestens 44 px, Hauptaktionen 56 px. Masse und Nummern in
IBM Plex Mono mit `tabular-nums`. Schriften: Archivo (Titel), IBM Plex Sans (Text),
IBM Plex Mono (Zahlen).

---

## Was gebaut ist

### Anmeldung (`app/login.html`)

Bereichswahl oben (aktuell **Bestellung**, dazu gesperrte Platzhalter Auftrag und Zeit),
darunter **Benutzername + Passwort**. Neue Bereiche ergänzt man im Array `BEREICHE` ganz
oben im Script — eine Zeile pro Bereich.

Test: `ricardo` / `lot`.

### Bestellung (`app/bestellung.html`)

Drei Reiter: **Scannen · Lager · Bestellen**.

**Der Ablauf:** Etikett scannen → der Artikel erscheint → *dann* entscheiden:
Entnehmen, Einlagern oder „Muss bestellt werden". Der Scan selbst bucht nichts.

**Gescannt wird mit einem Handscanner am iPad**, nicht mit der Kamera. So ein Scanner
meldet sich als Tastatur an. Deshalb:
- globaler `keydown`-Empfang, kein Eingabefeld nötig
- Tempoerkennung: über 90 ms Abstand zwischen Zeichen ist ein Mensch, kein Scanner
- Eingabefelder ausser dem Codefeld sind vom Scan-Empfang ausgenommen
- Doppellesungen innerhalb 1,2 s werden verworfen
- Tonsignal bei Erfolg und Fehler, weil beim Scannen niemand aufs Display schaut

**Bestellliste:** Was die Werkstatt meldet, landet nach Lieferant gruppiert beim Büro.
Die Menge trägt das Büro ein. Bestand 0 meldet sich selbst.

Bestände liegen in `localStorage` — nur im jeweiligen Browser, kein Gerätabgleich.

---

## Verworfene Ansätze — bitte nicht neu vorschlagen

Ricardo hat diese Wege ausdrücklich abgelehnt:

- **Mindest- und Sollbestand** im Artikelstamm. Zu viel Pflege. Stattdessen der
  Meldeknopf: was fehlt, sieht der Mann an der Maschine, nicht die Datenbank.
- **Scanmodus vorab wählen** (Entnehmen/Einlagern/… als Kacheln oben). Erst scannen,
  dann entscheiden.
- **Getrennte Anmeldung Werkstatt/Büro** mit PIN-Feld fürs iPad. Ein Weg genügt.
- **Leere Platzhalter-Kästen.** Was noch keinen Inhalt hat, wird gar nicht angezeigt —
  die Artikelkarte erscheint erst nach dem Scan.

---

## Artikelstamm

Ein Artikel im Array `STAMM` (oben in `bestellung.html`):

```js
{ code:'LOT-0002',                    // Inhalt des QR-Etiketts, eindeutig
  name:'Spanplattenschraube 4,0 × 60',
  einheit:'Stk',
  lieferant:'Opo Oeschger',
  lnr:'21.943.60',                    // Artikelnummer beim Lieferanten
  ort:'Regal A / Fach 2',
  ist:320,                            // Bestand
  schritt:100 }                       // Verpackungseinheit, füllt die Mengen-Schnelltasten
```

Die acht Artikel und die Lieferanten sind **Beispieldaten**.

---

## Offene Punkte

**Muss entschieden werden:**
- Technologie-Stack. Davon hängt ab, ob Bestände zwischen iPad und PC abgeglichen werden.
- Verhältnis zur bestehenden App **SchreiniBestell** (.NET 10, 11 Lieferanten, Scan am
  iPhone → Bestellung am PC). Löst Lot sie ab, oder übernimmt Lot deren Artikelstamm und
  Lieferanten? Am 27.08.2026 gefragt, noch offen.

**Fehlt noch im Bereich Bestellung:**
- Artikel anlegen und bearbeiten
- QR-Etiketten drucken (ohne die geht in der Werkstatt gar nichts)
- Echte Anmeldung mit Sitzungen
- Bestellung tatsächlich an die Lieferanten schicken

**Kleinigkeit:** „Letzte Buchungen" zeigt noch einen leeren Kasten, solange nichts gebucht
wurde. Ricardo wurde gefragt, ob das auch erst mit der ersten Buchung erscheinen soll —
noch keine Antwort.

---

## Wo die Dateien liegen

- Arbeitsstand: `C:\Users\Ricardo\Documents\Claude\Projects\Schreinerei` (Haupt-PC)
- Kopie: `OneDrive - Restaurant Linde Sommeri GmbH\Lot_Schreinerei_App`

Die Kopie ist eigenständig. Wer an einem Ort weiterarbeitet, muss sie erneut abgleichen,
sonst laufen die Stände auseinander.
