# Lot — Web-App für die Schreinerei

Diese Datei ist die Übergabe. Wer hier neu einsteigt (Mensch oder KI), liest sie zuerst.

**Stand: 10.09.2026 · Version 0.1.3 · läuft online**

---

## Worum es geht

Ricardo baut seine eigene Schreinerei auf (Schweiz, Gründungsphase) und dazu **Lot** —
eine Web-App, die am Büro-PC und am iPad in der Werkstatt läuft. Der Name kommt vom
Senklot: „alles im Lot".

## Arbeitsstil

Deutsch, kurz und direkt. Ricardo will durchziehen, keine langen Erklärungen und keine
Rückfragen bei Kleinigkeiten. Bei echten Weggabelungen kurz fragen, sonst bauen und die
Annahme dazusagen. Er arbeitet oft **vom Handy aus**, weil er spät heimkommt.

---

## Wo es läuft

| | |
|---|---|
| **App** | https://camperlanz.github.io/lot-schreinerei/app/login.html |
| **Schnittstelle** | https://lot-api.ricarsanches16.workers.dev |
| **Datenbank** | Cloudflare D1 `lot-weur` (Westeuropa), Kennung `82d2d946-0c95-4cb2-8d59-043e57550881` |
| **Verzeichnis** | https://github.com/Camperlanz/lot-schreinerei — **öffentlich**, nie Zugangsdaten hineinlegen |
| **Vorschau** | `https://r-pereira.tail477501.ts.net/app/login.html` über Tailscale, nur wenn Ricardos PC läuft |

**Cloudflare gewählt**, weil es nie pausiert: „es kann sein das es wochen nicht benutzt
wird es muss einfach immer laufen die schreiner sind nicht die it freaks."

### Ausrollen

```bash
cd server
export CLOUDFLARE_ACCOUNT_ID=bc54eb8344630ebf4649ea9ca47a194d
npx wrangler deploy
npx wrangler d1 execute lot-weur --remote --file=<migration>.sql
cd .. && git push origin main
```

Ohne `CLOUDFLARE_ACCOUNT_ID` findet wrangler das Konto nicht (Fehler 7403).

GitHub Pages braucht rund eine Minute und liefert HTML mit `max-age=600` aus — bis zu
zehn Minuten sehen Geräte noch die alte Seite. Die Skripte tragen `?v=<hash>`, die sind
sofort aktuell.

**Online nur, wenn Ricardo es sagt.** Er gibt den Zeitpunkt vor.

---

## Dateien

| Datei | Inhalt |
|---|---|
| `design/tokens.css` | Farbsystem als CSS-Variablen. **Grundlage für alles.** |
| `design/farbkonzept.html` | Farbkonzept zum Anschauen, mit Kontrastwerten |
| `app/login.html` | Anmeldung |
| `app/einrichten.html` | Ersteinrichtung — tot, sobald ein Zugang besteht |
| `app/bestellung.html` | Scannen · Lager · Bestellen |
| `app/artikel.html` | Artikel anlegen und ändern |
| `app/lieferanten.html` | Lieferanten |
| `app/etiketten.html` | Etikettenbogen mit QR-Code |
| `app/zugaenge.html` | Zugänge und Rollen — **nur Administrator** |
| `app/rueckmeldung.html` | Was die Werkstatt meldet |
| `app/verbindung.js` | Schnittstelle, Sitzung, Warteschlange ohne Netz, Verbindungsanzeige |
| `app/stammdaten.js` | Datenschicht darüber: Stand holen, schreiben |
| `app/neuerungen.js` | „Was ist neu" — Liste, Kasten, Knopf |
| `app/qr.js` | QR-Kodierung, selbst geschrieben, keine Fremdbibliothek |
| `server/worker.js` | die ganze Schnittstelle |
| `server/schema.sql` | Tabellen |
| `server/leeren.sql` | Datenbank leeren, `ricardo` bleibt stehen |
| `server/beispieldaten_NICHT_EINSPIELEN.sql` | alte Beispieldaten, nur zum Ausprobieren |
| `vorlagen/etiketten_docx.js` | erzeugt den Word-Bogen |

