// Ritar ett arbetsmiljödokument (lib/arbetsmiljo/dokument.ts) som en ljus A4 — för utskrift och för en inspektör som öppnar den i mejlen.
// Bara ritning: varje text kommer ur dokumentet. pdf-lib som markägarrapporten; laddas dynamiskt så att den inte ligger i sidans bundle.
// Ordningen: företaget och rubriken, fakta, svaret, sedan avsnitten. En rad = titel (fet), text under (vanlig) och status till höger
// eller på egen rad när den inte ryms. Färgen förstärker bara — ordet står alltid.

import type { Dokument, Ton } from './dokument';
import { sanera } from '@/lib/markagarrapport/pdf';

const A4 = { b: 595.28, h: 841.89 };
const MARG = 48;
const B = A4.b - 2 * MARG;
const STEG = { titel: 26, svar: 17, rubrik: 13, text: 11, micro: 9 };
const FOT_Y = A4.h - MARG;
/** Bredd för status till höger om titeln; längre status hamnar på egen rad. */
const STATUS_B = 150;

function hex(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
  if (!m) return [0.43, 0.43, 0.45];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

export async function skapaArbetsmiljoPdf(dok: Dokument): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  type Farg = ReturnType<typeof rgb>;
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanera(dok.titel));
  pdf.setProducer('Skogsystem');
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fet = await pdf.embedFont(StandardFonts.HelveticaBold);
  type Font = typeof normal;

  const c = (h: string) => rgb(...hex(h));
  // Mörkare grönt och orange än appens (ljus bakgrund); samma betydelse.
  const F = { text: c('#111111'), sek: c('#6e6e73'), linje: c('#e5e5ea'), kort: c('#f2f2f7'), bra: c('#1f8a3b'), brist: c('#c25e00') };
  const tonFarg = (t: Ton | undefined): Farg => (t === 'bra' ? F.bra : t === 'brist' ? F.brist : t === 'dampad' ? F.sek : F.text);

  let sida = pdf.addPage([A4.b, A4.h]);
  const sidor = [sida];
  let y = MARG;
  const nySida = () => { sida = pdf.addPage([A4.b, A4.h]); sidor.push(sida); y = MARG; };
  const plats = (h: number) => { if (y + h > FOT_Y - STEG.micro - 16) nySida(); };

  const bredd = (s: string, st: number, f: Font) => f.widthOfTextAtSize(sanera(s), st);
  const text = (s: string, x: number, yy: number, st: number, f: Font, farg: Farg) =>
    sida.drawText(sanera(s), { x, y: A4.h - yy - st * 0.76, size: st, font: f, color: farg });
  const bryt = (s: string, st: number, f: Font, max: number): string[] => {
    const ut: string[] = [];
    for (const stycke of s.split('\n')) {
      let rad = '';
      for (const ord of stycke.split(/\s+/).filter(Boolean)) {
        const prov = rad ? `${rad} ${ord}` : ord;
        if (rad && bredd(prov, st, f) > max) { ut.push(rad); rad = ord; } else rad = prov;
      }
      if (rad) ut.push(rad);
    }
    return ut;
  };
  const linje = (yy: number) => sida.drawLine({ start: { x: MARG, y: A4.h - yy }, end: { x: MARG + B, y: A4.h - yy }, thickness: 0.5, color: F.linje });

  // ── Huvud ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  text('Kompersmåla Skog', MARG, y, STEG.text, fet, F.sek);
  y += STEG.text + 10;
  text(dok.titel, MARG, y, STEG.titel, fet, F.text);
  y += STEG.titel + 14;

  for (const f of dok.fakta) {
    const rader = bryt(f.varde, STEG.text, normal, B - 110);
    plats(rader.length * STEG.text * 1.4);
    text(f.etikett, MARG, y, STEG.text, normal, F.sek);
    rader.forEach((r, i) => text(r, MARG + 110, y + i * STEG.text * 1.4, STEG.text, normal, F.text));
    y += rader.length * STEG.text * 1.4 + 2;
  }
  y += 10;

  const svarRader = bryt(dok.svar, STEG.svar, fet, B - 24);
  const svarH = svarRader.length * STEG.svar * 1.3 + 20;
  sida.drawRectangle({ x: MARG, y: A4.h - y - svarH, width: B, height: svarH, color: F.kort });
  svarRader.forEach((r, i) => text(r, MARG + 12, y + 10 + i * STEG.svar * 1.3, STEG.svar, fet, tonFarg(dok.svarTon)));
  y += svarH + 22;

  // ── Avsnitt ───────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const s of dok.sektioner) {
    const underRader = s.under ? bryt(s.under, STEG.text, normal, B) : [];
    plats(STEG.rubrik + underRader.length * STEG.text * 1.4 + 40);
    text(s.rubrik, MARG, y, STEG.rubrik, fet, F.text);
    y += STEG.rubrik + 6;
    for (const r of underRader) { text(r, MARG, y, STEG.text, normal, F.sek); y += STEG.text * 1.4; }
    y += 4;
    linje(y);
    y += 8;

    for (const r of s.rader) {
      const statusBredd = r.status ? bredd(r.status, STEG.text, fet) : 0;
      const statusHoger = !!r.status && statusBredd <= STATUS_B;
      const titelMax = statusHoger ? B - STATUS_B - 12 : B;
      const titelRader = bryt(r.titel, STEG.text, fet, titelMax);
      const textRader = r.text ? bryt(r.text, STEG.text, normal, B) : [];
      const statusRader = r.status && !statusHoger ? bryt(r.status, STEG.text, fet, B) : [];
      const h = (titelRader.length + textRader.length + statusRader.length) * STEG.text * 1.4 + 8;
      plats(h);
      const top = y;
      titelRader.forEach((t, i) => text(t, MARG, y + i * STEG.text * 1.4, STEG.text, fet, F.text));
      if (statusHoger) text(r.status!, MARG + B - statusBredd, top, STEG.text, fet, tonFarg(r.ton));
      y += titelRader.length * STEG.text * 1.4;
      for (const t of textRader) { text(t, MARG, y, STEG.text, normal, F.text); y += STEG.text * 1.4; }
      for (const t of statusRader) { text(t, MARG, y, STEG.text, fet, tonFarg(r.ton)); y += STEG.text * 1.4; }
      y += 4;
      linje(y);
      y += 6;
    }
    y += 16;
  }

  if (dok.not) {
    const rader = bryt(dok.not, STEG.micro, normal, B);
    plats(rader.length * STEG.micro * 1.4);
    for (const r of rader) { text(r, MARG, y, STEG.micro, normal, F.sek); y += STEG.micro * 1.4; }
  }

  sidor.forEach((s, i) => {
    const t = sanera(`Kompersmåla Skog · ${dok.titel}${sidor.length > 1 ? ` · sida ${i + 1} av ${sidor.length}` : ''}`);
    s.drawText(t, { x: MARG, y: MARG - STEG.micro, size: STEG.micro, font: normal, color: F.sek });
  });

  return pdf.save();
}
