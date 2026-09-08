-- =========================================================================
-- Lot 0.1.1 — Rückmeldungen aus der Werkstatt
--
-- Wer beim Arbeiten merkt, dass etwas fehlt oder stört, schreibt es direkt
-- in der App auf. Ricardo sieht die Liste und arbeitet sie ab.
--
-- Wird beim Ausrollen von 0.1.1 eingespielt:
--   npx wrangler d1 execute lot-weur --remote --file=server/migration_0_1_1_meldungen.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS meldungen (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  art      TEXT NOT NULL DEFAULT 'wunsch'
             CHECK (art IN ('fehler', 'wunsch', 'frage')),
  text     TEXT NOT NULL,
  seite    TEXT DEFAULT '',      -- wo es aufgefallen ist
  wer      TEXT NOT NULL,
  wann     TEXT NOT NULL DEFAULT (datetime('now')),
  status   TEXT NOT NULL DEFAULT 'offen'
             CHECK (status IN ('offen', 'angeschaut', 'erledigt', 'zurueckgestellt')),
  antwort  TEXT DEFAULT '',      -- was Ricardo dazu sagt
  geaendert TEXT
);

CREATE INDEX IF NOT EXISTS idx_meldungen_status ON meldungen(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_meldungen_wer    ON meldungen(wer, id DESC);
