/* =========================================================================
   Lot — gemeinsame Daten für alle Seiten der App

   Artikel, Lieferanten, Bestände und die Bestellliste liegen in der
   Datenbank. Jede Seite holt sich hier den Stand und schreibt hier
   zurück. Damit sehen iPad und Büro-PC dasselbe: was in der Werkstatt
   entnommen wird, steht eine Sekunde später auch im Büro auf dem Schirm.

   Ablauf auf jeder Seite:
       await LotStamm.start();      // holt den Stand, einmal beim Öffnen
       LotStamm.ladeArtikel()       // ab dann synchron aus dem Speicher
       await LotStamm.artikelSichern({...})

   Jeder schreibende Aufruf am Server gibt den frischen Gesamtstand
   zurück; der wandert sofort in den Zwischenspeicher. So kann eine
   Seite nicht mit veralteten Zahlen weiterarbeiten.

   Ohne Netz: der zuletzt geholte Stand wird angezeigt (verbindung.js
   hebt ihn auf), Buchungen wandern in die Warteschlange. Artikel und
   Lieferanten ändern geht ohne Netz nicht — dabei müsste man raten,
   wer zuerst war.
   ========================================================================= */
(function (global) {
  "use strict";

  /* Gängige Einheiten für die Auswahl beim Erfassen */
  var EINHEITEN = ['Stk', 'Paar', 'Pack', 'Gebinde', 'Roll', 'm', 'm²', 'kg', 'l'];

  var speicher = {
    artikel: [],
    lieferanten: [],
    bestellungen: {},
    protokoll: [],
    frisch: false,     /* false = aus dem Zwischenspeicher, ohne Netz geholt */
    geladen: false
  };

  var horcher = [];

  /* Der Server nennt den Bestand "bestand", die Seiten kennen ihn als
     "ist". Beides mitführen, damit keine Seite umgeschrieben werden muss. */
  function artikelAufbereiten(a) {
    return {
      code: a.code,
      name: a.name,
      einheit: a.einheit || 'Stk',
      lieferant: a.lieferant || '',
      ort: a.ort || '',
      bestand: typeof a.bestand === 'number' ? a.bestand : 0,
      ist: typeof a.bestand === 'number' ? a.bestand : 0,
      etikett_am: a.etikett_am || null
    };
  }

  /* Nimmt die Antwort eines Endpunkts als neuen Stand */
  function uebernehmen(d) {
    if (!d) return speicher;
    if (Array.isArray(d.artikel))      speicher.artikel = d.artikel.map(artikelAufbereiten);
    if (Array.isArray(d.lieferanten))  speicher.lieferanten = d.lieferanten;
    if (d.bestellungen)                speicher.bestellungen = d.bestellungen;
    if (Array.isArray(d.protokoll))    speicher.protokoll = d.protokoll;
    if (typeof d.frisch === 'boolean') speicher.frisch = d.frisch;
    speicher.geladen = true;
    for (var i = 0; i < horcher.length; i++) {
      try { horcher[i](speicher); } catch (e) { /* eine kaputte Seite bremst die andern nicht */ }
    }
    return speicher;
  }

  /* Beim Öffnen einer Seite einmal aufrufen. Wer nicht angemeldet ist,
     landet auf der Anmeldung — ohne Sitzung gibt der Server nichts her. */
  async function start() {
    if (!global.LotVerbindung || !global.LotVerbindung.angemeldet()) {
      global.location.href = 'login.html';
      throw new Error('Nicht angemeldet.');
    }
    var d = await global.LotVerbindung.stand();
    return uebernehmen(d);
  }

  function verlangeNetz() {
    if (!global.navigator.onLine) {
      var f = new Error('Ohne Netz lässt sich das nicht ändern — ' +
                        'sonst weiss nachher niemand, welcher Stand gilt.');
      f.ohneNetz = true;
      throw f;
    }
  }

  global.LotStamm = {
    EINHEITEN: EINHEITEN,

    start: start,
    uebernehmen: uebernehmen,

    /* Wird bei jedem neuen Stand gerufen — für Seiten, die sich selbst
       auffrischen wollen */
    beiAenderung: function (fn) { horcher.push(fn); },

    ladeArtikel:     function () { return speicher.artikel; },
    ladeLieferanten: function () { return speicher.lieferanten; },
    bestellungen:    function () { return speicher.bestellungen; },
    protokoll:       function () { return speicher.protokoll; },
    istFrisch:       function () { return speicher.frisch; },

    artikel: function (code) {
      for (var i = 0; i < speicher.artikel.length; i++) {
        if (speicher.artikel[i].code === code) return speicher.artikel[i];
      }
      return null;
    },

    /* Nur Namen, alphabetisch — für Auswahllisten */
    lieferantenNamen: function () {
      return speicher.lieferanten
        .map(function (l) { return l.name; })
        .sort(function (a, b) { return a.localeCompare(b, 'de'); });
    },

    /* ---------- Schreiben ---------- */

    /* alt = bisherige Artikelnummer, wenn sie geändert wurde */
    artikelSichern: async function (a) {
      verlangeNetz();
      return uebernehmen(await global.LotVerbindung.ruf('/api/artikel', {
        code: a.code, alt: a.alt || null, name: a.name,
        einheit: a.einheit, lieferant: a.lieferant, ort: a.ort,
        bestand: a.ist
      }));
    },

    artikelWeg: async function (code) {
      verlangeNetz();
      return uebernehmen(await global.LotVerbindung.ruf('/api/artikel/weg', { code: code }));
    },

    lieferantSichern: async function (l) {
      verlangeNetz();
      return uebernehmen(await global.LotVerbindung.ruf('/api/lieferant', l));
    },

    lieferantWeg: async function (id) {
      verlangeNetz();
      return uebernehmen(await global.LotVerbindung.ruf('/api/lieferant/weg', { id: id }));
    },

    /* ---------- Lager ---------- */

    /* art: 'Entnahme' | 'Zugang' | 'Wareneingang'.
       Geht auch ohne Netz — die Buchung wartet dann und wird
       nachgereicht, ohne doppelt zu zählen. */
    buchen: async function (code, art, menge) {
      var r = await global.LotVerbindung.buchen(code, art, menge);
      if (r.stand) uebernehmen(r.stand);
      return r;
    },

    /* an = true: auf die Bestellliste, false: wieder runter */
    melden: async function (code, an, menge) {
      verlangeNetz();
      return uebernehmen(await global.LotVerbindung.ruf('/api/melden', {
        code: code, an: !!an, menge: menge || 0
      }));
    },

    /* Büro vermerkt: Bestellung ist raus (oder wieder zurückgenommen) */
    bestellt: async function (codes, zurueck) {
      verlangeNetz();
      return uebernehmen(await global.LotVerbindung.ruf('/api/bestellt', {
        codes: codes, zurueck: !!zurueck
      }));
    },

    /* Menge einer offenen Bestellposition ändern */
    menge: async function (code, menge) {
      verlangeNetz();
      await global.LotVerbindung.ruf('/api/menge', { code: code, menge: menge });
      var b = speicher.bestellungen[code];
      if (b) b.menge = menge;
      return speicher;
    },

    /* Etikettendruck vermerken oder den Vermerk aufheben */
    etikett: async function (codes, aufheben) {
      verlangeNetz();
      return uebernehmen(await global.LotVerbindung.ruf('/api/etikett', {
        codes: codes, aufheben: !!aufheben
      }));
    }
  };
})(window);