---

## Farbsystem „Späne & Eiche"

Orange **#F26419** als Marke, warme Neutrals (Holz statt Beton), Petrol als Sekundärfarbe.

**Vier Regeln, die nicht verhandelbar sind:**

1. **Orange trägt niemals weissen Text.** Weiss auf #F26419 erreicht nur 3,18:1 und fällt
   durch WCAG AA. Orangeflächen bekommen dunklen Text (`--text-on-brand`, 5,82:1).
2. **Orange als Text** nur über `--brand-text` (Stufe 700 hell / 400 dunkel), nie `--brand`.
3. **Status ist nie orange** — sonst verschwimmt Marke mit Warnung. Grün/Gelb/Rot/Blau.
4. **Nur semantische Tokens in Komponenten**, nie Hex-Werte. Sonst bricht der Dunkelmodus.

Dunkelmodus ist gleichwertig: System hell, System dunkel, ausdrückliche Wahl (`data-theme`).

Werkstatt-Kontext treibt die Entscheidungen: Gegenlicht vom Tor, Staub, oft nur eine freie
Hand. Bedienelemente mindestens 44 px, Hauptaktionen 56 px. Masse und Nummern in
IBM Plex Mono mit `tabular-nums`. Schriften: Archivo (Titel), IBM Plex Sans (Text),
IBM Plex Mono (Zahlen).

---

## Wie die Daten laufen

**Alles Betriebliche steht in der Datenbank**, nicht im Gerät. Nur was zum Gerät gehört,
bleibt lokal: Ton an/aus, Hell/Dunkel, das eigene Etikettenformat, und welche Neuigkeiten
gelesen wurden.

```
Seite  →  LotStamm  →  LotVerbindung  →  Worker  →  D1
```

`LotStamm.start()` holt den Stand einmal beim Öffnen. **Jeder schreibende Endpunkt gibt
den frischen Gesamtstand zurück** (`standHolen`), der ersetzt den Zwischenspeicher. Damit
kann keine Seite mit alten Zahlen weiterarbeiten.

**Ohne Netz:** Der zuletzt geholte Stand wird angezeigt. Buchungen wandern mit einem
Schlüssel in die Warteschlange und werden nachgereicht — der Schlüssel verhindert, dass
eine Buchung doppelt zählt. Artikel und Lieferanten **ändern** verlangt Verbindung; sonst
müsste man raten, wer zuerst war.

Die Datenbank schreibt Zeiten in Weltzeit. Die Seiten rechnen sie auf die Uhr an der Wand
um (`wannAus`, `zeitAus` in `bestellung.html`).

### Rollen

| Rolle | darf |
|---|---|
| `admin` | alles, auch Zugänge anlegen und Rollen vergeben |
| `buero` | Betrieb führen: bestellen, Artikel und Lieferanten pflegen, Rückmeldungen |
| `werkstatt` | scannen, buchen, melden, Ware annehmen; sieht die eigenen Rückmeldungen |

Artikel, Lieferanten, Bestellt-Vermerk und Etiketten verlangen `fuehrtBetrieb` am Server.
In den Seiten blendet `data-nur="betrieb"` die zugehörigen Knöpfe aus; ruft die Werkstatt
eine Büro-Seite direkt auf, kommt ein Hinweis statt Formularen.

Zwei Sperren: der letzte Administrator kann sich weder degradieren noch löschen. Ein
zurückgesetztes Passwort beendet alle Sitzungen dieses Zugangs. **Alles serverseitig
geprüft**, nicht nur in der Oberfläche.

PBKDF2 mit **100 000** Durchgängen — mehr nimmt Cloudflare nicht an, 150 000 wirft
`NotSupportedError` und jede Anmeldung stirbt mit 500.

---

## Was gebaut ist

