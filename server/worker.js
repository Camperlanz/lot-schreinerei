/* =========================================================================
   Lot — Schnittstelle zwischen den Seiten und der Datenbank

   Läuft als Cloudflare Worker, spricht mit D1 (SQLite).
   Alle Antworten sind JSON. Ohne gültige Sitzung geht nichts ausser
   der Anmeldung selbst.

   Aufbau:
     POST /api/anmelden      Benutzer und Passwort rein, Token raus
     POST /api/abmelden
     GET  /api/stand         alles, was die App zum Start braucht
     POST /api/buchen        Entnahme, Zugang, Wareneingang
     POST /api/melden        auf die Bestellliste, oder runter
     POST /api/bestellt      Büro vermerkt: Bestellung ist raus
     POST /api/artikel       anlegen und ändern
     POST /api/artikel/weg
     POST /api/lieferant     anlegen und ändern
     POST /api/lieferant/weg
     POST /api/etikett       Etikettendruck vermerken oder aufheben
     POST /api/meldung       Rueckmeldung aus der Werkstatt
     GET  /api/meldungen     Liste - Buero alle, Werkstatt die eigenen
     POST /api/meldung/status
     POST /api/meldung/weg
     GET  /api/benutzer      Zugaenge auflisten (nur Administrator)
     POST /api/benutzer      anlegen
     POST /api/benutzer/rolle
     POST /api/benutzer/passwort
     POST /api/benutzer/weg
   ========================================================================= */

const JSON_KOPF = { 'Content-Type': 'application/json; charset=utf-8' };

function antwort(daten, status = 200, extra = {}) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { ...JSON_KOPF, ...extra }
  });
}

function fehler(text, status = 400) {
  return antwort({ fehler: text }, status);
}

/* ---------- Passwörter ----------------------------------------------------
   PBKDF2 mit 100 000 Runden — das ist die Obergrenze, die Cloudflare
   zulaesst. Langsam zu sein ist hier der Zweck: es bremst jeden, der
   Passwoerter durchprobieren will. */
