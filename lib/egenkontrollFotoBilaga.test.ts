import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Egenkontroll, EgenkontrollFoto, EgenkontrollPunkt } from './egenkontroll';
import { byggRapport, type RapportIndata } from './egenkontrollRapport';
import { FOTO_RUTA, skapaBilagaPdf, san } from './egenkontrollRapportPdf';
import { ritaFotoNoteringar, type FotoNotering } from './egenkontrollFotoPdf';
import { FOTO_ETIKETT_PDF_ANDEL, fotoEtikettMatt } from './egenkontrollFotoEtikett';
import type { Notering } from './egenkontrollNotering';

// PR 9b: bilagan i layout E (ETT foto per sida, 3:4, 496 x 662 pt) och noteringarna pa fotona. RAPPORTEN TAR BARA avsikt = 'blev'
// (Martin 2026-10-21) - ocksa pa foton. Det som far ga sonder tyst:
//  - en 'skulle'-notering pa ett foto hamnar i PDF:en,
//  - fotot ritas mindre an rutan (tva per sida igen) eller bildtexten tappar sin plats under bilden,
//  - etiketten ritas i fel storlek (3,2 % av uppritad bredd) eller utanfor bilden,
//  - ett foto som bara har en notering (och sitter pa en "bra" punkt) forsvinner ur bilagan.

const A4_H = 841.89;
const MARG = 48;

/** Ett giltigt PNG, w x h pixlar, enfargat grått: tillrackligt for att pdf-lib ska bädda in det med ratt proportioner. */
function png(w: number, h: number): Uint8Array {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (typ: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(typ), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const rad = Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 160)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => rad));
  return Uint8Array.from(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const RUNDA = {
  id: 'e1', objekt_id: 'o1', objekt_typ: 'slutavverkning', status: 'klar', utford_av: 'Martin',
  startad: '2026-10-12T05:30:00Z', klar: '2026-10-12T11:30:00Z', kommentar: null, vader: null, maskiner: null, skapad: '',
} as unknown as Egenkontroll;

let nr = 0;
const punkt = (o: Partial<EgenkontrollPunkt> & { rubrik: string }): EgenkontrollPunkt => ({
  id: `p${++nr}`, egenkontroll_id: 'e1', ordning: nr, del: 'utforande', grupp: null, kalla: 'fast', markering_id: null, markering_marker_id: null,
  punkt_typ: null, antal_planerat: null, geometri_snapshot: null, plan_kommentar: null, status: 'bra', avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: '2026-10-12T08:00:00Z', ...o,
}) as EgenkontrollPunkt;

const foto = (id: string, punktId: string): EgenkontrollFoto => ({
  id, egenkontroll_id: 'e1', punkt_id: punktId, provyta_id: null, sokvag: `e1/${id}.jpg`, tackningsgrad: null,
  lat: null, lng: null, tagen: null, skapad: `2026-10-12T09:00:0${id.length}Z`,
}) as EgenkontrollFoto;

const indata = (o: Partial<RapportIndata> = {}): RapportIndata => ({
  objektNamn: 'Aramo Marcus AU 2026', voNummer: '886788', runda: RUNDA, punkter: [], observationer: [], foton: [],
  provytor: [], platser: {}, traktgrans: [], stammar: [], antalStammar: null, hyttspar: [], markeringar: [], areal: null, ...o,
});

const nt = (id: string, fotoId: string, o: Partial<Notering> = {}): Notering => ({
  id, egenkontroll_id: 'e1', underlag: 'foto', foto_id: fotoId, typ: 'punkt', pil: false, etikett: 'Kulturlämning', avsikt: 'blev',
  koordinater: [[0.5, 0.5]], etikett_dx: null, etikett_dy: null, skapad: `2026-10-12T0${id.length}:00:00Z`, andrad: '', ...o,
});

async function sidor(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: false });
  return text as string[];
}

describe('layout E: geometrin', () => {
  it('rutan är 3:4 stående, fyller sidans bredd (≈99 %) och bildtexten ryms under den inom nedre marginalen', () => {
    expect(FOTO_RUTA.b / FOTO_RUTA.h).toBeCloseTo(3 / 4, 6);
    expect(FOTO_RUTA.b).toBeCloseTo(496.4, 1);
    expect(FOTO_RUTA.h).toBeCloseTo(661.9, 1);
    expect(FOTO_RUTA.b / (595.28 - 2 * MARG)).toBeGreaterThan(0.99);
    // bildtext: 8 pt under bilden + tre rader à 10,5 × 1,35
    const nederkant = FOTO_RUTA.top + FOTO_RUTA.h + 8 + 2 * 10.5 * 1.35 + 10.5;
    expect(nederkant).toBeLessThanOrEqual(A4_H - MARG);
  });
  it('etikettens textstorlek är 3,2 % av uppritad bredd: 15,9 pt i layout E', () => {
    expect(FOTO_ETIKETT_PDF_ANDEL * FOTO_RUTA.b).toBeCloseTo(15.9, 1);
  });
});