**Anmeldung** — Bereichswahl (Bestellung aktiv, Auftrag und Zeit als Platzhalter),
Benutzername und Passwort, Knopf „Zeigen".

**Bestellung** — drei Reiter: Scannen · Lager · Bestellen.

Der Ablauf: Etikett scannen → der Artikel erscheint → *dann* entscheiden: Entnehmen,
Einlagern oder „Muss bestellt werden". Der Scan selbst bucht nichts.

Gescannt wird mit einem **Handscanner am iPad**, nicht mit der Kamera. So ein Scanner
meldet sich als Tastatur an. Deshalb: globaler `keydown`-Empfang; über 90 ms zwischen
zwei Zeichen ist ein Mensch, kein Scanner; Eingabefelder ausser dem Codefeld sind
ausgenommen; Doppellesungen innerhalb 1,2 s fliegen raus; Tonsignal bei Erfolg und
Fehler, weil beim Scannen niemand aufs Display schaut.

Bestellliste nach Lieferant gruppiert. Das Büro trägt die Menge ein und vermerkt
„bestellt"; die Werkstatt bucht die Lieferung zu, dann verschwindet die Position.
Bestand 0 meldet sich selbst.

**Artikel · Lieferanten · Etiketten** — Etiketten als Word-Bogen, Standardformat
70 × 36 mm, 24 Stück je Bogen. `etikett_am` am Artikel merkt, was schon gedruckt ist —
sichtbar für alle, nicht nur am druckenden Gerät. Vermerkt wird **nach** Bestätigung,
weil die App nicht sieht, ob Papier herauskam.

**Zugänge · Rückmeldung · Neuigkeiten** — Neuigkeiten gehen nach einem Update einmal von
selbst auf. Beim nächsten Update **nur** einen Block oben in `NEUERUNGEN` einfügen; die
Versionsnummer in der Fusszeile zieht von selbst nach. Punkte mit `nur: ['admin']` sieht
die Werkstatt nicht.

---

## Verworfene Ansätze — bitte nicht neu vorschlagen

- **Mindest- und Sollbestand** im Artikelstamm. Zu viel Pflege. Stattdessen der
  Meldeknopf: was fehlt, sieht der Mann an der Maschine, nicht die Datenbank.
- **Scanmodus vorab wählen.** Erst scannen, dann entscheiden.
- **Getrennte Anmeldung Werkstatt/Büro** mit PIN fürs iPad. Ein Weg genügt.
- **Leere Platzhalter-Kästen.** Was keinen Inhalt hat, wird nicht angezeigt.
- **Supabase** — pausiert nach sieben Tagen Ruhe.
- **Avery-Bestellnummern erfinden.** „3474 gibt es nicht nur 3472 3473 3477 und so
  weiter." Masse angeben, keine Nummern.

---

## Offene Punkte

- **SchreiniBestell** (.NET 10, 11 Lieferanten, Scan am iPhone → Bestellung am PC):
  löst Lot sie ab, oder übernimmt Lot deren Artikelstamm und Lieferanten? Am 27.08.2026
  gefragt, noch offen.
- Bestellung **tatsächlich an die Lieferanten schicken** — bisher nur die Liste.
- **Artikel einlesen** aus der 41-seitigen Inventarliste, statt jeden von Hand.
- Passwort selbst zurücksetzen (bisher: beim Administrator melden).
- Kamera als Ersatzscanner, wenn der Handscanner fehlt.
- Umzug auf Ricardos Windows Server 2022 wäre über Tailscale denkbar — Cloudflare läuft,
  solange kein Grund dagegen spricht.

---

## Wo die Dateien liegen

- Arbeitsstand: `C:\Users\Ricardo\Documents\Claude\Projects\Schreinerei` (Haupt-PC)
- Kopie: `OneDrive - Restaurant Linde Sommeri GmbH\Lot_Schreinerei_App`

Die Kopie ist eigenständig. Wer an einem Ort weiterarbeitet, muss sie erneut abgleichen,
sonst laufen die Stände auseinander.
