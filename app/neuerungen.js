/* =========================================================================
   Lot — Neuerungen
   -------------------------------------------------------------------------
   Damit niemand erklaeren muss, was sich geaendert hat: nach einem Update
   erscheint beim ersten Oeffnen ein Kasten mit dem, was neu ist. Einmal
   gelesen, kommt er nicht wieder. Ueber den Knopf "Neuigkeiten" oben
   kann man jederzeit nachschauen.

   Beim naechsten Update NUR das hier tun: oben in NEUERUNGEN einen neuen
   Block einfuegen. Alles andere macht die Datei von selbst — auch die
   Versionsnummer unten in der Fusszeile.

   Ein Punkt gilt fuer alle. Steht "nur: ['admin']" dabei, sieht ihn nur
   der Administrator — die Werkstatt soll nicht mit Dingen zugeschuettet
   werden, die sie nichts angehen.

   Gemerkt wird geraetweise (localStorage). Das iPad in der Werkstatt und
   der PC im Buero zaehlen getrennt — was richtig ist, denn geschaut wird
   auch an beiden Orten getrennt.
   ========================================================================= */
(function (global) {
  'use strict';

  /* ---------- Was ist neu — Neuestes zuoberst ---------- */
  var NEUERUNGEN = [
    {
      version: '0.1.1',
      datum: '08.09.2026',
      titel: 'Rückmeldungen und Zugänge',
      einleitung: 'Ab jetzt kann jeder melden, was in der Werkstatt stört — ' +
                  'und es gibt geregelte Zugänge.',
      punkte: [
        { text: 'Neuer Reiter <b>Rückmeldung</b>: Was fehlt oder stört, schreibst du ' +
                'direkt in der App auf. Kein Zettel, kein Zuruf zwischen Tür und Angel.' },
        { text: 'Du siehst bei deiner Meldung, wie weit sie ist — und die Bemerkung dazu, ' +
                'sobald jemand geantwortet hat.' },
        { text: 'Beim Anmelden gibt es jetzt einen Knopf <b>Zeigen</b> beim Passwort. ' +
                'Mit Staub an den Fingern tippt man sich sonst wund.' },
        { text: 'Neue Seite <b>Zugänge</b>: Leute anlegen, Rollen vergeben, Passwörter ' +
                'zurücksetzen.', nur: ['admin'] },
        { text: 'Drei Rollen — Administrator, Büro, Werkstatt. Das Büro führt den Betrieb, ' +
                'verwaltet aber keine Zugänge mehr.', nur: ['admin'] },
        { text: 'Wird ein Passwort zurückgesetzt, fliegen alle offenen Anmeldungen dieses ' +
                'Zugangs raus.', nur: ['admin'] }
      ]
    },
    {
      version: '0.1.0',
      datum: '27.08.2026',
      titel: 'Der Anfang',
      einleitung: 'Lot läuft. Lager, Scannen, Bestellen und Etiketten stehen.',
      punkte: [
        { text: '<b>Scannen</b> mit dem Handscanner am iPad. Erst scannen, dann entscheiden: ' +
                'entnehmen, einlagern oder melden, dass es bestellt werden muss.' },
        { text: 'Ein Ton sagt dir, ob der Scan gesessen hat — aufs Display schaut beim ' +
                'Scannen ohnehin niemand.' },
        { text: '<b>Bestellliste</b> fürs Büro, nach Lieferant sortiert. Was Bestand null ' +
                'hat, meldet sich von selbst.' },
        { text: '<b>Etiketten</b> mit QR-Code, Lagerort, Bezeichnung und Lieferant — ' +
                'als Word-Datei zum Ausdrucken auf Bogen.' }
      ]
    }
  ];

  /* ---------- Was das Geraet sich merkt ---------- */
  var SCHLUESSEL = 'lot.neuerungen.gesehen';

  function lies(k) {
    try { return global.localStorage.getItem(k); } catch (e) { return null; }
  }
  function schreib(k, v) {
    try { global.localStorage.setItem(k, v); } catch (e) { /* privates Fenster */ }
  }

  /* Welche Rolle hat der Angemeldete? Kommt aus verbindung.js. Seiten ohne
     Anmeldung wissen es nicht — dort zeigen wir nur, was alle angeht. */
  function rolle() {
    try {
      var roh = global.localStorage.getItem('lot.ich');
      return roh ? (JSON.parse(roh).rolle || '') : '';
    } catch (e) { return ''; }
  }

  function gilt(punkt, wer) {
    if (!punkt.nur) return true;
    return punkt.nur.indexOf(wer) !== -1;
  }

  /* Ein Block, der fuer diese Rolle keinen einzigen Punkt uebrig laesst,
     wird gar nicht erst angezeigt. */
  function fuerRolle(wer) {
    var raus = [];
    for (var i = 0; i < NEUERUNGEN.length; i++) {
      var b = NEUERUNGEN[i];
      var p = b.punkte.filter(function (x) { return gilt(x, wer); });
      if (p.length) raus.push({ version: b.version, datum: b.datum, titel: b.titel,
                                einleitung: b.einleitung, punkte: p });
    }
    return raus;
  }

  function neueste() { return NEUERUNGEN.length ? NEUERUNGEN[0].version : ''; }

  /* ---------- Aussehen ---------- */
  var CSS =
  '.lot-neu-hinter{position:fixed; inset:0; z-index:900; display:flex;' +
  ' align-items:center; justify-content:center; padding:20px;' +
  ' background:rgba(0,0,0,.55); overflow-y:auto}' +

  '.lot-neu{background:var(--bg-surface); color:var(--text-base);' +
  ' border:1px solid var(--border-base); border-radius:var(--r-lg);' +
  ' width:100%; max-width:560px; max-height:calc(100vh - 40px);' +
  ' display:flex; flex-direction:column; box-shadow:0 18px 48px rgba(0,0,0,.35)}' +

  '.lot-neu-kopf{padding:20px 22px 16px; border-bottom:1px solid var(--border-subtle)}' +
  '.lot-neu-marke{font:500 12px/1 var(--f-mono,monospace); letter-spacing:.1em;' +
  ' text-transform:uppercase; color:var(--brand-text); margin:0 0 8px}' +
  '.lot-neu-kopf h2{font:600 22px/1.25 var(--f-display,sans-serif);' +
  ' color:var(--text-strong); margin:0; text-wrap:balance}' +
  '.lot-neu-kopf p{margin:8px 0 0; font-size:15px; line-height:1.5; color:var(--text-muted)}' +

  '.lot-neu-koerper{padding:6px 22px 20px; overflow-y:auto}' +

  '.lot-neu-block{padding-top:18px}' +
  '.lot-neu-block + .lot-neu-block{margin-top:6px; border-top:1px solid var(--border-subtle)}' +
  '.lot-neu-zeile{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:4px}' +
  '.lot-neu-vers{font:600 13px/1 var(--f-mono,monospace); font-variant-numeric:tabular-nums;' +
  ' color:var(--text-on-brand); background:var(--brand); border-radius:var(--r-pill);' +
  ' padding:5px 10px}' +
  '.lot-neu-datum{font:400 13px/1 var(--f-mono,monospace); color:var(--text-faint);' +
  ' font-variant-numeric:tabular-nums}' +
  '.lot-neu-block h3{font:600 16px/1.3 var(--f-display,sans-serif);' +
  ' color:var(--text-strong); margin:10px 0 0}' +
  '.lot-neu-block > p{margin:6px 0 0; font-size:14px; line-height:1.55; color:var(--text-muted)}' +

  '.lot-neu-liste{list-style:none; margin:12px 0 0; padding:0;' +
  ' display:flex; flex-direction:column; gap:11px}' +
  '.lot-neu-liste li{position:relative; padding-left:20px; font-size:15px; line-height:1.55}' +
  '.lot-neu-liste li::before{content:""; position:absolute; left:0; top:.62em;' +
  ' width:7px; height:7px; border-radius:2px; background:var(--brand)}' +
  '.lot-neu-liste b{color:var(--text-strong); font-weight:600}' +
  '.lot-neu-nur{display:inline-block; margin-left:6px; padding:2px 7px; border-radius:var(--r-sm);' +
  ' font:500 11px/1.5 var(--f-mono,monospace); letter-spacing:.06em; text-transform:uppercase;' +
  ' color:var(--info-text); background:var(--info-bg); border:1px solid var(--info-bd);' +
  ' vertical-align:1px}' +

  '.lot-neu-fuss{padding:16px 22px; border-top:1px solid var(--border-subtle);' +
  ' display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap}' +
  '.lot-neu-hinweis{font-size:13px; color:var(--text-faint)}' +
  '.lot-neu-zu{min-height:var(--touch-comfort,56px); padding:0 26px; border:0;' +
  ' border-radius:var(--r-md); background:var(--brand); color:var(--text-on-brand);' +
  ' font:600 16px/1 var(--f-body,sans-serif); cursor:pointer}' +
  '.lot-neu-zu:hover{background:var(--brand-hover)}' +
  '.lot-neu-zu:focus-visible{outline:3px solid var(--brand-text); outline-offset:2px}' +

  /* Der Knopf in der Kopfzeile. Solange etwas ungelesen ist, leuchtet er
     orange - man soll ihn sehen, ohne ihn zu suchen. Ist alles gelesen,
     wird er still wie die uebrigen Knoepfe. */
  '#lotNeuKnopf{position:relative; display:inline-flex; align-items:center; gap:7px}' +
  '#lotNeuKnopf.frisch{background:var(--brand); border-color:var(--brand);' +
  ' color:var(--text-on-brand); font-weight:600}' +
  '#lotNeuKnopf.frisch:hover{background:var(--brand-hover); border-color:var(--brand-hover)}' +
  '#lotNeuKnopf .lot-neu-punkt{display:inline-block; width:8px; height:8px;' +
  ' border-radius:50%; background:var(--text-on-brand)}' +
  '@media (prefers-reduced-motion:no-preference){' +
  ' #lotNeuKnopf.frisch .lot-neu-punkt{animation:lotNeuPuls 2.2s ease-in-out infinite}' +
  ' @keyframes lotNeuPuls{0%,100%{opacity:1}50%{opacity:.35}}}' +

  '@media (max-width:520px){' +
  ' .lot-neu-hinter{padding:0; align-items:stretch}' +
  ' .lot-neu{max-width:none; max-height:100vh; border:0; border-radius:0}' +
  ' .lot-neu-zu{width:100%}' +
  ' .lot-neu-fuss{flex-direction:column-reverse; align-items:stretch}}' +

  '@media (prefers-reduced-motion:no-preference){' +
  ' .lot-neu{animation:lotNeuRein .18s ease-out}' +
  ' @keyframes lotNeuRein{from{opacity:0; transform:translateY(8px)}' +
  ' to{opacity:1; transform:none}}}';

  function stilEinhaengen() {
    if (global.document.getElementById('lotNeuStil')) return;
    var s = global.document.createElement('style');
    s.id = 'lotNeuStil';
    s.textContent = CSS;
    global.document.head.appendChild(s);
  }

  /* ---------- Der Kasten ---------- */
  var offen = null;

  function schliessen() {
    if (!offen) return;
    offen.parentNode.removeChild(offen);
    offen = null;
    global.document.removeEventListener('keydown', aufTaste, true);
    merkeGelesen();
    knopfAuffrischen();
  }

  function aufTaste(e) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();   /* damit der Scanner-Empfang nichts abbekommt */
      schliessen();
    }
  }

  function merkeGelesen() { schreib(SCHLUESSEL, neueste()); }

  function zeige(alles) {
    if (offen) return;
    stilEinhaengen();
    var wer = rolle();
    var bloecke = fuerRolle(wer);
    if (!bloecke.length) return;
    if (!alles) bloecke = bloecke.slice(0, 1);

    var d = global.document;
    var hinter = d.createElement('div');
    hinter.className = 'lot-neu-hinter';
    hinter.setAttribute('role', 'dialog');
    hinter.setAttribute('aria-modal', 'true');
    hinter.setAttribute('aria-labelledby', 'lotNeuTitel');

    var html =
      '<div class="lot-neu">' +
        '<div class="lot-neu-kopf">' +
          '<p class="lot-neu-marke">' + (alles ? 'Alle Neuerungen' : 'Neu in Lot') + '</p>' +
          '<h2 id="lotNeuTitel">' + (alles ? 'Was sich bisher geändert hat'
                                           : bloecke[0].titel) + '</h2>' +
          (alles ? '' : '<p>' + bloecke[0].einleitung + '</p>') +
        '</div>' +
        '<div class="lot-neu-koerper">';

    for (var i = 0; i < bloecke.length; i++) {
      var b = bloecke[i];
      html += '<div class="lot-neu-block">' +
                '<div class="lot-neu-zeile">' +
                  '<span class="lot-neu-vers">' + b.version + '</span>' +
                  '<span class="lot-neu-datum">' + b.datum + '</span>' +
                '</div>' +
                (alles ? '<h3>' + b.titel + '</h3><p>' + b.einleitung + '</p>' : '') +
                '<ul class="lot-neu-liste">';
      for (var j = 0; j < b.punkte.length; j++) {
        var p = b.punkte[j];
        html += '<li>' + p.text +
                (p.nur && wer === 'admin'
                  ? '<span class="lot-neu-nur">nur du</span>' : '') +
                '</li>';
      }
      html += '</ul></div>';
    }

    html +=
        '</div>' +
        '<div class="lot-neu-fuss">' +
          '<span class="lot-neu-hinweis">Später wieder über „Neuigkeiten" oben.</span>' +
          '<button type="button" class="lot-neu-zu">Verstanden</button>' +
        '</div>' +
      '</div>';

    hinter.innerHTML = html;
    hinter.addEventListener('click', function (e) {
      if (e.target === hinter || e.target.className === 'lot-neu-zu') schliessen();
    });
    d.body.appendChild(hinter);
    offen = hinter;
    d.addEventListener('keydown', aufTaste, true);
    var zu = hinter.querySelector('.lot-neu-zu');
    if (zu) zu.focus();
  }

  /* ---------- Knopf in der Kopfzeile ---------- */
  function ungelesen() { return lies(SCHLUESSEL) !== neueste(); }

  function knopfAuffrischen() {
    var k = global.document.getElementById('lotNeuKnopf');
    if (!k) return;
    var punkt = k.querySelector('.lot-neu-punkt');
    if (ungelesen()) {
      if (!punkt) {
        punkt = global.document.createElement('span');
        punkt.className = 'lot-neu-punkt';
        punkt.setAttribute('aria-hidden', 'true');
        k.insertBefore(punkt, k.firstChild);
      }
      k.classList.add('frisch');
      k.setAttribute('aria-label', 'Neuigkeiten — es gibt Ungelesenes');
    } else {
      if (punkt) k.removeChild(punkt);
      k.classList.remove('frisch');
      k.setAttribute('aria-label', 'Neuigkeiten');
    }
  }

  function knopfSetzen() {
    var d = global.document;
    if (d.getElementById('lotNeuKnopf')) return;
    var leiste = d.querySelector('.topbar');
    if (!leiste) return;

    var k = d.createElement('button');
    k.type = 'button';
    k.id = 'lotNeuKnopf';
    k.className = 'ghost';
    k.appendChild(d.createTextNode('Neuigkeiten'));
    k.addEventListener('click', function () { zeige(true); });

    /* Ganz nach vorn, gleich hinter Logo und Name — dort schaut man zuerst
       hin. Weiter hinten zwischen den uebrigen Knoepfen geht er unter. */
    var marke = leiste.querySelector('.who') || leiste.querySelector('.brand');
    if (marke && marke.parentNode === leiste && marke.nextSibling) {
      leiste.insertBefore(k, marke.nextSibling);
    } else if (marke && marke.parentNode === leiste) {
      leiste.appendChild(k);
    } else {
      leiste.insertBefore(k, leiste.firstChild);
    }
    knopfAuffrischen();
  }

  /* ---------- Versionsnummer in der Fusszeile ---------- */
  function versionStempeln() {
    var alle = global.document.querySelectorAll('.foot span, footer span');
    for (var i = 0; i < alle.length; i++) {
      if (/^\s*Lot\s+\d+\.\d+\.\d+\s*$/.test(alle[i].textContent)) {
        alle[i].textContent = 'Lot ' + neueste();
      }
    }
  }

  function start() {
    stilEinhaengen();
    knopfSetzen();
    versionStempeln();
    /* Nach einem Update einmal von selbst aufgehen — aber nicht auf der
       Anmeldeseite, dort will man sich anmelden und sonst nichts. */
    var aufAnmeldung = /login\.html|einrichten\.html/.test(global.location.pathname);
    if (ungelesen() && !aufAnmeldung) zeige(false);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  global.LotNeuerungen = {
    version: neueste,
    zeige: function () { zeige(true); },
    ungelesen: ungelesen,
    alle: function () { return NEUERUNGEN; }
  };
})(window);