describe('bilagan: ett foto per sida', () => {
  const m = (extra: Partial<RapportIndata> = {}) => {
    const a = punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Basväg över stenmuren', lat: 56.1, lng: 15.1 });
    const b = punkt({ rubrik: 'Kantzon', status: 'battre', lat: 56.101, lng: 15.101 });
    const c = punkt({ rubrik: 'Körspår', status: 'battre', lat: 56.102, lng: 15.102 });
    return byggRapport(indata({ punkter: [a, b, c], foton: [foto('a', a.id), foto('bb', b.id), foto('ccc', c.id)], ...extra }));
  };

  it('tre foton blir tre sidor efter kartan — aldrig två på en sida — och varje sida har sin bildtext', async () => {
    const s = await sidor(await skapaBilagaPdf(m(), async () => ({ bytes: png(30, 40), typ: 'png' })));
    expect(s).toHaveLength(4);
    expect(s[1]).toContain('Basväg över stenmuren');
    expect(s[2]).toContain('Kantzon');
    expect(s[3]).toContain('Körspår');
    expect(s[1]).not.toContain('Kantzon');
    s.forEach((t, i) => expect(t).toContain(`Sida ${i + 1} av 4`));
  });

  it('ett foto i annan form (liggande) ritas inpassat i samma ruta, med bildtexten direkt under', async () => {
    const lib = await import('pdf-lib');
    const pdf = await skapaBilagaPdf(m(), async () => ({ bytes: png(40, 30), typ: 'png' }));
    const doc = await lib.PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(4);
  });
});

describe('fotonoteringar i modellen', () => {
  const a = punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Basväg över stenmuren', lat: 56.1, lng: 15.1 });
  const f = foto('a', a.id);
  const bas = (noteringar: Notering[]) => byggRapport(indata({ punkter: [a], foton: [f], noteringar }));

  it('en blev-notering på ett foto följer med bilden, med [u, v] och sparad förskjutning', () => {
    const m = bas([nt('n1', 'a', { etikett_dx: 0.1, etikett_dy: -0.05 })]);
    expect(m.bilaga.bilder[0].noteringar).toEqual([
      { id: 'n1', typ: 'punkt', pil: false, etikett: 'Kulturlämning', avsikt: 'blev', punkter: [[0.5, 0.5]], dx: 0.1, dy: -0.05 },
    ]);
  });

  it('"SKULLE" GÅR ALDRIG TILL VIDA — inte heller på ett foto: modellen släpper den inte igenom', () => {
    const m = bas([nt('n1', 'a'), nt('n2', 'a', { avsikt: 'skulle', etikett: 'Borde ha körts här' })]);
    expect(m.bilaga.bilder[0].noteringar.map((x) => x.id)).toEqual(['n1']);
    expect(JSON.stringify(m)).not.toContain('Borde ha körts');
  });

  it('en kartnotering hamnar inte på ett foto, och en fotonotering inte på kartan', () => {
    const m = bas([nt('k', 'a', { underlag: 'karta', foto_id: null, koordinater: [[15.1, 56.1]] }), nt('f', 'a')]);
    expect(m.bilaga.bilder[0].noteringar.map((x) => x.id)).toEqual(['f']);
    expect(m.karta.noteringar.map((x) => x.id)).toEqual(['k']);
  });

  it('en notering med koordinater utanför 0..1 släpps (databasen tillåter det inte; ett läsfel får inte ge en etikett utanför bilden)', () => {
    const m = bas([nt('x', 'a', { koordinater: [[1.4, 0.5]] })]);
    expect(m.bilaga.bilder[0].noteringar).toEqual([]);
  });

  it('en notering på ett foto som inte kommer med i bilagan syns inte — men ett foto på en bra punkt MED notering kommer med (noteringen är texten)', () => {
    const bra = punkt({ rubrik: 'Högstubbar', status: 'bra' });
    const fb = foto('bb', bra.id);
    const utan = byggRapport(indata({ punkter: [bra], foton: [fb], noteringar: [] }));
    expect(utan.bilaga.bilder).toHaveLength(0);
    expect(utan.bilaga.utanText).toBe(1);
    const med = byggRapport(indata({ punkter: [bra], foton: [fb], noteringar: [nt('n', 'bb', { etikett: 'Högstubbe, ca 4 m' })] }));
    expect(med.bilaga.bilder).toHaveLength(1);
    expect(med.bilaga.bilder[0].text).toBe('Högstubbar');
    expect(med.bilaga.utanText).toBe(0);
    // men en skulle-notering är inte text som rapporten tar: fotot kommer inte med för den skull
    const skulle = byggRapport(indata({ punkter: [bra], foton: [fb], noteringar: [nt('n', 'bb', { avsikt: 'skulle' })] }));
    expect(skulle.bilaga.bilder).toHaveLength(0);
    expect(skulle.bilaga.utanText).toBe(1);
  });

  it('en notering räknas aldrig: talen och fynden är desamma med och utan', () => {
    const utan = bas([]);
    const med = bas([nt('n1', 'a'), nt('n2', 'a', { avsikt: 'skulle' })]);
    expect(med.tal).toEqual(utan.tal);
    expect(med.avvikelser).toEqual(utan.avvikelser);
  });
});

