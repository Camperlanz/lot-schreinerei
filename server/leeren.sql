-- Lot: Datenbank leeren, nur der Zugang ricardo bleibt stehen.
DELETE FROM sitzungen WHERE benutzer <> 'ricardo';
DELETE FROM benutzer  WHERE name     <> 'ricardo';
DELETE FROM meldungen;
DELETE FROM bestellungen;
DELETE FROM bewegungen;
DELETE FROM gebucht;
DELETE FROM artikel;
DELETE FROM lieferanten;
