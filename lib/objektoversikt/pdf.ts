// Objektöversikten som A4-PDF ("Dela som PDF"). SAMMA vymodell som sidan (byggObjektVy): varje text och varje tal
// i PDF:en står också på skärmen. Här ritas bara. Ljus A4, svaret först, sedan frågorna i samma ordning som sidan —
// rubriken i en vänsterspalt, raderna till höger (som ett ifyllt papper).
//
// pdf-lib som markägarrapporten; laddas dynamiskt så att den inte ligger i sidans bundle.
import type { ObjektVy, Stapel, VyRad } from './vy';
import { sanera, datumText } from '@/lib/markagarrapport/pdf';
import { FARG } from '@/lib/design/tokens';

const A4 = { b: 595.28, h: 841.89 };
const MARG = 48;
const B = A4.b - 2 * MARG;
const STEG = { tal: 34, rubrik: 17, text: 11, micro: 9 };
const RUBRIK_B = 118;
const FOT_Y = A4.h - MARG;

function hex(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
  if (!m) return [0.56, 0.56, 0.58];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

export async function skapaObjektPdf(vy: ObjektVy, datum: string = new Date().toISOString().slice(0, 10)): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  type Farg = ReturnType<typeof rgb>;
  const doc = await PDFDocument.create();
  doc.setTitle(sanera(`Objektöversikt ${vy.namn}`));
  doc.setProducer('Skogsystem');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fet = await doc.embedFont(StandardFonts.HelveticaBold);
  type Font = typeof normal;
  const c = (h: string) => rgb(...hex(h));
  const F = { text: c('#111111'), sek: c('#6e6e73'), linje: c('#d2d2d7'), dampad: c('#c7c7cc'), orange: c(FARG.orange), stapel: c('#1c1c1e') };

  let sida = doc.addPage([A4.b, A4.h]);
  const sidor = [sida];
  let y = MARG;
  const nySida = () => { sida = doc.addPage([A4.b, A4.h]); sidor.push(sida); y = MARG; };
  const plats = (h: number) => { if (y + h > FOT_Y - STEG.micro - 16) nySida(); };
  const bredd = (s: string, st: number, f: Font) => f.widthOfTextAtSize(sanera(s), st);
  const text = (s: string, x: number, yy: number, st: number, f: Font, farg: Farg) =>
    sida.drawText(sanera(s), { x, y: A4.h - yy - st * 0.76, size: st, font: f, color: farg });
  const hoger = (s: string, xH: number, yy: number, st: number, f: Font, farg: Farg) => text(s, xH - bredd(s, st, f), yy, st, f, farg);
  const bryt = (s: string, st: number, f: Font, max: number): string[] => {
    const ut: string[] = [];
    for (const stycke of s.split(/\r?\n/)) {
      let rad = '';
      for (const ord of stycke.split(/\s+/).filter(Boolean)) {
        const prov = rad ? `${rad} ${ord}` : ord;
        if (rad && bredd(prov, st, f) > max) { ut.push(rad); rad = ord; } else rad = prov;
      }
      if (rad) ut.push(rad);
    }
    return ut;
  };

  // ── Huvud ─────────────────────────────────────────────────────────────────
  text('Kompersmåla Skog', MARG, y, STEG.text, fet, F.text);
  hoger(datumText(datum), MARG + B, y, STEG.text, normal, F.sek);
  y += STEG.text + 28;
  text(vy.meta, MARG, y, STEG.text, normal, F.sek);
  y += STEG.text + 6;
  text(vy.namn, MARG, y, STEG.rubrik + 5, fet, F.text);
  y += STEG.rubrik + 5 + 18;
  text(vy.fraga, MARG, y, STEG.text, normal, F.sek);
  y += STEG.text + 6;
  text(vy.svar, MARG, y, STEG.tal, fet, F.text);
  y += STEG.tal + 8;
  if (vy.underSvar) { text(vy.underSvar, MARG, y, STEG.text + 2, normal, F.text); y += STEG.text + 2; }
  y += 22;

  // ── En sektion: rubriken till vänster, raderna till höger ─────────────────
  const X = MARG + RUBRIK_B;
  const W = B - RUBRIK_B;
  const radH = (r: VyRad) => {
    const under = [r.under, r.under2].filter(Boolean).flatMap(t => bryt(t!, STEG.micro + 1, normal, W - 90));
    // En rad med bara en högerrad under talet (procenten vid ett trädslag) behöver plats för den.
    const rader = Math.max(under.length, r.hogerUnder ? 1 : 0);
    return 6 + STEG.text + 4 + rader * (STEG.micro + 4) + 6;
  };
  const sektion = (rubrik: string, rader: VyRad[], fore?: { h: number; rita: () => void }) => {
    // Rubriken radbryts i sin vänsterspalt ("Hur kom maskinerna hit?" ryms inte på en rad).
    const rubrikRader = bryt(rubrik, STEG.text + 1, fet, RUBRIK_B - 12);
    const rubrikH = 6 + rubrikRader.length * (STEG.text + 5);
    const forstaH = Math.max(rubrikH, (fore?.h ?? 0) + (rader[0] ? radH(rader[0]) : 0));
    plats(forstaH + 20);
    sida.drawLine({ start: { x: MARG, y: A4.h - y }, end: { x: MARG + B, y: A4.h - y }, thickness: 0.5, color: F.linje });
    y += 12;
    const yRubrik = y;
    rubrikRader.forEach((r, i) => text(r, MARG, y + 6 + i * (STEG.text + 5), STEG.text + 1, fet, F.text));
    if (fore) { fore.rita(); }
    rader.forEach((r, i) => {
      const h = radH(r);
      if (i > 0) plats(h);
      const farg = r.dampad ? F.sek : F.text;
      // Prick före namnet i delens färg (som på skärmen). Ljus fyllning (björk) får kant mot det vita papperet.
      const xT = r.farg ? X + 13 : X;
      if (r.farg) {
        sida.drawCircle({ x: X + 4, y: A4.h - (y + 6 + STEG.text * 0.42), size: 4, color: c(r.farg),
          borderColor: r.kontur ? c(r.kontur) : undefined, borderWidth: r.kontur ? 0.8 : 0 });
      }
      text(r.titel, xT, y + 6, STEG.text, fet, farg);
      if (r.hoger) hoger(r.hoger, X + W, y + 6, STEG.text, fet, farg);
      let yy = y + 6 + STEG.text + 4;
      if (r.hogerUnder) hoger(r.hogerUnder, X + W, yy, STEG.micro + 1, normal, F.sek);
      for (const [t, varning] of [[r.under, !!r.varning], [r.under2, false]] as const) {
        if (!t) continue;
        for (const del of bryt(t, STEG.micro + 1, normal, W - 90)) {
          text(del, xT, yy, STEG.micro + 1, normal, varning ? F.orange : F.sek);
          yy += STEG.micro + 4;
        }
      }
      y += h;
    });
    y = Math.max(y, yRubrik + rubrikH) + 12;
  };

  const graf = (staplar: Stapel[]) => {
    const H = 56;
    return {
      h: H + 24,
      rita: () => {
        const max = Math.max(...staplar.map(s => s.min), 1);
        const steg = W / staplar.length;
        const yBas = y + 6 + H;
        staplar.forEach((s, i) => {
          const x = X + i * steg + steg * 0.18;
          if (s.min <= 0) { sida.drawRectangle({ x, y: A4.h - yBas, width: steg * 0.64, height: 1, color: F.dampad }); return; }
          // Staplad i delarnas färger, nerifrån (samma ordning som skärmen).
          const total = Math.max(2, (s.min / max) * H);
          let botten = A4.h - yBas;
          for (const d of s.delar) {
            const h = (d.min / s.min) * total;
            if (h <= 0) continue;
            sida.drawRectangle({ x, y: botten, width: steg * 0.64, height: h, color: c(d.farg) });
            botten += h;
          }
        });
        const etikett = (i: number) => {
          const s = staplar[i];
          const t = /^\d{4}-\d{2}-\d{2}$/.test(s.nyckel) ? s.lang.replace(/^\S+ /, '') : s.etikett;
          const w = bredd(t, STEG.micro, normal);
          const x = Math.min(Math.max(X, X + i * steg + steg / 2 - w / 2), X + W - w);
          text(t, x, yBas + 5, STEG.micro, normal, F.sek);
        };
        etikett(0);
        if (staplar.length > 1) etikett(staplar.length - 1);
        y += H + 24;
      },
    };
  };

  if (vy.kvar) sektion('Vad är kvar?', vy.kvar);
  sektion('Vart gick tiden?', vy.tid.rader, vy.tid.staplar.length > 1 ? graf(vy.tid.staplar) : undefined);
  if (vy.tid.not) { text(vy.tid.not, X, y - 6, STEG.micro, normal, F.sek); y += STEG.micro + 4; }
  if (vy.flyttar) sektion('Hur kom maskinerna hit?', vy.flyttar);
  // Trädslagen: en stapel i trädslagens färger över raderna (som markägarrapporten), sedan resten av "Vad blev det?".
  const tradStapel = vy.trad ? {
    h: 22,
    rita: () => {
      let x = X;
      for (const d of vy.trad!.stapel) {
        const w = d.andel * W;
        if (w <= 0) continue;
        sida.drawRectangle({ x, y: A4.h - (y + 6 + 10), width: w, height: 10, color: c(d.farg) });
        x += w;
      }
      sida.drawRectangle({ x: X, y: A4.h - (y + 6 + 10), width: W, height: 10, borderColor: F.linje, borderWidth: 0.5 });
      y += 22;
    },
  } : undefined;
  if (vy.blev || vy.trad) sektion('Vad blev det?', [...(vy.trad?.rader ?? []), ...(vy.blev ?? [])], tradStapel);
  if (vy.uppdraget) sektion('Vad skulle göras?', vy.uppdraget);

  sidor.forEach((s, i) => {
    const t = sanera(`Kompersmåla Skog · Objektöversikt ${vy.namn}${sidor.length > 1 ? ` · sida ${i + 1} av ${sidor.length}` : ''}`);
    const w = normal.widthOfTextAtSize(t, STEG.micro);
    s.drawText(t, { x: (A4.b - w) / 2, y: A4.h - FOT_Y, size: STEG.micro, font: normal, color: F.sek });
  });
  return doc.save();
}