describe('ritaFotoNoteringar (fejkad sida som spelar in varje anrop)', () => {
  async function rita(noteringar: FotoNotering[], ruta = { x: 48, top: 76, b: 496.4, h: 661.9 }) {
    const lib = await import('pdf-lib');
    const anrop: { metod: string; arg: any; opt: any }[] = [];
    const sida: any = new Proxy({}, { get: (_t, metod: string) => (arg: any, opt: any) => { anrop.push({ metod, arg, opt }); } });
    const font: any = { widthOfTextAtSize: (t: string) => t.length * 4 };
    const ritade = ritaFotoNoteringar(lib, sida, { normal: font }, ruta, noteringar, san);
    return { ritade, anrop };
  }
  const fn = (id: string, o: Partial<FotoNotering> = {}): FotoNotering => ({
    id, typ: 'punkt', pil: false, etikett: 'Kulturlämning', avsikt: 'blev', punkter: [[0.5, 0.5]], dx: null, dy: null, ...o,
  });
  const text = (a: { metod: string; arg: any; opt: any }[]) => a.filter((x) => x.metod === 'drawText');

  it('etiketten ritas i 3,2 % av fotots uppritade bredd — 15,9 pt på 496 pt, och följer bredden på ett mindre foto', async () => {
    const { anrop } = await rita([fn('a')]);
    const t = text(anrop);
    expect(t).toHaveLength(1);
    expect(t[0].arg).toBe('Kulturlämning');
    expect(t[0].opt.size).toBeCloseTo(15.88, 1);
    const liten = await rita([fn('a')], { x: 48, top: 76, b: 250, h: 333 });
    expect(text(liten.anrop)[0].opt.size).toBeCloseTo(8, 6);
  });

  it('en skulle-notering ritas aldrig, vem som än skickar in den', async () => {
    const { ritade, anrop } = await rita([fn('a', { avsikt: 'skulle' as never, etikett: 'Borde gått här' }), fn('b')]);
    expect(ritade).toBe(1);
    expect(text(anrop).map((x) => x.arg)).toEqual(['Kulturlämning']);
  });

  it('en linje ritas som kant + linje, en pil får dessutom en pilspets, en punkt en cirkel', async () => {
    const { anrop } = await rita([
      fn('p'),
      fn('l', { typ: 'linje', etikett: 'Linje', punkter: [[0.1, 0.1], [0.4, 0.3]] }),
      fn('a', { typ: 'linje', pil: true, etikett: 'Pil', punkter: [[0.2, 0.6], [0.8, 0.7]] }),
    ]);
    const bana = anrop.filter((x) => x.metod === 'drawSvgPath');
    expect(bana.filter((x) => typeof x.arg === 'string' && x.arg.includes(' A ')).length).toBe(1);
    expect(bana.filter((x) => typeof x.arg === 'string' && x.arg.endsWith('Z') && x.arg.split(' L ').length === 3 && !x.arg.includes(' Q ')).length).toBe(1);
    expect(text(anrop).map((x) => x.arg).sort()).toEqual(['Kulturlämning', 'Linje', 'Pil']);
  });

  it('en etikett vars sparade förskjutning ligger utanför bilden klämmer in sig — ingen text ritas utanför fotot', async () => {
    const ruta = { x: 48, top: 76, b: 496.4, h: 661.9 };
    const { anrop } = await rita([fn('a', { punkter: [[0.95, 0.97]], dx: 1.9, dy: 1.9 })], ruta);
    const t = text(anrop)[0];
    expect(t.opt.x).toBeGreaterThanOrEqual(ruta.x);
    expect(t.opt.x).toBeLessThanOrEqual(ruta.x + ruta.b);
    // pdf-lib-y är nedifrån: texten ska ligga mellan bildens över- och underkant
    expect(t.opt.y).toBeGreaterThanOrEqual(841.89 - ruta.top - ruta.h);
    expect(t.opt.y).toBeLessThanOrEqual(841.89 - ruta.top);
  });

  it('etikettens ruta är modellens ruta × bildens bredd (PDF-andelen, inte en annan): bredd och höjd stämmer med fotoEtikettMatt', async () => {
    const { anrop } = await rita([fn('a')]);
    const bana = anrop.find((x) => x.metod === 'drawSvgPath' && typeof x.arg === 'string' && x.arg.includes(' Q '))!;
    const tal = (bana.arg as string).match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = tal.filter((_, i) => i % 2 === 0), ys = tal.filter((_, i) => i % 2 === 1);
    const m = fotoEtikettMatt('Kulturlämning', FOTO_ETIKETT_PDF_ANDEL)!;
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(m.ruta.bredd * 496.4, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(m.ruta.hojd * 496.4, 1);
  });

  it('en punkt vid v = 0,5 ritas på HALVA bildens höjd (v är en andel av höjden, inte av bredden)', async () => {
    const ruta = { x: 48, top: 76, b: 496.4, h: 661.9 };
    const { anrop } = await rita([fn('a', { punkter: [[0.25, 0.5]] })], ruta);
    const ring = anrop.find((x) => x.metod === 'drawSvgPath' && typeof x.arg === 'string' && x.arg.includes(' A '))!;
    const [mx, my] = (ring.arg as string).match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(my).toBeCloseTo(ruta.top + 0.5 * ruta.h, 1);
    expect(mx).toBeGreaterThan(ruta.x + 0.25 * ruta.b);       // början av cirkelbanan ligger r till höger om mitten
    expect(mx - 0.008 * ruta.b).toBeCloseTo(ruta.x + 0.25 * ruta.b, 1);
  });

  it('allt klipps mot bilden (grafiktillstånd med klippning, återställt efteråt)', async () => {
    const { anrop } = await rita([fn('a')]);
    const ops = anrop.filter((x) => x.metod === 'pushOperators');
    expect(ops).toHaveLength(2);
  });

  it('inga noteringar = inget ritat och inget klipp', async () => {
    const { ritade, anrop } = await rita([]);
    expect(ritade).toBe(0);
    expect(anrop).toHaveLength(0);
  });
});

describe('ett LIGGANDE foto i bilagan: etiketten ligger på bilden, inte i rutan runt den', () => {
  it('textens y-läge ligger innanför bildens uppritade yta (496 × 372 pt), inte mitt i den 662 pt höga rutan', async () => {
    const a = punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Basväg', lat: 56.1, lng: 15.1 });
    const m = byggRapport(indata({ punkter: [a], foton: [foto('a', a.id)], noteringar: [nt('n1', 'a', { etikett: 'Stenmur', koordinater: [[0.5, 0.9]] })] }));
    const pdf = await skapaBilagaPdf(m, async () => ({ bytes: png(40, 30), typ: 'png' }));
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const sida = await doc.getPage(2);
    const innehall = await sida.getTextContent();
    const it = (innehall.items as any[]).find((x) => x.str === 'Stenmur' && x.height > 12)!;   // etiketten (15,9 pt), inte bildtexten (10,5 pt)
    const yFranTopp = 841.89 - it.transform[5];
    const bildH = 496.4 * 0.75;                 // liggande 4:3 i en ruta som är 496,4 bred
    expect(yFranTopp).toBeGreaterThan(76);
    expect(yFranTopp).toBeLessThan(76 + bildH + 1);
  });
});

describe('bilagan som riktig PDF: etiketterna syns i texten, skulle gör det inte', () => {
  it('"Kulturlämning" står på fotots sida; "Borde gått här" står ingenstans', async () => {
    const a = punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Basväg över stenmuren', lat: 56.1, lng: 15.1 });
    const b = punkt({ rubrik: 'Kantzon', status: 'battre', lat: 56.101, lng: 15.101 });
    const m = byggRapport(indata({
      punkter: [a, b], foton: [foto('a', a.id), foto('bb', b.id)],
      noteringar: [nt('n1', 'a'), nt('n2', 'a', { avsikt: 'skulle', etikett: 'Borde gått här' }), nt('n3', 'bb', { typ: 'linje', pil: true, etikett: 'Drivningsriktning', koordinater: [[0.2, 0.2], [0.7, 0.4]] })],
    }));
    const s = await sidor(await skapaBilagaPdf(m, async () => ({ bytes: png(30, 40), typ: 'png' })));
    expect(s).toHaveLength(3);
    expect(s[1]).toContain('Kulturlämning');
    expect(s[2]).toContain('Drivningsriktning');
    expect(s.join('\n')).not.toContain('Borde gått här');
    expect(s[2]).not.toContain('Kulturlämning');
  });
});
