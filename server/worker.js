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
          "INSERT INTO benutzer (name, hash, salz, rolle) VALUES (?, ?, ?, 'buero')"
        ).bind(name, hash, salz).run();
        return raus({ ok: true, benutzer: name });
      }

      /* ---------- Ab hier braucht es eine Sitzung ---------- */
      const ich = await werIstDas(db, anfrage);
      if (!ich) return nein('Nicht angemeldet.', 401);

      if (pfad === '/api/abmelden' && anfrage.method === 'POST') {
        await db.prepare('DELETE FROM sitzungen WHERE token = ?').bind(ich.token).run();
        return raus({ ok: true });
      }

      /* Weitere Benutzer anlegen — nur aus dem Büro heraus */
      if (pfad === '/api/benutzer' && anfrage.method === 'POST') {
        if (ich.rolle !== 'buero') return nein('Dafür fehlt die Berechtigung.', 403);
        const { benutzer, passwort, rolle } = await anfrage.json();
        const name = String(benutzer || '').trim().toLowerCase();
        if (name.length < 3) return nein('Der Benutzername braucht mindestens drei Zeichen.', 400);
        if (String(passwort || '').length < 8) {
          return nein('Das Passwort braucht mindestens acht Zeichen.', 400);
        }
        const salz = zufallHex(16);
        const hash = await hashe(String(passwort), salz);
        try {
          await db.prepare(
            'INSERT INTO benutzer (name, hash, salz, rolle) VALUES (?, ?, ?, ?)'
          ).bind(name, hash, salz, rolle === 'buero' ? 'buero' : 'werkstatt').run();
        } catch (e) {
          return nein('Den Benutzer ' + name + ' gibt es schon.', 409);
        }
        return raus({ ok: true, benutzer: name });
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

      return nein('Diesen Weg gibt es nicht: ' + pfad, 404);

    } catch (e) {
      /* Fehler nicht verschlucken, aber auch keine Innereien nach aussen geben */
      console.error(e && e.stack ? e.stack : e);
      return antwort({ fehler: 'Da ist etwas schiefgegangen. Bitte nochmal versuchen.' },
                     500, cors);
    }
  }
};
