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

  var ARTIKEL_KEY    = 'lot.artikel.v2';
  var LIEFERANTEN_KEY = 'lot.lieferanten.v2';

  /* Artikel und Lieferanten fangen leer an. Was drin steht, hat jemand
     unter "Artikel" bzw. "Lieferanten" selbst erfasst.
       code : Artikelnummer — steht auf dem QR-Etikett, eindeutig
       ist  : Bestand */
  var START_ARTIKEL = [];
  var START_LIEFERANTEN = [];

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
