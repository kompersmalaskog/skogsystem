// Markägarrapporten som PDF — det som skickas till markägaren (Martin 2026-10-21).
//
// SAMMA vymodell som sidan (byggRapportVy i vy.ts): varje text och varje tal i PDF:en står också på skärmen, så de
// kan aldrig säga olika saker. Här ritas bara. Ljus A4 (för utskrift och för en markägare som öppnar den i mejlen),
// samma ordning som sidan: svaret först, sedan frågorna, kartan på egen sida. Facktermerna (Mer) är inte med —
// rapporten är till markägaren, inte till virkesköparen.
//
// pdf-lib som Månadsfacit och egenkontrollens A4; laddas dynamiskt så att den inte ligger i sidans bundle.
import type { RapportVy, Stapeldel, VyRad } from './vy';
import type { MarkagarRapport } from './types';
import { TRADSLAG_STIL, tradslagFarg, tradslagLabel } from '@/lib/tradslag';
import { kartLagen, kartText, prickRadie, ROT_FAKTOR } from './karta';
import { FARG } from '@/lib/design/tokens';

type Stam = MarkagarRapport['karta']['stammar'][number];

const A4 = { b: 595.28, h: 841.89 };
const MARG = 48;
const B = A4.b - 2 * MARG;
/** Typsteg i PDF:en: 40 / 17 / 13 / 11. Helvetica-Bold för rubriker och tal, Helvetica för brödtext. */
const STEG = { tal: 40, rubrik: 17, text: 13, micro: 11 };
const RAD_H = 42;
const FOT_Y = A4.h - MARG;
/** Flygfotots upplösning: 2 px per punkt (~144 dpi) — skarpt på skärm och utskrift, en JPEG på några hundra kB. */
const FOTO_PX_PER_PT = 2;

/** Standardfonterna klarar WinAnsi (å ä ö ³ · – …). Minustecken → bindestreck, hårt mellanslag → mellanslag, resten utanför → '?'. */
export function sanera(s: string): string {
  return s
    .replace(/−/g, '-')
    .replace(/[  ]/g, ' ')
    .replace(/[^ -ÿ–—‘’“”…]/g, '?');
}

/** "21 oktober 2026". */
export function datumText(iso: string): string {
  const M = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  const [ar, manad, dag] = iso.split('-').map(Number);
  return `${dag} ${M[manad - 1] ?? ''} ${ar}`;
}

function hex(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
  if (!m) return [0.56, 0.56, 0.58];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/** EPSG:4326 → EPSG:3857 (Web Mercator), samma projektion som flygfotot från Lantmäteriet och sidans karta. */
export function tillMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [x, (Math.log((1 + sin) / (1 - sin)) / 2) * 20037508.34 / Math.PI];
}

/** Rutan i Web Mercator som kartan visar (minX, minY, maxX, maxY) — flygfotot hämtas för exakt den. */
export type Ruta3857 = [number, number, number, number];

/**
 * Kartans punkter i PDF-koordinater. Projektionen är Web Mercator (lika skala i båda led), passad i en ruta med
 * bredden `b` och högst `maxH`, med 8 % marginal. Rutan fylls alltid i bredd: blir trakten för hög vidgas den i sidled,
 * så att flygfotot (`ruta`) täcker hela rutan utan att förvrängas och prickarna hamnar exakt på fotot.
 */
export function projicera(stammar: Stam[], b: number, maxH: number): { punkter: { x: number; y: number; s: Stam }[]; h: number; ruta: Ruta3857 | null } {
  const med = stammar.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (med.length === 0) return { punkter: [], h: 0, ruta: null };
  const xy = med.map(s => tillMercator(s.lng, s.lat));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of xy) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  // En enda stam: ge rutan ~100 m.
  if (maxX - minX < 1) { minX -= 50; maxX += 50; }
  if (maxY - minY < 1) { minY -= 50; maxY += 50; }
  const padX = (maxX - minX) * 0.08, padY = (maxY - minY) * 0.08;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  const h = Math.min(maxH, b * (maxY - minY) / (maxX - minX));
  // Vidga rutan till rutans form (b × h), centrerat.
  const vill = b / h, har = (maxX - minX) / (maxY - minY);
  if (har < vill) { const extra = ((maxY - minY) * vill - (maxX - minX)) / 2; minX -= extra; maxX += extra; }
  else if (har > vill) { const extra = ((maxX - minX) / vill - (maxY - minY)) / 2; minY -= extra; maxY += extra; }
  const sx = b / (maxX - minX), sy = h / (maxY - minY);
  return {
    h,
    ruta: [minX, minY, maxX, maxY],
    punkter: med.map((s, i) => ({ x: (xy[i][0] - minX) * sx, y: (maxY - xy[i][1]) * sy, s })),
  };
}

