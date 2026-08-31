/* Erzeugt ein Word-Dokument mit Etiketten im Raster Avery Zweckform 6122
   (70 × 36 mm, 3 × 8 = 24 Stück je Bogen, 4,5 mm Rand oben, sonst randlos).

   Jedes Etikett besteht aus zwei nebeneinanderliegenden Tabellenzellen:
   links der QR-Code, rechts der Text. Keine verschachtelten Tabellen —
   sonst hält Word die exakte Zeilenhöhe nicht ein. */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  Table, TableRow, TableCell, WidthType,
  VerticalAlign, BorderStyle, HeightRule, TableLayoutType
} = require('docx');

const mm = (v) => Math.round(v * 1440 / 25.4);      // Millimeter in DXA
const px = (v) => Math.round(v * 96 / 25.4);        // Millimeter in Bildpunkte

const SPALTEN = 3, ZEILEN = 8;
const ET_BREITE = 70, ET_HOEHE = 36;
const QR_SPALTE = 30, TEXT_SPALTE = ET_BREITE - QR_SPALTE;
const RAND_OBEN = 4.5;
const QR_MM = 25;

const hier = __dirname;
const artikel = JSON.parse(fs.readFileSync(path.join(hier, 'qr_tmp', 'artikel.json'), 'utf8'));

const ohneRahmen = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
};

function leereZelle(breite) {
  return new TableCell({
    width: { size: mm(breite), type: WidthType.DXA },
    borders: ohneRahmen,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' },
      children: [new TextRun({ text: '', size: 2 })]
    })]
  });
}

function qrZelle(a) {
  const bild = fs.readFileSync(path.join(hier, '..', a.bild));
  return new TableCell({
    width: { size: mm(QR_SPALTE), type: WidthType.DXA },
    borders: ohneRahmen,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 0, bottom: 0, left: mm(2), right: mm(1.5) },
    children: [new Paragraph({
      spacing: { before: 0, after: 0, line: mm(QR_MM), lineRule: 'exact' },
      children: [new ImageRun({
        type: 'png',
        data: bild,
        transformation: { width: px(QR_MM), height: px(QR_MM) }
      })]
    })]
  });
}

function zeile(text, opt) {
  return new Paragraph({
    spacing: { before: 0, after: opt.after || 0, line: opt.line, lineRule: 'exact' },
    children: [new TextRun({
      text: text,
      bold: !!opt.fett,
      size: opt.groesse,
      font: opt.schrift,
      color: opt.farbe
    })]
  });
}

function textZelle(a) {
  return new TableCell({
    width: { size: mm(TEXT_SPALTE), type: WidthType.DXA },
    borders: ohneRahmen,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 0, bottom: 0, left: 0, right: mm(2) },
    children: [
      zeile(a.ort || '', { line: 190, after: 30, fett: true,  groesse: 13, schrift: 'Consolas', farbe: 'A93C08' }),
      zeile(a.name,      { line: 230, after: 30, fett: true,  groesse: 15, schrift: 'Arial',    farbe: '171310' }),
      zeile(a.lieferant, { line: 180, after: 0,  fett: false, groesse: 12, schrift: 'Arial',    farbe: '5C554E' }),
      zeile(a.code,      { line: 180, after: 0,  fett: false, groesse: 12, schrift: 'Consolas', farbe: '171310' })
    ]
  });
}

/* Bogen füllen: vorhandene Artikel, Rest bleibt leer */
const zeilen = [];
for (let z = 0; z < ZEILEN; z++) {
  const zellen = [];
  for (let sp = 0; sp < SPALTEN; sp++) {
    const a = artikel[z * SPALTEN + sp];
    if (a) {
      zellen.push(qrZelle(a));
      zellen.push(textZelle(a));
    } else {
      zellen.push(leereZelle(QR_SPALTE));
      zellen.push(leereZelle(TEXT_SPALTE));
    }
  }
  zeilen.push(new TableRow({
    height: { value: mm(ET_HOEHE), rule: HeightRule.EXACT },
    cantSplit: true,
    children: zellen
  }));
}

const tabelle = new Table({
  layout: TableLayoutType.FIXED,
  columnWidths: [
    mm(QR_SPALTE), mm(TEXT_SPALTE),
    mm(QR_SPALTE), mm(TEXT_SPALTE),
    mm(QR_SPALTE), mm(TEXT_SPALTE)
  ],
  width: { size: mm(ET_BREITE * SPALTEN), type: WidthType.DXA },
  borders: ohneRahmen,
  rows: zeilen
});

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: mm(210), height: mm(297) },
        margin: { top: mm(RAND_OBEN), right: 0, bottom: 0, left: 0,
                  header: 0, footer: 0, gutter: 0 }
      }
    },
    children: [
      tabelle,
      /* Word hängt hinter jede Tabelle einen Absatz. In normaler Grösse
         schöbe er den Bogen auf eine zweite Seite. */
      new Paragraph({
        spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' },
        children: [new TextRun({ text: '', size: 2 })]
      })
    ]
  }]
});

Packer.toBuffer(doc).then((buf) => {
  const ziel = path.join(hier, '..', 'Lot_Etiketten_6122.docx');
  fs.writeFileSync(ziel, buf);
  console.log('geschrieben:', ziel, (buf.length / 1024).toFixed(0) + ' KB');
});