async function hashe(passwort, salzHex) {
  const enc = new TextEncoder();
  const salz = new Uint8Array(salzHex.match(/../g).map((h) => parseInt(h, 16)));
  const schluessel = await crypto.subtle.importKey(
    'raw', enc.encode(passwort), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salz, iterations: 100000, hash: 'SHA-256' },
    schluessel, 256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function zufallHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Zeitkonstanter Vergleich, damit die Antwortzeit nichts verrät */
function gleich(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ---------- Rollen -------------------------------------------------------
   admin      darf alles, auch Zugaenge anlegen und Rollen vergeben
   buero      fuehrt den Betrieb: bestellen, Artikel und Lieferanten pflegen,
              Rueckmeldungen bearbeiten - aber keine Zugaenge verwalten
   werkstatt  bucht, meldet, sieht die eigenen Rueckmeldungen             */
var ROLLEN = ['admin', 'buero', 'werkstatt'];

function istAdmin(ich)      { return ich.rolle === 'admin'; }
function fuehrtBetrieb(ich) { return ich.rolle === 'admin' || ich.rolle === 'buero'; }

/* ---------- Sitzungen ---------------------------------------------------- */
async function werIstDas(db, anfrage) {
  const kopf = anfrage.headers.get('Authorization') || '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  if (!token) return null;

  const zeile = await db.prepare(
    `SELECT s.benutzer, s.bis, b.rolle
       FROM sitzungen s JOIN benutzer b ON b.name = s.benutzer
      WHERE s.token = ?`
  ).bind(token).first();

  if (!zeile) return null;
  if (new Date(zeile.bis) < new Date()) {
    await db.prepare('DELETE FROM sitzungen WHERE token = ?').bind(token).run();
    return null;
  }
  return { name: zeile.benutzer, rolle: zeile.rolle, token };
}

/* ---------- Bestand verändern -------------------------------------------
   Kernstück: prüft, bucht, protokolliert. Ein Schlüssel je Buchung sorgt
   dafür, dass eine nachgereichte Offline-Buchung nicht doppelt zählt. */
async function buche(db, { code, richtung, menge, art, wer, schluessel, quelle }) {
  const artikel = await db.prepare(
    'SELECT code, name, einheit, bestand FROM artikel WHERE code = ?'
  ).bind(code).first();
  if (!artikel) return { ok: false, grund: 'Artikel ' + code + ' ist nicht erfasst.' };

  if (schluessel) {
    const schon = await db.prepare(
      'SELECT schluessel FROM gebucht WHERE schluessel = ?'
    ).bind(schluessel).first();
    if (schon) {
      /* War schon da — freundlich bestätigen, nichts nochmal verändern */
      return { ok: true, doppelt: true, bestand: artikel.bestand, artikel };
    }
  }

  const m = Math.abs(Math.round(menge));
  if (!m) return { ok: false, grund: 'Menge fehlt.' };

  if (richtung < 0 && m > artikel.bestand) {
    return {
      ok: false,
      grund: 'Im Lager stehen nur ' + artikel.bestand + ' ' + artikel.einheit + '.'
    };
  }

  const neu = artikel.bestand + richtung * m;
  const schritte = [
    db.prepare('UPDATE artikel SET bestand = ? WHERE code = ?').bind(neu, code),
    db.prepare(
      'INSERT INTO bewegungen (code, art, menge, danach, wer, quelle) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(code, art, m, neu, wer || '', quelle || '')
  ];
  if (schluessel) {
    schritte.push(db.prepare('INSERT INTO gebucht (schluessel) VALUES (?)').bind(schluessel));
  }
  /* Bestand auf null meldet sich selbst für die Bestellung */
  if (neu <= 0) {
    schritte.push(db.prepare(
      `INSERT INTO bestellungen (code, status, menge, wer)
       VALUES (?, 'gemeldet', 0, ?)
       ON CONFLICT(code) DO NOTHING`
    ).bind(code, wer || ''));
  }
  await db.batch(schritte);

  return { ok: true, bestand: neu, leer: neu <= 0, artikel };
}

/* ---------- Gesamtstand für die App -------------------------------------- */
async function standHolen(db) {
  const [artikel, lieferanten, offen, log] = await Promise.all([
    db.prepare(
      `SELECT a.code, a.name, a.einheit, a.ort, a.bestand, a.etikett_am,
              COALESCE(l.name, '') AS lieferant
         FROM artikel a LEFT JOIN lieferanten l ON l.id = a.lieferant_id
        ORDER BY a.code`
    ).all(),
    db.prepare('SELECT * FROM lieferanten ORDER BY name').all(),
    db.prepare('SELECT code, status, menge, wann FROM bestellungen').all(),
    db.prepare(
      `SELECT b.id, b.code, b.art, b.menge, b.danach, b.wann, b.wer,
              COALESCE(a.name, b.code) AS name,
              COALESCE(a.einheit, '') AS einheit
         FROM bewegungen b LEFT JOIN artikel a ON a.code = b.code
        ORDER BY b.id DESC LIMIT 25`
    ).all()
  ]);

  const bestellungen = {};
  for (const z of offen.results) {
    bestellungen[z.code] = { status: z.status, menge: z.menge, wann: z.wann };
  }

  return {
    artikel: artikel.results,
    lieferanten: lieferanten.results,
    bestellungen,
    protokoll: log.results
  };
}

/* ---------- Anfragen verteilen ------------------------------------------- */
export default {
  async fetch(anfrage, umgebung) {
    const url = new URL(anfrage.url);
    const pfad = url.pathname.replace(/\/+$/, '');
    const db = umgebung.DB;

    /* Der Browser fragt vor jedem Schreibzugriff nach Erlaubnis */
    const cors = {
      'Access-Control-Allow-Origin': umgebung.ERLAUBT || '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    if (anfrage.method === 'OPTIONS') return new Response(null, { headers: cors });

    const raus = (daten, status = 200) => antwort(daten, status, cors);
    const nein = (text, status = 400) => antwort({ fehler: text }, status, cors);

    try {
      /* ---------- Anmelden ---------- */
      if (pfad === '/api/anmelden' && anfrage.method === 'POST') {
        const { benutzer, passwort } = await anfrage.json();
        if (!benutzer || !passwort) return nein('Benutzername und Passwort nötig.', 400);

        const zeile = await db.prepare(
          'SELECT name, hash, salz, rolle FROM benutzer WHERE name = ?'
        ).bind(String(benutzer).trim().toLowerCase()).first();

        /* Auch ohne Treffer rechnen, damit die Antwortzeit gleich bleibt */
        const salz = zeile ? zeile.salz : zufallHex(16);
        const geprueft = await hashe(String(passwort), salz);
        if (!zeile || !gleich(geprueft, zeile.hash)) {
          return nein('Benutzername oder Passwort stimmt nicht.', 401);
        }

        const token = zufallHex(32);
        const bis = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        await db.batch([
          db.prepare('INSERT INTO sitzungen (token, benutzer, bis) VALUES (?, ?, ?)')
            .bind(token, zeile.name, bis),
          db.prepare("DELETE FROM sitzungen WHERE bis < datetime('now')")
        ]);
        return raus({ token, benutzer: zeile.name, rolle: zeile.rolle, bis });
      }

      /* ---------- Ersteinrichtung ----------
         Greift nur, solange es noch keinen Benutzer gibt. Danach ist der
         Weg tot und niemand kann sich hier einen Zugang anlegen. */
      if (pfad === '/api/einrichten' && anfrage.method === 'POST') {
        const schon = await db.prepare('SELECT COUNT(*) AS n FROM benutzer').first();
        if (schon && schon.n > 0) {
          return nein('Es gibt bereits Benutzer — die Einrichtung ist abgeschlossen.', 403);
        }
        const { benutzer, passwort } = await anfrage.json();
        const name = String(benutzer || '').trim().toLowerCase();
        if (name.length < 3) return nein('Der Benutzername braucht mindestens drei Zeichen.', 400);
        if (String(passwort || '').length < 8) {
          return nein('Das Passwort braucht mindestens acht Zeichen.', 400);
        }
        const salz = zufallHex(16);
        const hash = await hashe(String(passwort), salz);
        await db.prepare(
          "INSERT INTO benutzer (name, hash, salz, rolle) VALUES (?, ?, ?, 'admin')"
        ).bind(name, hash, salz).run();
        return raus({ ok: true, benutzer: name, rolle: 'admin' });
      }

      /* ---------- Ab hier braucht es eine Sitzung ---------- */
      const ich = await werIstDas(db, anfrage);
      if (!ich) return nein('Nicht angemeldet.', 401);

      if (pfad === '/api/abmelden' && anfrage.method === 'POST') {
        await db.prepare('DELETE FROM sitzungen WHERE token = ?').bind(ich.token).run();
        return raus({ ok: true });
      }

      /* ---------- Zugaenge verwalten — nur Administrator ---------- */
      async function benutzerListe() {
        const liste = await db.prepare(
          `SELECT b.name, b.rolle, b.angelegt,
                  (SELECT COUNT(*) FROM sitzungen s WHERE s.benutzer = b.name
                     AND s.bis > datetime('now')) AS sitzungen
             FROM benutzer b ORDER BY
               CASE b.rolle WHEN 'admin' THEN 0 WHEN 'buero' THEN 1 ELSE 2 END, b.name`
        ).all();
        return liste.results;
      }

      /* Wie viele Administratoren gibt es ausser diesem einen? */
      async function andereAdmins(ausser) {
        const z = await db.prepare(
          "SELECT COUNT(*) AS n FROM benutzer WHERE rolle = 'admin' AND name <> ?"
        ).bind(ausser).first();
        return z ? z.n : 0;
      }

      if (pfad === '/api/benutzer' && anfrage.method === 'GET') {
        if (!istAdmin(ich)) return nein('Zugänge verwaltet nur der Administrator.', 403);
        return raus({ benutzer: await benutzerListe(), ich: { name: ich.name, rolle: ich.rolle } });
      }

      if (pfad === '/api/benutzer' && anfrage.method === 'POST') {
        if (!istAdmin(ich)) return nein('Zugänge legt nur der Administrator an.', 403);
        const { benutzer, passwort, rolle } = await anfrage.json();
        const name = String(benutzer || '').trim().toLowerCase();
        if (name.length < 3) return nein('Der Benutzername braucht mindestens drei Zeichen.', 400);
        if (!/^[a-z0-9._-]+$/.test(name)) {
          return nein('Erlaubt sind Kleinbuchstaben, Zahlen, Punkt, Strich und Unterstrich.', 400);
        }
        if (String(passwort || '').length < 8) {
          return nein('Das Passwort braucht mindestens acht Zeichen.', 400);
        }
        if (ROLLEN.indexOf(rolle) === -1) return nein('Unbekannte Rolle.', 400);
        const salz = zufallHex(16);
        const hash = await hashe(String(passwort), salz);
        try {
          await db.prepare(
            'INSERT INTO benutzer (name, hash, salz, rolle) VALUES (?, ?, ?, ?)'
          ).bind(name, hash, salz, rolle).run();
        } catch (e) {
          return nein('Den Zugang ' + name + ' gibt es schon.', 409);
        }
        return raus({ ok: true, benutzer: await benutzerListe() });
      }

      if (pfad === '/api/benutzer/rolle' && anfrage.method === 'POST') {
        if (!istAdmin(ich)) return nein('Rollen vergibt nur der Administrator.', 403);
        const { name, rolle } = await anfrage.json();
        if (ROLLEN.indexOf(rolle) === -1) return nein('Unbekannte Rolle.', 400);
        /* Der letzte Administrator darf sich die Rechte nicht selbst nehmen —
           sonst kommt niemand mehr an die Verwaltung. */
        if (name === ich.name && rolle !== 'admin' && (await andereAdmins(ich.name)) === 0) {
          return nein('Du bist der einzige Administrator. Lege erst einen zweiten an.', 409);
        }
        await db.prepare('UPDATE benutzer SET rolle = ? WHERE name = ?').bind(rolle, name).run();
        return raus({ ok: true, benutzer: await benutzerListe() });
      }

      if (pfad === '/api/benutzer/passwort' && anfrage.method === 'POST') {
        const { name, passwort } = await anfrage.json();
        const ziel = String(name || '').trim().toLowerCase();
        /* Jeder darf sein eigenes Passwort setzen, der Administrator jedes. */
        if (!istAdmin(ich) && ziel !== ich.name) {
          return nein('Fremde Passwörter setzt nur der Administrator.', 403);
        }
        if (String(passwort || '').length < 8) {
          return nein('Das Passwort braucht mindestens acht Zeichen.', 400);
        }
        const salz = zufallHex(16);
        const hash = await hashe(String(passwort), salz);
        await db.batch([
          db.prepare('UPDATE benutzer SET hash = ?, salz = ? WHERE name = ?')
            .bind(hash, salz, ziel),
          /* Alle Sitzungen dieses Zugangs beenden — wer das alte Passwort
             hatte, ist damit draussen. */
          db.prepare('DELETE FROM sitzungen WHERE benutzer = ?').bind(ziel)
        ]);
        return raus({ ok: true, abgemeldet: ziel === ich.name });
      }

      if (pfad === '/api/benutzer/weg' && anfrage.method === 'POST') {
        if (!istAdmin(ich)) return nein('Zugänge löscht nur der Administrator.', 403);
        const { name } = await anfrage.json();
        if (name === ich.name) return nein('Den eigenen Zugang kannst du nicht löschen.', 409);
        const z = await db.prepare('SELECT rolle FROM benutzer WHERE name = ?').bind(name).first();
        if (z && z.rolle === 'admin' && (await andereAdmins(name)) === 0) {
          return nein('Das ist der letzte Administrator.', 409);
        }
        await db.batch([
          db.prepare('DELETE FROM sitzungen WHERE benutzer = ?').bind(name),
          db.prepare('DELETE FROM benutzer WHERE name = ?').bind(name)
        ]);
        return raus({ ok: true, benutzer: await benutzerListe() });
      }

      if (pfad === '/api/stand' && anfrage.method === 'GET') {
        const stand = await standHolen(db);
        return raus({ ...stand, ich: { name: ich.name, rolle: ich.rolle } });
      }

      /* ---------- Buchen ---------- */
      if (pfad === '/api/buchen' && anfrage.method === 'POST') {
        const { buchungen } = await anfrage.json();
        if (!Array.isArray(buchungen) || !buchungen.length) {
          return nein('Keine Buchung übergeben.', 400);
        }
        const ergebnisse = [];
        for (const b of buchungen) {
          const richtung = b.art === 'Entnahme' ? -1 : 1;
          const r = await buche(db, {
            code: b.code,
            richtung,
            menge: b.menge,
            art: b.art,
            wer: ich.name,
            schluessel: b.schluessel,
            quelle: b.quelle
          });
          ergebnisse.push({ code: b.code, schluessel: b.schluessel, ...r });
        }
        const stand = await standHolen(db);
        return raus({ ergebnisse, ...stand });
      }

      /* ---------- Auf die Bestellliste, oder runter ---------- */
      if (pfad === '/api/melden' && anfrage.method === 'POST') {
        const { code, an, menge } = await anfrage.json();
        const a = await db.prepare('SELECT code, name FROM artikel WHERE code = ?')
          .bind(code).first();
        if (!a) return nein('Artikel nicht erfasst.', 404);

        if (an) {
          await db.batch([
            db.prepare(
              `INSERT INTO bestellungen (code, status, menge, wer)
               VALUES (?, 'gemeldet', ?, ?)
               ON CONFLICT(code) DO UPDATE SET menge = excluded.menge`
            ).bind(code, Math.max(0, Math.round(menge || 0)), ich.name),
            db.prepare(
              'INSERT INTO bewegungen (code, art, menge, wer) VALUES (?, ?, ?, ?)'
            ).bind(code, 'Gemeldet', Math.max(0, Math.round(menge || 0)), ich.name)
          ]);
        } else {
          await db.batch([
            db.prepare('DELETE FROM bestellungen WHERE code = ?').bind(code),
            db.prepare(
              'INSERT INTO bewegungen (code, art, menge, wer) VALUES (?, ?, 0, ?)'
            ).bind(code, 'Meldung zurück', ich.name)
          ]);
        }
        return raus(await standHolen(db));
      }

      /* ---------- Büro: Bestellung ist raus ---------- */
      if (pfad === '/api/bestellt' && anfrage.method === 'POST') {
        const { codes, zurueck } = await anfrage.json();
        if (!Array.isArray(codes) || !codes.length) return nein('Keine Position übergeben.', 400);
        const schritte = [];
        for (const code of codes) {
          schritte.push(db.prepare(
            `UPDATE bestellungen SET status = ?, wann = datetime('now'), wer = ?
              WHERE code = ?`
          ).bind(zurueck ? 'gemeldet' : 'bestellt', ich.name, code));
          schritte.push(db.prepare(
            'INSERT INTO bewegungen (code, art, menge, wer) VALUES (?, ?, 0, ?)'
          ).bind(code, zurueck ? 'Bestellung zurück' : 'Bestellt', ich.name));
        }
        await db.batch(schritte);
        return raus(await standHolen(db));
      }

      /* ---------- Menge einer offenen Position ändern ---------- */
      if (pfad === '/api/menge' && anfrage.method === 'POST') {
        const { code, menge } = await anfrage.json();
        await db.prepare('UPDATE bestellungen SET menge = ? WHERE code = ?')
          .bind(Math.max(0, Math.round(menge || 0)), code).run();
        return raus({ ok: true });
      }

      /* ---------- Artikel ---------- */
      if (pfad === '/api/artikel' && anfrage.method === 'POST') {
        const { code, alt, name, einheit, lieferant, ort, bestand } = await anfrage.json();
        if (!code || !name) return nein('Artikelnummer und Bezeichnung sind nötig.', 400);

        const lief = lieferant
          ? await db.prepare('SELECT id FROM lieferanten WHERE name = ?').bind(lieferant).first()
          : null;

        if (alt && alt !== code) {
          const doppelt = await db.prepare('SELECT code FROM artikel WHERE code = ?')
            .bind(code).first();
          if (doppelt) return nein('Die Nummer ' + code + ' ist schon vergeben.', 409);
        }

        if (alt) {
          await db.prepare(
            `UPDATE artikel SET code = ?, name = ?, einheit = ?, lieferant_id = ?, ort = ?
              WHERE code = ?`
          ).bind(code, name, einheit || 'Stk', lief ? lief.id : null, ort || '', alt).run();
        } else {
          const schon = await db.prepare('SELECT code FROM artikel WHERE code = ?')
            .bind(code).first();
          if (schon) return nein('Die Nummer ' + code + ' ist schon vergeben.', 409);
          await db.prepare(
            `INSERT INTO artikel (code, name, einheit, lieferant_id, ort, bestand)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(code, name, einheit || 'Stk', lief ? lief.id : null, ort || '',
                 Math.max(0, Math.round(bestand || 0))).run();
        }
        return raus(await standHolen(db));
      }

      if (pfad === '/api/artikel/weg' && anfrage.method === 'POST') {
        const { code } = await anfrage.json();
        await db.prepare('DELETE FROM artikel WHERE code = ?').bind(code).run();
        return raus(await standHolen(db));
      }

      /* ---------- Lieferanten ---------- */
      if (pfad === '/api/lieferant' && anfrage.method === 'POST') {
        const d = await anfrage.json();
        if (!d.name) return nein('Name ist nötig.', 400);
        const id = d.id || zufallHex(8);
        await db.prepare(
          `INSERT INTO lieferanten (id, name, kunde, person, mail, tel, shop, notiz)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, kunde = excluded.kunde, person = excluded.person,
             mail = excluded.mail, tel = excluded.tel, shop = excluded.shop,
             notiz = excluded.notiz`
        ).bind(id, d.name, d.kunde || '', d.person || '', d.mail || '',
               d.tel || '', d.shop || '', d.notiz || '').run();
        return raus(await standHolen(db));
      }

      if (pfad === '/api/lieferant/weg' && anfrage.method === 'POST') {
        const { id } = await anfrage.json();
        await db.prepare('DELETE FROM lieferanten WHERE id = ?').bind(id).run();
        return raus(await standHolen(db));
      }

      /* ---------- Etikettenstand ---------- */
      if (pfad === '/api/etikett' && anfrage.method === 'POST') {
        const { codes, aufheben } = await anfrage.json();
        if (!Array.isArray(codes) || !codes.length) return nein('Keine Artikel übergeben.', 400);
        const heute = new Date().toISOString().slice(0, 10);
        const schritte = codes.map((code) =>
          db.prepare('UPDATE artikel SET etikett_am = ? WHERE code = ?')
            .bind(aufheben ? null : heute, code)
        );
        await db.batch(schritte);
        return raus(await standHolen(db));
      }

      /* ---------- Rückmeldungen ----------
         Schreiben darf jeder Angemeldete. Lesen und bearbeiten nur das Büro;
         wer aus der Werkstatt meldet, sieht seine eigenen Meldungen. */
      if (pfad === '/api/meldung' && anfrage.method === 'POST') {
        const { art, text, seite } = await anfrage.json();
        const inhalt = String(text || '').trim();
        if (inhalt.length < 5) {
          return nein('Schreib bitte etwas mehr — in einem Satz, was fehlt oder stört.', 400);
        }
        if (inhalt.length > 2000) {
          return nein('Das ist zu lang. Fasse es bitte kürzer.', 400);
        }
        const artOk = ['fehler', 'wunsch', 'frage'].indexOf(art) !== -1 ? art : 'wunsch';
        await db.prepare(
          'INSERT INTO meldungen (art, text, seite, wer) VALUES (?, ?, ?, ?)'
        ).bind(artOk, inhalt, String(seite || '').slice(0, 60), ich.name).run();
        return raus({ ok: true });
      }

      if (pfad === '/api/meldungen' && anfrage.method === 'GET') {
        const nurEigene = !fuehrtBetrieb(ich);
        const abfrage = nurEigene
          ? db.prepare('SELECT * FROM meldungen WHERE wer = ? ORDER BY id DESC LIMIT 200').bind(ich.name)
          : db.prepare('SELECT * FROM meldungen ORDER BY id DESC LIMIT 200');
        const liste = await abfrage.all();
        return raus({ meldungen: liste.results, ich: { name: ich.name, rolle: ich.rolle } });
      }

      if (pfad === '/api/meldung/status' && anfrage.method === 'POST') {
        if (!fuehrtBetrieb(ich)) return nein('Das dürfen nur Büro und Administrator.', 403);
        const { id, status, antwort } = await anfrage.json();
        const erlaubt = ['offen', 'angeschaut', 'erledigt', 'zurueckgestellt'];
        if (erlaubt.indexOf(status) === -1) return nein('Unbekannter Stand.', 400);
        await db.prepare(
          `UPDATE meldungen
              SET status = ?, antwort = ?, geaendert = datetime('now')
            WHERE id = ?`
        ).bind(status, String(antwort || '').slice(0, 2000), id).run();
        const liste = await db.prepare('SELECT * FROM meldungen ORDER BY id DESC LIMIT 200').all();
        return raus({ meldungen: liste.results });
      }

      if (pfad === '/api/meldung/weg' && anfrage.method === 'POST') {
        if (!fuehrtBetrieb(ich)) return nein('Das dürfen nur Büro und Administrator.', 403);
        const { id } = await anfrage.json();
        await db.prepare('DELETE FROM meldungen WHERE id = ?').bind(id).run();
        const liste = await db.prepare('SELECT * FROM meldungen ORDER BY id DESC LIMIT 200').all();
        return raus({ meldungen: liste.results });
      }

      return nein('Diesen Weg gibt es nicht: ' + pfad, 404);

    } catch (e) {
      /* Fehler nicht verschlucken, aber auch keine Innereien nach aussen geben */
      console.error(e && e.stack ? e.stack : e);
      return antwort({ fehler: 'Da ist etwas schiefgegangen. Bitte nochmal versuchen.' },
                     500, cors);
    }
  }
};
