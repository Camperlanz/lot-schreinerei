/* =========================================================================
   Lot — QR-Code-Erzeugung für die Etiketten

   Byte-Modus, Fehlerkorrektur M (verträgt rund 15 % Verschmutzung —
   in einer Werkstatt kein Luxus), Version 1 bis 10 wird automatisch
   gewählt. Keine fremde Bibliothek, damit die App eigenständig bleibt.

   LotQR.matrix(text) liefert ein Array von Zeilen mit true/false.
   LotQR.svg(text, optionen) liefert fertiges SVG.
   ========================================================================= */
(function (global) {
  "use strict";

  /* ---------- Rechnen im Galois-Feld GF(256) ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function mul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /* Generatorpolynom für n Fehlerkorrektur-Bytes */
  function generator(n) {
    var poly = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(poly.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function ecBytes(daten, anzahl) {
    var gen = generator(anzahl);
    var rest = daten.slice().concat(new Array(anzahl).fill(0));
    for (var i = 0; i < daten.length; i++) {
      var faktor = rest[i];
      if (faktor === 0) continue;
      for (var j = 0; j < gen.length; j++) {
        rest[i + j] ^= mul(gen[j], faktor);
      }
    }
    return rest.slice(daten.length);
  }

  /* ---------- Tabellen für Fehlerkorrektur M, Version 1..10 ----------
     [ EC-Bytes je Block, Bloecke Gruppe 1, Datenbytes G1, Bloecke G2, Datenbytes G2 ] */
  var ECC_M = {
    1:  [10, 1, 16, 0, 0],
    2:  [16, 1, 28, 0, 0],
    3:  [26, 1, 44, 0, 0],
    4:  [18, 2, 32, 0, 0],
    5:  [24, 2, 43, 0, 0],
    6:  [16, 4, 27, 0, 0],
    7:  [18, 4, 31, 0, 0],
    8:  [22, 2, 38, 2, 39],
    9:  [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44]
  };

  /* Positionen der Ausrichtungsmuster je Version */
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function datenKapazitaet(version) {
    var t = ECC_M[version];
    return t[1] * t[2] + t[3] * t[4];
  }

  /* ---------- Text zu Bytes (UTF-8) ---------- */
  function utf8(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
        var c2 = text.charCodeAt(++i);
        var p = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (p >> 18), 0x80 | ((p >> 12) & 0x3F),
                 0x80 | ((p >> 6) & 0x3F), 0x80 | (p & 0x3F));
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  /* ---------- Bitpuffer ---------- */
  function Bits() { this.bits = []; }
  Bits.prototype.push = function (wert, laenge) {
    for (var i = laenge - 1; i >= 0; i--) this.bits.push((wert >> i) & 1);
  };
  Bits.prototype.bytes = function () {
    var out = [];
    for (var i = 0; i < this.bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] || 0);
      out.push(b);
    }
    return out;
  };

  /* ---------- Daten kodieren ---------- */
  function kodiere(text) {
    var daten = utf8(text);
    var version = 0;
    for (var v = 1; v <= 10; v++) {
      var laengenBits = v < 10 ? 8 : 16;
      var noetig = 4 + laengenBits + daten.length * 8;
      if (Math.ceil(noetig / 8) <= datenKapazitaet(v)) { version = v; break; }
    }
    if (!version) throw new Error('Text zu lang für einen QR-Code dieser Grösse');

    var kap = datenKapazitaet(version);
    var bits = new Bits();
    bits.push(4, 4);                                   /* Modus: Byte */
    bits.push(daten.length, version < 10 ? 8 : 16);    /* Länge */
    for (var i = 0; i < daten.length; i++) bits.push(daten[i], 8);

    /* Abschluss und Auffüllen */
    var frei = kap * 8 - bits.bits.length;
    bits.push(0, Math.min(4, frei));
    while (bits.bits.length % 8 !== 0) bits.bits.push(0);
    var bytes = bits.bytes();
    var fueller = [0xEC, 0x11], k = 0;
    while (bytes.length < kap) bytes.push(fueller[k++ % 2]);

    /* In Blöcke teilen, je Block Fehlerkorrektur rechnen */
    var t = ECC_M[version];
    var ecLen = t[0];
    var bloecke = [], ecs = [], pos = 0, b;
    for (b = 0; b < t[1]; b++) { bloecke.push(bytes.slice(pos, pos + t[2])); pos += t[2]; }
    for (b = 0; b < t[3]; b++) { bloecke.push(bytes.slice(pos, pos + t[4])); pos += t[4]; }
    for (b = 0; b < bloecke.length; b++) ecs.push(ecBytes(bloecke[b], ecLen));

    /* Verschachteln */
    var folge = [], maxD = Math.max(t[2], t[4] || 0), i2;
    for (i2 = 0; i2 < maxD; i2++) {
      for (b = 0; b < bloecke.length; b++) {
        if (i2 < bloecke[b].length) folge.push(bloecke[b][i2]);
      }
    }
    for (i2 = 0; i2 < ecLen; i2++) {
      for (b = 0; b < ecs.length; b++) folge.push(ecs[b][i2]);
    }
    return { version: version, bytes: folge };
  }

  /* ---------- Matrix aufbauen ----------
     m  = die Module selbst
     fn = welche Module zu den Funktionsmustern gehoeren und darum
          weder Daten aufnehmen noch maskiert werden duerfen        */

  function setzeModul(m, fn, zeile, spalte, wert) {
    m[zeile][spalte] = wert;
    fn[zeile][spalte] = true;
  }

  /* Sucherquadrat um sein Zentrum, samt Trennstreifen */
  function sucher(m, fn, zZentrum, sZentrum) {
    var n = m.length;
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var abstand = Math.max(Math.abs(dy), Math.abs(dx));
        var zeile = zZentrum + dy, spalte = sZentrum + dx;
        if (zeile < 0 || zeile >= n || spalte < 0 || spalte >= n) continue;
        setzeModul(m, fn, zeile, spalte, abstand !== 2 && abstand !== 4);
      }
    }
  }

  /* Ausrichtungsquadrat um sein Zentrum */
  function ausrichter(m, fn, zZentrum, sZentrum) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        setzeModul(m, fn, zZentrum + dy, sZentrum + dx,
                   Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
      }
    }
  }

  /* Formatinformation an ihre beiden Plaetze schreiben */
  function schreibeFormat(m, fn, maske) {
    var n = m.length;
    var bits = formatBits(maske);
    var i;

    /* Erste Kopie: senkrecht neben dem linken oberen Sucherquadrat,
       dann waagrecht darunter. Reihenfolge ist Zeile, Spalte. */
    for (i = 0; i <= 5; i++) setzeModul(m, fn, i, 8, bit(bits, i));
    setzeModul(m, fn, 7, 8, bit(bits, 6));
    setzeModul(m, fn, 8, 8, bit(bits, 7));
    setzeModul(m, fn, 8, 7, bit(bits, 8));
    for (i = 9; i < 15; i++) setzeModul(m, fn, 8, 14 - i, bit(bits, i));

    /* Zweite Kopie: waagrecht rechts, dann senkrecht unten */
    for (i = 0; i < 8; i++) setzeModul(m, fn, 8, n - 1 - i, bit(bits, i));
    for (i = 8; i < 15; i++) setzeModul(m, fn, n - 15 + i, 8, bit(bits, i));

    /* Dieses eine Modul ist immer dunkel */
    setzeModul(m, fn, n - 8, 8, true);
  }

  function bit(wert, stelle) { return ((wert >>> stelle) & 1) !== 0; }

  function schreibeVersion(m, fn, version) {
    if (version < 7) return;
    var n = m.length;
    var vinfo = versionsBits(version);
    for (var i = 0; i < 18; i++) {
      var b = bit(vinfo, i);
      var a = Math.floor(i / 3), c = i % 3;
      setzeModul(m, fn, n - 11 + c, a, b);
      setzeModul(m, fn, a, n - 11 + c, b);
    }
  }

  function baueMatrix(version, bytes) {
    var n = version * 4 + 17;
    var m = [], fn = [], i, j;
    for (i = 0; i < n; i++) {
      m.push(new Array(n).fill(false));
      fn.push(new Array(n).fill(false));
    }

    /* Taktmuster zuerst — die Sucherquadrate ueberschreiben es an den Enden */
    for (i = 0; i < n; i++) {
      setzeModul(m, fn, 6, i, i % 2 === 0);
      setzeModul(m, fn, i, 6, i % 2 === 0);
    }

    sucher(m, fn, 3, 3);
    sucher(m, fn, 3, n - 4);
    sucher(m, fn, n - 4, 3);

    var pos = ALIGN[version];
    for (i = 0; i < pos.length; i++) {
      for (j = 0; j < pos.length; j++) {
        /* die drei Ecken bleiben den Sucherquadraten vorbehalten */
        var eckeObenLinks  = (i === 0 && j === 0);
        var eckeObenRechts = (i === 0 && j === pos.length - 1);
        var eckeUntenLinks = (i === pos.length - 1 && j === 0);
        if (eckeObenLinks || eckeObenRechts || eckeUntenLinks) continue;
        ausrichter(m, fn, pos[i], pos[j]);
      }
    }

    schreibeVersion(m, fn, version);
    schreibeFormat(m, fn, 0);   /* vorlaeufig, wird nach der Maskenwahl ersetzt */

    /* Daten im Zickzack einweben, von rechts unten nach links oben */
    var bitZaehler = 0;
    for (var rechts = n - 1; rechts >= 1; rechts -= 2) {
      if (rechts === 6) rechts = 5;          /* die Taktspalte auslassen */
      for (var lauf = 0; lauf < n; lauf++) {
        for (var d = 0; d < 2; d++) {
          var spalte = rechts - d;
          var aufwaerts = ((rechts + 1) & 2) === 0;
          var zeile = aufwaerts ? n - 1 - lauf : lauf;
          if (fn[zeile][spalte]) continue;
          if (bitZaehler < bytes.length * 8) {
            m[zeile][spalte] = bit(bytes[bitZaehler >>> 3], 7 - (bitZaehler & 7));
            bitZaehler++;
          }
        }
      }
    }

    return { matrix: m, funktion: fn, groesse: n };
  }

  /* ---------- Masken ---------- */
  function maskeAn(nr, zeile, spalte) {
    switch (nr) {
      case 0: return (zeile + spalte) % 2 === 0;
      case 1: return zeile % 2 === 0;
      case 2: return spalte % 3 === 0;
      case 3: return (zeile + spalte) % 3 === 0;
      case 4: return (Math.floor(zeile / 2) + Math.floor(spalte / 3)) % 2 === 0;
      case 5: return ((zeile * spalte) % 2) + ((zeile * spalte) % 3) === 0;
      case 6: return (((zeile * spalte) % 2) + ((zeile * spalte) % 3)) % 2 === 0;
      default: return (((zeile + spalte) % 2) + ((zeile * spalte) % 3)) % 2 === 0;
    }
  }

  function strafe(m) {
    var n = m.length, p = 0, i, j, z;

    /* Regel 1: fünf oder mehr gleiche in Reihe */
    for (i = 0; i < n; i++) {
      var laufZ = 1, laufS = 1;
      for (j = 1; j < n; j++) {
        laufZ = (m[i][j] === m[i][j - 1]) ? laufZ + 1 : 1;
        if (laufZ === 5) p += 3; else if (laufZ > 5) p += 1;
        laufS = (m[j][i] === m[j - 1][i]) ? laufS + 1 : 1;
        if (laufS === 5) p += 3; else if (laufS > 5) p += 1;
      }
    }
    /* Regel 2: gleichfarbige 2x2-Blöcke */
    for (i = 0; i < n - 1; i++) {
      for (j = 0; j < n - 1; j++) {
        var v = m[i][j];
        if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) p += 3;
      }
    }
    /* Regel 3: Muster, das wie ein Finder aussieht */
    var muster1 = [true, false, true, true, true, false, true, false, false, false, false];
    var muster2 = [false, false, false, false, true, false, true, true, true, false, true];
    function passt(reihe, start, muster) {
      for (var k = 0; k < 11; k++) if (reihe[start + k] !== muster[k]) return false;
      return true;
    }
    for (i = 0; i < n; i++) {
      var zeile = m[i];
      var spalte = [];
      for (z = 0; z < n; z++) spalte.push(m[z][i]);
      for (j = 0; j + 11 <= n; j++) {
        if (passt(zeile, j, muster1) || passt(zeile, j, muster2)) p += 40;
        if (passt(spalte, j, muster1) || passt(spalte, j, muster2)) p += 40;
      }
    }
    /* Regel 4: Verhältnis dunkel zu hell */
    var dunkel = 0;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (m[i][j]) dunkel++;
    var anteil = dunkel * 100 / (n * n);
    p += Math.floor(Math.abs(anteil - 50) / 5) * 10;
    return p;
  }

  /* ---------- Format- und Versionsbits ---------- */
  function formatBits(maske) {
    /* Fehlerkorrektur M entspricht 00 */
    var daten = (0 << 3) | maske;
    var rest = daten << 10;
    for (var i = 14; i >= 10; i--) {
      if ((rest >> i) & 1) rest ^= 0x537 << (i - 10);
    }
    return ((daten << 10) | rest) ^ 0x5412;
  }

  function versionsBits(version) {
    var rest = version << 12;
    for (var i = 17; i >= 12; i--) {
      if ((rest >> i) & 1) rest ^= 0x1F25 << (i - 12);
    }
    return (version << 12) | rest;
  }

  /* ---------- Öffentliche Funktionen ---------- */
  function matrix(text) {
    var kod = kodiere(String(text));
    var gebaut = baueMatrix(kod.version, kod.bytes);
    var n = gebaut.groesse;
    var beste = null, besteStrafe = Infinity;

    for (var maske = 0; maske < 8; maske++) {
      var kandidat = [];
      for (var i = 0; i < n; i++) kandidat.push(gebaut.matrix[i].slice());

      for (i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) {
          if (!gebaut.funktion[i][j] && maskeAn(maske, i, j)) {
            kandidat[i][j] = !kandidat[i][j];
          }
        }
      }
      /* Formatinformation passend zur Maske — schreibt in eine Kopie der
         Funktionsmarkierung, damit das Original unberuehrt bleibt */
      var fnKopie = [];
      for (i = 0; i < n; i++) fnKopie.push(gebaut.funktion[i].slice());
      schreibeFormat(kandidat, fnKopie, maske);

      var s = strafe(kandidat);
      if (s < besteStrafe) { besteStrafe = s; beste = kandidat; }
    }
    return beste;
  }

  function svg(text, opt) {
    opt = opt || {};
    var m = matrix(text);
    var n = m.length;
    var rand = opt.rand === undefined ? 4 : opt.rand;   /* Ruhezone in Modulen */
    var gesamt = n + rand * 2;
    var dunkel = opt.farbe || '#000000';
    var pfad = [];
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (m[i][j]) pfad.push('M' + (j + rand) + ' ' + (i + rand) + 'h1v1h-1z');
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + gesamt + ' ' + gesamt +
           '" shape-rendering="crispEdges" role="img" aria-label="QR-Code ' + String(text).replace(/[<>&"]/g, '') + '">' +
           '<rect width="' + gesamt + '" height="' + gesamt + '" fill="#ffffff"/>' +
           '<path d="' + pfad.join('') + '" fill="' + dunkel + '"/></svg>';
  }

  global.LotQR = { matrix: matrix, svg: svg };
})(window);
