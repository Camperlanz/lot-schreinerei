-- Startdaten fuer Lot, aus dem bisherigen Entwurf uebernommen

INSERT OR IGNORE INTO lieferanten (id, name) VALUES ('l1', 'Häfele');
INSERT OR IGNORE INTO lieferanten (id, name) VALUES ('l2', 'Opo Oeschger');
INSERT OR IGNORE INTO lieferanten (id, name) VALUES ('l3', 'Würth');

INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('82.1025.40040', 'Senkkopfschraube 4,0x40 T20 m. Schaft Inox A2', 'Stk', 'l2', 'Regal A / Fach 2', 1450);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('82.1041.45060', 'Senkkopfschraube 4,5x60 T25 m. Schaft verz', 'Stk', 'l2', 'Regal A / Fach 3', 320);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('82.1042.08120', 'Senkkopfschraube 8,0x120 T40 m. Schaft verz', 'Stk', 'l2', 'Regal A / Fach 5', 180);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('77.142.4030', 'Profix Verbinderschraube SK 4,0x30 T20 verz', 'Stk', 'l1', 'Regal A / Fach 1', 640);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('75.551.014', 'KOCH Euro-Systemschraube SK 6x14,5 K8 T20', 'Stk', 'l1', 'Beschlagschrank / Lade 2', 95);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('23.6425.2870', 'Nagelrollen REVOTOOL 16° C16-HBK 70 mm', 'Roll', 'l1', 'Werkbank / Schublade', 6);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('23.6448.0044', 'Heftklammern REVOTOOL K5562 44 mm', 'Stk', 'l3', 'Werkbank / Schublade', 4200);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('81.357.030', 'Unterschrankkonsole Badmöbel 300 mm verz', 'Paar', 'l3', 'Beschlagschrank / Lade 1', 0);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('52.260.010', 'Staubschutztüre mit Klett 1300 x 3100 mm', 'Stk', 'l3', 'Montagelager / Wand', 3);
INSERT OR IGNORE INTO artikel (code, name, einheit, lieferant_id, ort, bestand) VALUES ('23.6496.0015', 'Wellennägel REVOTOOL WN-15 mm-BK', 'Stk', 'l2', 'Werkbank / Schublade', 1500);

INSERT OR IGNORE INTO bestellungen (code, status, menge) SELECT code, 'gemeldet', 0 FROM artikel WHERE bestand <= 0;
