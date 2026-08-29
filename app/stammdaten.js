/* =========================================================================
   Lot — gemeinsame Stammdaten für alle Seiten der App

   Artikel und Lieferanten liegen im localStorage des Geräts. Jede Seite
   liest und schreibt über diese Datei, damit ein Artikel, der unter
   "Artikel" angelegt wird, auch beim Scannen auftaucht.

   Später ersetzt eine Datenbank diese Datei — die Funktionsnamen bleiben,
   nur ihr Inhalt wird zu Serveraufrufen.
   ========================================================================= */
(function (global) {
  "use strict";

  var ARTIKEL_KEY    = 'lot.artikel.v1';
  var LIEFERANTEN_KEY = 'lot.lieferanten.v1';

  /* Artikel
     code    : Artikelnummer — steht auf dem QR-Etikett, eindeutig.
               Format wie in der gewohnten Inventarliste (82.1025.40040).
     ist     : Startbestand beim Anlegen
     schritt : Verpackungseinheit, füllt die Mengen-Schnelltasten */
  var START_ARTIKEL = [
    { code:'82.1025.40040', name:'Senkkopfschraube 4,0x40 T20 m. Schaft Inox A2', einheit:'Stk',
      lieferant:'Opo Oeschger', ort:'Regal A / Fach 2', ist:1450, schritt:200 },
    { code:'82.1041.45060', name:'Senkkopfschraube 4,5x60 T25 m. Schaft verz', einheit:'Stk',
      lieferant:'Opo Oeschger', ort:'Regal A / Fach 3', ist:320, schritt:200 },
    { code:'82.1042.08120', name:'Senkkopfschraube 8,0x120 T40 m. Schaft verz', einheit:'Stk',
      lieferant:'Opo Oeschger', ort:'Regal A / Fach 5', ist:180, schritt:50 },
    { code:'77.142.4030', name:'Profix Verbinderschraube SK 4,0x30 T20 verz', einheit:'Stk',
      lieferant:'Häfele', ort:'Regal A / Fach 1', ist:640, schritt:100 },
    { code:'75.551.014', name:'KOCH Euro-Systemschraube SK 6x14,5 K8 T20', einheit:'Stk',
      lieferant:'Häfele', ort:'Beschlagschrank / Lade 2', ist:95, schritt:100 },
    { code:'23.6425.2870', name:'Nagelrollen REVOTOOL 16° C16-HBK 70 mm', einheit:'Roll',
      lieferant:'Häfele', ort:'Werkbank / Schublade', ist:6, schritt:1 },
    { code:'23.6448.0044', name:'Heftklammern REVOTOOL K5562 44 mm', einheit:'Stk',
      lieferant:'Würth', ort:'Werkbank / Schublade', ist:4200, schritt:1000 },
    { code:'81.357.030', name:'Unterschrankkonsole Badmöbel 300 mm verz', einheit:'Paar',
      lieferant:'Würth', ort:'Beschlagschrank / Lade 1', ist:0, schritt:2 },
    { code:'52.260.010', name:'Staubschutztüre mit Klett 1300 x 3100 mm', einheit:'Stk',
      lieferant:'Würth', ort:'Montagelager / Wand', ist:3, schritt:1 },
    { code:'23.6496.0015', name:'Wellennägel REVOTOOL WN-15 mm-BK', einheit:'Stk',
      lieferant:'Opo Oeschger', ort:'Werkbank / Schublade', ist:1500, schritt:500 }
  ];

  /* Lieferanten — Namen aus dem Artikelstamm, Angaben trägt Ricardo ein */
  var START_LIEFERANTEN = [
    { id:'l1', name:'Opo Oeschger', kunde:'', person:'', mail:'', tel:'', shop:'', notiz:'' },
    { id:'l2', name:'Häfele',       kunde:'', person:'', mail:'', tel:'', shop:'', notiz:'' },
    { id:'l3', name:'Würth',        kunde:'', person:'', mail:'', tel:'', shop:'', notiz:'' }
  ];

  /* Gängige Einheiten für die Auswahl beim Erfassen */
  var EINHEITEN = ['Stk', 'Paar', 'Pack', 'Gebinde', 'Roll', 'm', 'm²', 'kg', 'l'];

  function lesen(key, start) {
    try {
      var raw = global.localStorage.getItem(key);
      if (raw) {
        var daten = JSON.parse(raw);
        if (Array.isArray(daten)) return daten;
      }
    } catch (e) { /* privater Modus oder kaputter Eintrag */ }
    return start.slice();
  }

  function schreiben(key, daten) {
    try {
      global.localStorage.setItem(key, JSON.stringify(daten));
      return true;
    } catch (e) {
      return false;   /* privater Modus: bleibt nur für diese Sitzung */
    }
  }

  global.LotStamm = {
    EINHEITEN: EINHEITEN,

    ladeArtikel: function () { return lesen(ARTIKEL_KEY, START_ARTIKEL); },
    speichereArtikel: function (liste) { return schreiben(ARTIKEL_KEY, liste); },

    ladeLieferanten: function () { return lesen(LIEFERANTEN_KEY, START_LIEFERANTEN); },
    speichereLieferanten: function (liste) { return schreiben(LIEFERANTEN_KEY, liste); },

    /* Nur Namen, alphabetisch — für Auswahllisten */
    lieferantenNamen: function () {
      return this.ladeLieferanten()
        .map(function (l) { return l.name; })
        .sort(function (a, b) { return a.localeCompare(b, 'de'); });
    },

    /* Setzt Artikel und Lieferanten auf den Auslieferungsstand zurück */
    zuruecksetzen: function () {
      schreiben(ARTIKEL_KEY, START_ARTIKEL.slice());
      schreiben(LIEFERANTEN_KEY, START_LIEFERANTEN.slice());
    },

    START_ARTIKEL: START_ARTIKEL
  };
})(window);
