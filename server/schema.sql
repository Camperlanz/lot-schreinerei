-- =========================================================================
-- Lot — Datenmodell
--
-- Läuft auf Cloudflare D1 (SQLite). Bewusst schlank gehalten: jede Tabelle
-- hat eine klare Aufgabe, und die Artikelnummer ist überall derselbe
-- Schlüssel wie auf dem Etikett.
--
-- Einspielen:  npx wrangler d1 execute lot --remote --file=server/schema.sql
-- =========================================================================

-- ---------- Lieferanten ---------------------------------------------------
CREATE TABLE IF NOT EXISTS lieferanten (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  kunde   TEXT DEFAULT '',      -- unsere Kundennummer dort
  person  TEXT DEFAULT '',      -- Ansprechperson
  mail    TEXT DEFAULT '',      -- Bestelladresse
  tel     TEXT DEFAULT '',
  shop    TEXT DEFAULT '',
  notiz   TEXT DEFAULT ''
);

-- ---------- Artikel -------------------------------------------------------
-- code ist die Artikelnummer und zugleich der Inhalt des QR-Etiketts.
CREATE TABLE IF NOT EXISTS artikel (
  code         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  einheit      TEXT NOT NULL DEFAULT 'Stk',
  lieferant_id TEXT REFERENCES lieferanten(id) ON DELETE SET NULL,
  ort          TEXT DEFAULT '',
  bestand      INTEGER NOT NULL DEFAULT 0,
  etikett_am   TEXT,            -- wann zuletzt ein Etikett gedruckt wurde
  angelegt     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artikel_lieferant ON artikel(lieferant_id);
CREATE INDEX IF NOT EXISTS idx_artikel_name      ON artikel(name);

-- ---------- Offene Bestellpositionen -------------------------------------
-- Ein Artikel steht höchstens einmal offen: entweder gemeldet oder bestellt.
-- Ist die Ware da, wird zugebucht und die Zeile verschwindet.
CREATE TABLE IF NOT EXISTS bestellungen (
  code    TEXT PRIMARY KEY REFERENCES artikel(code) ON DELETE CASCADE,
  status  TEXT NOT NULL CHECK (status IN ('gemeldet', 'bestellt')),
  menge   INTEGER NOT NULL DEFAULT 0,
  wann    TEXT NOT NULL DEFAULT (datetime('now')),
  wer     TEXT DEFAULT ''
);

-- ---------- Bewegungen ----------------------------------------------------
-- Das Protokoll. Wird nur angehängt, nie geändert — so bleibt
-- nachvollziehbar, wie ein Bestand zustande kam.
CREATE TABLE IF NOT EXISTS bewegungen (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  code   TEXT NOT NULL,
  art    TEXT NOT NULL,         -- Entnahme, Zugang, Wareneingang, Gemeldet, ...
  menge  INTEGER NOT NULL DEFAULT 0,
  danach INTEGER,               -- Bestand nach der Buchung
  wann   TEXT NOT NULL DEFAULT (datetime('now')),
  wer    TEXT DEFAULT '',
  quelle TEXT DEFAULT ''        -- Gerät oder Zwischenspeicher, für den Offline-Fall
);

CREATE INDEX IF NOT EXISTS idx_bewegungen_code ON bewegungen(code, id DESC);
CREATE INDEX IF NOT EXISTS idx_bewegungen_zeit ON bewegungen(id DESC);

-- ---------- Benutzer ------------------------------------------------------
-- Passwörter liegen nur als PBKDF2-Hash mit eigenem Salz vor.
CREATE TABLE IF NOT EXISTS benutzer (
  name     TEXT PRIMARY KEY,
  hash     TEXT NOT NULL,
  salz     TEXT NOT NULL,
  rolle    TEXT NOT NULL DEFAULT 'werkstatt',  -- werkstatt oder buero
  angelegt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Sitzungen -----------------------------------------------------
CREATE TABLE IF NOT EXISTS sitzungen (
  token    TEXT PRIMARY KEY,
  benutzer TEXT NOT NULL REFERENCES benutzer(name) ON DELETE CASCADE,
  bis      TEXT NOT NULL        -- Ablauf, damit alte Sitzungen verfallen
);

CREATE INDEX IF NOT EXISTS idx_sitzungen_bis ON sitzungen(bis);

-- ---------- Doppelte Buchungen abfangen ----------------------------------
-- Kommt eine Buchung aus dem Offline-Zwischenspeicher zweimal an, darf sie
-- den Bestand nur einmal verändern. Der Schlüssel wird auf dem Gerät erzeugt.
CREATE TABLE IF NOT EXISTS gebucht (
  schluessel TEXT PRIMARY KEY,
  wann       TEXT NOT NULL DEFAULT (datetime('now'))
);
