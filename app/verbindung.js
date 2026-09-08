/* =========================================================================
   Lot — Verbindung zur Datenbank

   Die einzige Stelle, an der die App weiss, wo die Daten liegen. Zieht
   Lot später auf einen eigenen Server um, wird nur diese Datei getauscht;
   die Seiten bleiben, wie sie sind.

   Enthält auch den Zwischenspeicher für den Offline-Fall: Buchungen, die
   ohne Netz entstehen, warten hier und gehen raus, sobald wieder
   Verbindung da ist. Jede Buchung trägt einen eigenen Schlüssel, damit
   ein zweiter Versuch den Bestand nicht doppelt verändert.
   ========================================================================= */
(function (global) {
  "use strict";

  /* Wohin die App spricht. Laesst sich ueberschreiben — fuer Tests und
     spaeter fuer den Umzug auf einen eigenen Server, ohne die Datei
     anzufassen:  localStorage.setItem('lot.api', 'https://…')  */
  var STANDARD_ADRESSE = 'https://lot-api.ricarsanches16.workers.dev';
  var ADRESSE = (function () {
    try {
      var eigen = global.localStorage.getItem('lot.api');
      if (eigen) return JSON.parse(eigen);
    } catch (e) { /* nicht gesetzt oder Speicher gesperrt */ }
    /* Kommt die Seite aus dem eigenen Netz, redet sie mit dem Testserver
       daneben — auf demselben Rechner, nur anderer Port. So laesst sich
       alles ansehen, auch vom Handy im gleichen WLAN, ohne dass etwas
       online geht oder die echten Daten beruehrt werden. */
    var l = global.location || {};
    var h = l.hostname || '';
    /* Ueber Tailscale liegt die Datenbank auf einem eigenen Port */
    if (/\.ts\.net$/.test(h)) return 'https://' + h + ':8443';
    var lokal = h === '127.0.0.1' || h === 'localhost' ||
                /^192\.168\./.test(h) || /^10\./.test(h) ||
                /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
                /^100\./.test(h);          /* Tailscale */
    if (lokal) return l.protocol + '//' + h + ':8787';
    return STANDARD_ADRESSE;
  })();
  var TOKEN_KEY = 'lot.token';
  var WARTEND_KEY = 'lot.wartend';
  var STAND_KEY = 'lot.stand';

  /* ---------- kleiner Speicher, der auch scheitern darf ---------- */
  function lies(schluessel, standard) {
    try {
      var roh = global.localStorage.getItem(schluessel);
      return roh ? JSON.parse(roh) : standard;
    } catch (e) { return standard; }
  }
  function schreib(schluessel, wert) {
    try { global.localStorage.setItem(schluessel, JSON.stringify(wert)); return true; }
    catch (e) { return false; }
  }
  function loesche(schluessel) {
    try { global.localStorage.removeItem(schluessel); } catch (e) { /* egal */ }
  }

  /* ---------- Anmeldung ---------- */
  function token() { return lies(TOKEN_KEY, null); }
  function angemeldet() { return !!token(); }

  /* ---------- Anfragen ---------- */
  async function ruf(pfad, daten, optionen) {
    optionen = optionen || {};
    var kopf = { 'Content-Type': 'application/json' };
    var t = token();
    if (t && !optionen.ohneAnmeldung) kopf['Authorization'] = 'Bearer ' + t;

    var antwort;
    try {
      antwort = await fetch(ADRESSE + pfad, {
        method: daten === undefined ? 'GET' : 'POST',
        headers: kopf,
        body: daten === undefined ? undefined : JSON.stringify(daten)
      });
    } catch (e) {
      var fehlerOhneNetz = new Error('Keine Verbindung zum Server.');
      fehlerOhneNetz.ohneNetz = true;
      throw fehlerOhneNetz;
    }

    var inhalt = null;
    try { inhalt = await antwort.json(); } catch (e) { inhalt = null; }

    /* Beim Anmelden heisst 401 "Passwort falsch", sonst "Sitzung abgelaufen" */
    if (antwort.status === 401) {
      if (optionen.ohneAnmeldung) {
        throw new Error((inhalt && inhalt.fehler) || 'Benutzername oder Passwort stimmt nicht.');
      }
      loesche(TOKEN_KEY);
      var abgelaufen = new Error('Die Anmeldung ist abgelaufen. Bitte neu anmelden.');
      abgelaufen.nichtAngemeldet = true;
      throw abgelaufen;
    }
    if (!antwort.ok) {
      throw new Error((inhalt && inhalt.fehler) || 'Der Server hat abgelehnt.');
    }
    return inhalt;
  }

  async function anmelden(benutzer, passwort) {
    var d = await ruf('/api/anmelden', { benutzer: benutzer, passwort: passwort },
                      { ohneAnmeldung: true });
    schreib(TOKEN_KEY, d.token);
    schreib('lot.ich', { name: d.benutzer, rolle: d.rolle });
    return d;
  }

  async function abmelden() {
    try { await ruf('/api/abmelden', {}); } catch (e) { /* auch offline abmelden */ }
    loesche(TOKEN_KEY);
    loesche('lot.ich');
    loesche(STAND_KEY);
  }

  function ich() { return lies('lot.ich', null); }

  /* ---------- Stand holen, mit letztem bekannten Stand als Rückfall ---------- */
  async function stand() {
    try {
      var d = await ruf('/api/stand');
      schreib(STAND_KEY, d);
      d.frisch = true;
      return d;
    } catch (e) {
      if (e.ohneNetz) {
        var alt = lies(STAND_KEY, null);
        if (alt) { alt.frisch = false; return alt; }
      }
      throw e;
    }
  }

  /* ---------- Zwischenspeicher für Buchungen ohne Netz ---------- */
  function schluessel() {
    var a = new Uint8Array(12);
    (global.crypto || {}).getRandomValues
      ? global.crypto.getRandomValues(a)
      : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    return [].map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function wartend() { return lies(WARTEND_KEY, []); }
  function anzahlWartend() { return wartend().length; }

  function merkeVor(buchung) {
    var liste = wartend();
    liste.push(buchung);
    schreib(WARTEND_KEY, liste);
  }

  /* Eine Buchung: geht sie durch, gut. Geht sie nicht, wartet sie. */
  async function buchen(code, art, menge) {
    var buchung = {
      code: code, art: art, menge: menge,
      schluessel: schluessel(),
      quelle: 'geraet',
      zeit: new Date().toISOString()
    };
    try {
      var d = await ruf('/api/buchen', { buchungen: [buchung] });
      var e = (d.ergebnisse || [])[0];
      if (e && !e.ok) return { ok: false, grund: e.grund };
      schreib(STAND_KEY, d);
      return { ok: true, bestand: e && e.bestand, leer: e && e.leer, stand: d };
    } catch (fehler) {
      if (fehler.ohneNetz) {
        merkeVor(buchung);
        return { ok: true, gewartet: true, wartend: anzahlWartend() };
      }
      throw fehler;
    }
  }

  /* Alles Wartende nachreichen. Wird beim Start und bei Netzrückkehr versucht. */
  async function nachreichen() {
    var liste = wartend();
    if (!liste.length) return { nachgereicht: 0 };
    try {
      var d = await ruf('/api/buchen', { buchungen: liste });
      /* Nur das entfernen, was der Server angenommen hat */
      var erledigt = {};
      (d.ergebnisse || []).forEach(function (e) {
        if (e.ok) erledigt[e.schluessel] = true;
      });
      var rest = liste.filter(function (b) { return !erledigt[b.schluessel]; });
      schreib(WARTEND_KEY, rest);
      schreib(STAND_KEY, d);
      return {
        nachgereicht: liste.length - rest.length,
        abgelehnt: rest.length,
        ergebnisse: d.ergebnisse,
        stand: d
      };
    } catch (e) {
      if (e.ohneNetz) return { nachgereicht: 0, ohneNetz: true };
      throw e;
    }
  }

  /* ---------- Sobald das Netz zurück ist, von selbst nachreichen ---------- */
  var beiNachreichung = [];
  function wennNachgereicht(fn) { beiNachreichung.push(fn); }

  async function versuchNachzureichen() {
    if (!angemeldet() || !anzahlWartend()) return;
    try {
      var r = await nachreichen();
      if (r.nachgereicht) beiNachreichung.forEach(function (fn) { fn(r); });
    } catch (e) { /* beim nächsten Mal wieder */ }
  }

  global.addEventListener('online', versuchNachzureichen);
  setInterval(versuchNachzureichen, 60000);

  global.LotVerbindung = {
    adresse: function () { return ADRESSE; },
    ruf: ruf,
    anmelden: anmelden,
    abmelden: abmelden,
    angemeldet: angemeldet,
    ich: ich,
    stand: stand,
    buchen: buchen,
    nachreichen: nachreichen,
    anzahlWartend: anzahlWartend,
    wennNachgereicht: wennNachgereicht,
    versuchNachzureichen: versuchNachzureichen
  };
})(window);