/** Hämtar flygfotot för rutan som JPEG (bredd och höjd i pixlar). null = gick inte; kartan ritas då utan foto. */
export type HamtaFlygfoto = (ruta: Ruta3857, bredd: number, hojd: number) => Promise<Uint8Array | null>;

export async function skapaMarkagarPdf(vy: RapportVy, stammar: Stam[], datum: string = new Date().toISOString().slice(0, 10), flygfoto?: HamtaFlygfoto): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  type Farg = ReturnType<typeof rgb>;
  const doc = await PDFDocument.create();
  doc.setTitle(sanera(`Markägarrapport ${vy.namn}`));
  doc.setProducer('Skogsystem');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fet = await doc.embedFont(StandardFonts.HelveticaBold);
  type Font = typeof normal;

  const c = (h: string) => rgb(...hex(h));
  const F = { text: c('#111111'), sek: c('#6e6e73'), linje: c('#e5e5ea'), kort: c('#f2f2f7'), kant: c('#c7c7cc'), rod: c(FARG.rod), orange: c(FARG.orange) };

  let sida = doc.addPage([A4.b, A4.h]);
  let y = MARG;
  const sidor = [sida];
  const nySida = () => { sida = doc.addPage([A4.b, A4.h]); sidor.push(sida); y = MARG; };
  /** Byter sida om `h` inte ryms ovanför sidfoten. */
  const plats = (h: number) => { if (y + h > FOT_Y - STEG.micro - 16) nySida(); };

  const bredd = (s: string, st: number, f: Font) => f.widthOfTextAtSize(sanera(s), st);
  /** y från sidans överkant; versalernas överkant hamnar vid y. */
  const text = (s: string, x: number, yy: number, st: number, f: Font, farg: Farg) =>
    sida.drawText(sanera(s), { x, y: A4.h - yy - st * 0.76, size: st, font: f, color: farg });
  const hoger = (s: string, xH: number, yy: number, st: number, f: Font, farg: Farg) => text(s, xH - bredd(s, st, f), yy, st, f, farg);
  /** Radbryter på ord. */
  const bryt = (s: string, st: number, f: Font, max: number): string[] => {
    const ut: string[] = [];
    let rad = '';
    for (const ord of s.split(/\s+/).filter(Boolean)) {
      const prov = rad ? `${rad} ${ord}` : ord;
      if (rad && bredd(prov, st, f) > max) { ut.push(rad); rad = ord; } else rad = prov;
    }
    if (rad) ut.push(rad);
    return ut;
  };
  // Kolumnen som ritas i just nu: hela bredden, eller en av två spalter (träden och granarna står bredvid varandra).
  let kx = MARG;
  let kw = B;
  const stycke = (s: string, st: number, f: Font, farg: Farg, radavst = 1.35) => {
    const rader = bryt(s, st, f, kw);
    plats(rader.length * st * radavst);
    for (const r of rader) { text(r, kx, y, st, f, farg); y += st * radavst; }
  };
  const rundRekt = (x: number, yy: number, b: number, h: number, r: number, fyll: Farg, kant?: Farg) => {
    const k = r * 0.5523;
    const d = `M ${r} 0 H ${b - r} C ${b - r + k} 0 ${b} ${r - k} ${b} ${r} V ${h - r} C ${b} ${h - r + k} ${b - r + k} ${h} ${b - r} ${h} H ${r} C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r} V ${r} C 0 ${r - k} ${r - k} 0 ${r} 0 Z`;
    sida.drawSvgPath(d, { x, y: A4.h - yy, color: fyll, borderColor: kant, borderWidth: kant ? 0.5 : 0 });
  };
  const prick = (x: number, yy: number, r: number, fyll: string) =>
    sida.drawCircle({ x, y: A4.h - yy, size: r, color: c(fyll), borderColor: F.kant, borderWidth: 0.5 });

  // ── Huvud: avsändare och mottagare ────────────────────────────────────────
  text('Kompersmåla Skog', MARG, y, STEG.text, fet, F.text);
  hoger(vy.skogsagare ? `Till ${vy.skogsagare} · ${datumText(datum)}` : datumText(datum), MARG + B, y, STEG.text, normal, F.sek);
  y += STEG.text + 32;

  // ── Svaret ────────────────────────────────────────────────────────────────
  stycke(vy.huvud, STEG.text, normal, F.sek);
  y += 10;
  if (vy.vardeFraga) { text(vy.vardeFraga, MARG, y, STEG.rubrik, normal, F.text); y += STEG.rubrik + 8; }
  text(vy.svar, MARG, y, STEG.tal, fet, F.text);
  y += STEG.tal + 10;
  stycke(vy.underSvar, STEG.rubrik, normal, F.text);
  y += 24;

  // ── Frågorna ──────────────────────────────────────────────────────────────
  const rubrik = (s: string) => { plats(STEG.rubrik + 14 + RAD_H * 2); text(s, kx, y, STEG.rubrik, fet, F.text); y += STEG.rubrik + 12; };
  const stapel = (delar: Stapeldel[]) => {
    const summa = delar.reduce((s, d) => s + Math.max(0, d.andel), 0);
    if (summa <= 0) return;
    const GAP = 2, H = 14;
    const tillgang = kw - GAP * (delar.length - 1);
    let x = kx;
    for (const d of delar) {
      const w = Math.max(3, (Math.max(0, d.andel) / summa) * tillgang);
      rundRekt(x, y, w, H, 3, c(d.farg), F.kant);
      x += w + GAP;
    }
    y += H + 8;
  };
  /** En rad: namn (fet) och förklaring under till vänster, talet och dess undertext till höger, tunn linje mellan raderna. */
  const rader = (lista: VyRad[], medPrick: boolean) => {
    lista.forEach((r, i) => {
      plats(RAD_H);
      const x0 = kx + (medPrick && r.farg ? 18 : 0);
      if (medPrick && r.farg) prick(kx + 5, y + 11, 5, r.farg);
      text(r.namn, x0, y + 6, STEG.text, fet, F.text);
      if (r.under) text(r.under, x0, y + 6 + STEG.text + 5, STEG.micro, normal, F.sek);
      hoger(r.hoger, kx + kw, y + 6, STEG.text, fet, F.text);
      if (r.hogerUnder) hoger(r.hogerUnder, kx + kw, y + 6 + STEG.text + 5, STEG.micro, normal, F.sek);
      y += RAD_H;
      if (i < lista.length - 1) sida.drawLine({ start: { x: x0, y: A4.h - y }, end: { x: kx + kw, y: A4.h - y }, thickness: 0.5, color: F.linje });
    });
  };
  const not = (s: string | null | undefined) => { if (!s) return; y += 6; stycke(s, STEG.micro, normal, F.sek); };

  if (vy.virket) {
    rubrik('Vad blev virket?');
    stapel(vy.virket.stapel);
    rader(vy.virket.rader, true);
    not(vy.virket.not);
    y += 28;
  }

  // Träden och granarna i två spalter (sidan har dem som kort bredvid varandra på iPad och dator) — så att svaret ryms på EN sida.
  const SPALT_GAP = 28;
  const spalter = [
    vy.trad && (() => {
      const t = vy.trad!;
      rubrik('Vilka träd växte här?');
      stapel(t.stapel);
      rader(t.rader, true);
    }),
    vy.granar && (() => {
      const g = vy.granar!;
      rubrik('Var granarna friska?');
      if (g.bild) {
        plats(40);
        const gran = c(tradslagFarg('Gran'));
        const lista = [...Array(g.bild.friska).fill(false), ...Array(g.bild.rotade).fill(true)] as boolean[];
        lista.forEach((rotad, i) => {
          const x = kx + i * 28;
          // Samma gran som på sidan (viewBox 40 × 52), skalad till 24 × 31.
          sida.drawSvgPath('M20 2 7 22h7L4 38h32l-10-16h7z', { x, y: A4.h - y, scale: 0.6, color: rotad ? F.kant : gran });
          sida.drawRectangle({ x: x + 10.2, y: A4.h - y - 30, width: 3.6, height: 7.2, color: rotad ? F.orange : F.sek });
        });
        y += 40;
      }
      stycke(g.rubrik, STEG.rubrik, fet, F.text);
      if (g.text) stycke(g.text, STEG.text, normal, F.sek);
      if (g.rader.length) { y += 6; rader(g.rader, false); }
      not(g.not);
    }),
  ].filter((f): f is () => void => !!f);
  if (spalter.length === 2) {
    kw = (B - SPALT_GAP) / 2;
    const topp = y;
    const forstaSida = sida;
    spalter[0]();
    const sidaVanster = sida, yVanster = y;
    // Bröt vänster spalt sidan börjar höger spalt överst på den nya sidan; annars bredvid.
    if (sida === forstaSida) y = topp; else y = MARG;
    kx = MARG + kw + SPALT_GAP;
    spalter[1]();
    if (sida === sidaVanster) y = Math.max(y, yVanster);
    kx = MARG; kw = B;
  } else {
    spalter.forEach(f => { f(); y += 28; });
  }

  // ── Kartan, på egen sida ──────────────────────────────────────────────────
  const { punkter, h: kartH, ruta } = projicera(stammar, B, FOT_Y - MARG - 120);
  if (punkter.length > 0) {
    nySida();
    text('Här växte träden', MARG, y, STEG.rubrik, fet, F.text);
    y += STEG.rubrik + 6;
    // Samma val som sidans karta: rötan när det finns röta, annars trädslagen (lib/markagarrapport/karta.ts).
    const lage = kartLagen(stammar)[0];
    text(kartText(lage, stammar), MARG, y, STEG.micro, normal, F.sek);
    y += STEG.micro + 14;
    const y0 = y;
    rundRekt(MARG, y0, B, kartH, 8, F.kort);
    // Flygfotot bakom prickarna (Lantmäteriets ortofoto, samma som sidans karta). Går det inte att hämta ritas
    // kartan ändå — prickarna är kartan — och en rad under säger att fotot saknas.
    let fotoSaknas = false;
    let harFoto = false;
    if (flygfoto && ruta) {
      let jpg: Uint8Array | null = null;
      try { jpg = await flygfoto(ruta, Math.round(B * FOTO_PX_PER_PT), Math.round(kartH * FOTO_PX_PER_PT)); } catch { jpg = null; }
      if (jpg) {
        try {
          const bild = await doc.embedJpg(jpg);
          sida.drawImage(bild, { x: MARG, y: A4.h - y0 - kartH, width: B, height: kartH });
          // Lätt ljusare slöja så att prickarna syns mot mörk skog.
          // Mörkare slöja: prickarna ska bära bilden, inte skogen (vita friska träd och röd röta syns mot den).
          sida.drawRectangle({ x: MARG, y: A4.h - y0 - kartH, width: B, height: kartH, color: rgb(0, 0, 0), opacity: 0.3 });
          harFoto = true;
        } catch { fotoSaknas = true; }
      } else fotoSaknas = true;
    }
    const r = prickRadie(punkter.length, B, kartH, 0.6, 2.2);
    const fargCache = new Map<string, { fyll: Farg; kant: Farg | undefined }>();
    const stil = (t: string | null) => {
      const nyckel = t ?? '';
      let f = fargCache.get(nyckel);
      if (!f) {
        const namn = tradslagLabel(t ?? '');
        f = { fyll: c(tradslagFarg(namn)), kant: c('#1c1c1e') };
        fargCache.set(nyckel, f);
      }
      return f;
    };
    // Friska träd: vita på flygfotot, grå på den ljusa reservytan (vitt syns inte mot ljusgrått).
    const vit = c('#ffffff');
    const frisk = harFoto ? vit : c('#8e8e93');
    for (const p of punkter) {
      const pos = { x: MARG + p.x, y: A4.h - (y0 + p.y) };
      if (lage === 'rota') {
        if (p.s.rot_typ == null) sida.drawCircle({ ...pos, size: r, color: frisk, opacity: 0.8 });
        else sida.drawCircle({ ...pos, size: r * ROT_FAKTOR, color: F.rod });
      } else {
        const f = stil(p.s.tradslag);
        sida.drawCircle({ ...pos, size: r, color: f.fyll, borderColor: f.kant, borderWidth: 0.25 });
      }
    }
    y = y0 + kartH + 12;
    if (fotoSaknas) { text('Flygfotot gick inte att hämta – prickarna visar var träden stod.', MARG, y, STEG.micro, normal, F.sek); y += STEG.micro + 10; }
    // Teckenförklaring — färgen bär aldrig ensam.
    let x = MARG;
    const del = (namn: string, fyll: string | null, ring?: boolean) => {
      if (ring) sida.drawCircle({ x: x + 5, y: A4.h - (y + 5), size: 4, borderColor: F.rod, borderWidth: 1.2 });
      else if (fyll) prick(x + 5, y + 5, 4.5, fyll);
      text(namn, x + 14, y, STEG.micro, normal, F.sek);
      x += 14 + bredd(namn, STEG.micro, normal) + 16;
    };
    if (lage === 'rota') {
      del('Gran med röta', FARG.rod);
      del('Friskt träd', harFoto ? '#ffffff' : '#8e8e93');
    } else {
      del('Gran', tradslagFarg('Gran'));
      del('Tall', tradslagFarg('Tall'));
      del('Björk', TRADSLAG_STIL['Björk'].fyll);
      del('Annat löv', TRADSLAG_STIL['Övrigt löv'].fyll);
    }
  }

  // ── Sidfot på varje sida ──────────────────────────────────────────────────
  sidor.forEach((s, i) => {
    const t = sanera(`Kompersmåla Skog · Markägarrapport ${vy.namn}${sidor.length > 1 ? ` · sida ${i + 1} av ${sidor.length}` : ''}`);
    const w = normal.widthOfTextAtSize(t, STEG.micro);
    s.drawText(t, { x: (A4.b - w) / 2, y: A4.h - FOT_Y, size: STEG.micro, font: normal, color: F.sek });
  });
  return doc.save();
}
