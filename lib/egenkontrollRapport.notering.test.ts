import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Egenkontroll, EgenkontrollPunkt } from './egenkontroll';
import { byggRapport, type RapportIndata } from './egenkontrollRapport';
import { skapaRapportPdf } from './egenkontrollRapportPdf';
import type { Notering } from './egenkontrollNotering';

// Noteringarna i A4-rapportens karta (PR 9a). RAPPORTEN TAR BARA avsikt = 'blev' (Martin 2026-10-21): en "skulle"-linje ovanpa hyttsparet ar
// ett daterat och positionsbestamt medgivande till kunden. Det som far ga sonder tyst:
//  - en 'skulle'-notering hamnar i PDF:en (karta, etikett eller teckenforklaring),
//  - en notering raknas i talen, far ett lopnummer eller hamnar bland fynden (den forklarar bara vad man tittar pa),
//  - kartan sager ingenting nar noteringarna inte gick att lasa (tyst karta utan det besiktaren ritat),
//  - etiketten fattas pa sida 1, eller teckenforklaringen saknar raden for en avsikt som finns.

const RUNDA = {
  id: 'e1', objekt_id: 'o1', objekt_typ: 'slutavverkning', status: 'klar', utford_av: 'Martin',
  startad: '2026-10-12T05:30:00Z', klar: '2026-10-12T11:30:00Z', kommentar: null, vader: null, maskiner: null, skapad: '',
} as unknown as Egenkontroll;

const punkt = (id: string, over: Partial<EgenkontrollPunkt> = {}): EgenkontrollPunkt => ({
  id, egenkontroll_id: 'e1', ordning: 1, del: 'utforande', grupp: null, kalla: 'fast', markering_id: null, markering_marker_id: null,
  punkt_typ: null, antal_planerat: null, geometri_snapshot: null, plan_kommentar: null, status: 'bra', avvikelse_typ: null, kommentar: null,
  varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: '2026-10-12T08:00:00Z', rubrik: `P ${id}`, ...over,
}) as EgenkontrollPunkt;

const GRANS = [[
  { lat: 56.0, lng: 14.0 }, { lat: 56.0, lng: 14.02 }, { lat: 56.012, lng: 14.02 }, { lat: 56.012, lng: 14.0 },
]];
const indata = (o: Partial<RapportIndata> = {}): RapportIndata => ({
  objektNamn: 'Aramo Marcus AU 2026', voNummer: '886788', runda: RUNDA, punkter: [punkt('a')], observationer: [], foton: [],
  provytor: [], platser: {}, traktgrans: GRANS, stammar: [], antalStammar: null, hyttspar: [], markeringar: [], areal: null, ...o,
});

const n = (id: string, over: Partial<Notering> = {}): Notering => ({
  id, egenkontroll_id: 'e1', underlag: 'karta', foto_id: null, typ: 'punkt', pil: false, etikett: 'Stenmur', avsikt: 'blev',
  koordinater: [[14.01, 56.005]], etikett_dx: null, etikett_dy: null, skapad: `2026-10-12T0${id.length}:00:00Z`, andrad: '', ...over,
});

async function sida1(m: ReturnType<typeof byggRapport>): Promise<string> {
  const pdf = await skapaRapportPdf(m);
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: false });
  return (text as string[])[0];
}

describe('modellen', () => {
  it('noteringarna finns i kartan, i den ordning de gavs, med punkter som lat/lng', () => {
    const m = byggRapport(indata({ noteringar: [
      n('a'), n('b', { typ: 'linje', pil: true, etikett: 'Drivning', koordinater: [[14.002, 56.002], [14.012, 56.009]] }),
    ] }));
    expect(m.karta.noteringar.map((x) => x.id)).toEqual(['a', 'b']);
    expect(m.karta.noteringar[1]).toMatchObject({ typ: 'linje', pil: true, avsikt: 'blev', punkter: [{ lat: 56.002, lng: 14.002 }, { lat: 56.009, lng: 14.012 }] });
  });

  it('"SKULLE" GAR ALDRIG TILL VIDA: en skulle-notering finns inte i rapportmodellen, inte i teckenforklaringen och inte som anmarkning', () => {
    const m = byggRapport(indata({ noteringar: [
      n('blev1'),
      n('skulle1', { avsikt: 'skulle', etikett: 'Basvägen skulle gått här' }),
      n('skulle2', { typ: 'linje', pil: true, avsikt: 'skulle', etikett: 'Så borde det ha körts', koordinater: [[14.002, 56.002], [14.012, 56.009]] }),
    ] }));
    expect(m.karta.noteringar.map((x) => x.id)).toEqual(['blev1']);
    expect(JSON.stringify(m)).not.toContain('skulle');
    expect(JSON.stringify(m)).not.toContain('Basvägen');
    // bara skulle-noteringar: ingen notering alls, ingen teckenforklaringsrad, ingen anmarkning om att nagot hoppats over
    const bara = byggRapport(indata({ noteringar: [n('s', { avsikt: 'skulle' })] }));
    expect(bara.karta.noteringar).toEqual([]);
    expect(bara.karta.teckenforklaring.map((t) => t.nyckel).some((k) => k.startsWith('notering'))).toBe(false);
    expect(bara.karta.anmarkningar.join(' ')).not.toMatch(/notering/i);
  });

  it('en notering raknas ALDRIG: talen, fynden och lopnumren ar desamma med och utan', () => {
    const utan = byggRapport(indata());
    const med = byggRapport(indata({ noteringar: [n('a'), n('b'), n('c', { avsikt: 'skulle' })] }));
    expect(med.tal).toEqual(utan.tal);
    expect(med.avvikelser).toEqual(utan.avvikelser);
    expect(med.observationer).toEqual(utan.observationer);
    expect(med.karta.pinnar).toEqual(utan.karta.pinnar);
  });

  it('teckenforklaringen har EN rad for noteringar nar det finns nagon, och ingen annars — aldrig en rad for "skulle"', () => {
    const bada = byggRapport(indata({ noteringar: [n('a'), n('b', { avsikt: 'skulle' })] })).karta.teckenforklaring.map((t) => t.nyckel);
    expect(bada).toContain('notering:blev');
    expect(bada).not.toContain('notering:skulle');
    expect(byggRapport(indata()).karta.teckenforklaring.map((t) => t.nyckel).some((k) => k.startsWith('notering'))).toBe(false);
  });

  it('noteringar som inte gick att lasa (null) ar ett FEL under kartan, aldrig en tyst karta', () => {
    const m = byggRapport(indata({ noteringar: null }));
    expect(m.karta.anmarkningar).toContain('Noteringarna kunde inte läsas.');
    expect(m.karta.noteringar).toEqual([]);
    expect(byggRapport(indata({ noteringar: [] })).karta.anmarkningar).not.toContain('Noteringarna kunde inte läsas.');
    expect(byggRapport(indata()).karta.anmarkningar).not.toContain('Noteringarna kunde inte läsas.');
  });

  it('en fotonotering (9b) ritas inte pa kartan', () => {
    const m = byggRapport(indata({ noteringar: [n('a', { underlag: 'foto', foto_id: 'f1', koordinater: [[0.5, 0.5]] })] }));
    expect(m.karta.noteringar).toEqual([]);
  });
});

describe('sida 1', () => {
  it('etiketterna star pa kartan och teckenforklaringen sager "sa har blev det"', async () => {
    const m = byggRapport(indata({ noteringar: [
      n('a', { etikett: 'Överfart stenmur' }),
      n('c', { typ: 'linje', pil: true, etikett: 'Drivning', koordinater: [[14.004, 56.004], [14.008, 56.004]] }),
    ] }));
    const t = await sida1(m);
    for (const s of ['Överfart stenmur', 'Drivning', 'så här blev det']) expect(t).toContain(s);
  });

  it('"SKULLE" GAR ALDRIG TILL VIDA: ingen text, ingen etikett och ingen teckenforklaring i den riktiga PDF:en (alla sidor)', async () => {
    const pdf = await skapaRapportPdf(byggRapport(indata({ noteringar: [
      n('a', { etikett: 'Stenmur kvar' }),
      n('b', { typ: 'linje', pil: true, avsikt: 'skulle', etikett: 'Basvägen skulle gått här', koordinater: [[14.002, 56.002], [14.012, 56.009]] }),
      n('c', { avsikt: 'skulle', etikett: 'Hit borde stickvägen gå', koordinater: [[14.015, 56.008]] }),
    ] })));
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: true });
    const alla = text as string;
    expect(alla).toContain('Stenmur kvar');                       // blev kommer med
    for (const s of ['Basvägen skulle gått här', 'Hit borde stickvägen gå', 'skulle det gjorts', 'streckad']) expect(alla).not.toContain(s);
  });

  it('en lang text brytes och forsvinner inte, och en karta med trettio noteringar pa samma plats gar att rita', async () => {
    const manga = Array.from({ length: 30 }, (_, i) => n(`n${i}`, { etikett: `Notering nummer ${i}`, koordinater: [[14.01 + (i % 3) * 0.0002, 56.005 + (i % 4) * 0.0002]] }));
    const t = await sida1(byggRapport(indata({ noteringar: [...manga, n('lang', { etikett: 'Det här är en ganska lång notering som måste brytas på flera rader i etiketten på kartan' })] })));
    expect(t).toContain('Notering nummer 0');
    expect(t).toContain('Notering nummer 29');
    expect(t).toContain('ganska');
  });

  it('inga noteringar: ingen rad i teckenforklaringen och ingen skillnad i texten', async () => {
    const t = await sida1(byggRapport(indata()));
    expect(t).not.toContain('Notering:');
  });
});

describe('etikettplaceringen i kartan (planeraNoteringsEtiketter)', () => {
  // identitet: en "karta" i pt, ap = (lat,lng) -> (lng*1000 - 14000, (56.02 - lat)*1000)
  const ap = (p: { lat: number; lng: number }) => ({ x: (p.lng - 14) * 20000, y: (56.02 - p.lat) * 20000 });
  const mat = (t: string) => t.length * 4.5;
  const yta = { x0: 0, y0: 0, x1: 500, y1: 360 };
  const km = (id: string, o: Partial<import('./egenkontrollRapport').KartNotering> = {}): import('./egenkontrollRapport').KartNotering => ({
    id, typ: 'punkt', pil: false, etikett: 'Stenmur', avsikt: 'blev', punkter: [{ lat: 56.01, lng: 14.01 }], ...o,
  });

  it('en etikett ligger aldrig ovanpa en annan notering linje, ankare eller en kontrollpunkts pinne', async () => {
    const { planeraNoteringsEtiketter, linjeHinder } = await import('./egenkontrollRapportKartaPdf');
    const { skar } = await import('./egenkontrollEtikettPlats');
    const linje = km('lin', { typ: 'linje', pil: true, etikett: 'Drivning', punkter: [{ lat: 56.0125, lng: 14.002 }, { lat: 56.0125, lng: 14.012 }] });
    const punkt = km('pkt', { etikett: 'Overfart stenmur', punkter: [{ lat: 56.0123, lng: 14.0095 }] });   // ligger precis dar linjens etikett hade hamnat
    const pinne = { x: 140, y: 150 };
    const m = planeraNoteringsEtiketter([linje, punkt], [pinne], ap, mat, yta);
    const linjeHind = linjeHinder([linje.punkter[0], linje.punkter[1]].map(ap));
    const e = m.get('pkt')!.ruta;
    expect(linjeHind.some((h) => skar(e, h))).toBe(false);                       // inte over den andra noteringens linje
    expect(skar(e, { x0: pinne.x - 9, y0: pinne.y - 9, x1: pinne.x + 9, y1: pinne.y + 9 })).toBe(false);   // inte over pinnen
    expect(skar(e, m.get('lin')!.ruta)).toBe(false);                             // inte over den andra etiketten
  });

  it('en kontrollpunkts pinne ar ett hinder: ligger pinnen dar etiketten skulle hamna flyttas etiketten', async () => {
    const { planeraNoteringsEtiketter } = await import('./egenkontrollRapportKartaPdf');
    const { skar } = await import('./egenkontrollEtikettPlats');
    const punkt = km('pkt', { etikett: 'Stenmur' });
    const fri = planeraNoteringsEtiketter([punkt], [], ap, mat, yta).get('pkt')!.ruta;
    const pinne = { x: (fri.x0 + fri.x1) / 2, y: (fri.y0 + fri.y1) / 2 };
    const med = planeraNoteringsEtiketter([punkt], [pinne], ap, mat, yta).get('pkt')!.ruta;
    expect(skar(med, { x0: pinne.x - 9, y0: pinne.y - 9, x1: pinne.x + 9, y1: pinne.y + 9 })).toBe(false);
    expect(med).not.toEqual(fri);
  });

  it('linjeHinder tackar hela linjen tat: ingen lucka storre an en rektangel', async () => {
    const { linjeHinder } = await import('./egenkontrollRapportKartaPdf');
    const h = linjeHinder([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(h.length).toBeGreaterThanOrEqual(20);
    expect(h[0].x0).toBeLessThan(0);
    expect(h[h.length - 1].x1).toBeGreaterThan(100);
    for (let i = 1; i < h.length; i++) expect(h[i].x0).toBeLessThanOrEqual(h[i - 1].x1);   // ihangande
  });

  it('en etikett utan ankare (ingen punkt) far ingen plats och kraschar inte', async () => {
    const { planeraNoteringsEtiketter } = await import('./egenkontrollRapportKartaPdf');
    expect(planeraNoteringsEtiketter([km('x', { punkter: [] })], [], ap, mat, yta).size).toBe(0);
  });
});

describe('ritaKarta ritar noteringarna (fejkad sida som spelar in varje anrop)', () => {
  async function rita(noteringar: import('./egenkontrollRapport').KartNotering[], pinnar: { nr: number; rubrik: string; plats: { lat: number; lng: number } }[] = []) {
    const lib = await import('pdf-lib');
    const { ritaKarta } = await import('./egenkontrollRapportKartaPdf');
    const anrop: { metod: string; arg: any; opt: any }[] = [];
    const sida: any = new Proxy({}, { get: (_t, metod: string) => (arg: any, opt: any) => { anrop.push({ metod, arg, opt }); } });
    const font: any = { widthOfTextAtSize: (t: string) => t.length * 4 };
    ritaKarta(lib, sida, { normal: font, fet: font }, { x: 48, top: 100, b: 499, h: 300 }, { granser: GRANS, stammar: [], pinnar, noteringar }, (t) => t);
    return anrop;
  }
  const kn = (id: string, o: Partial<import('./egenkontrollRapport').KartNotering> = {}): import('./egenkontrollRapport').KartNotering => ({
    id, typ: 'punkt', pil: false, etikett: `Text ${id}`, avsikt: 'blev', punkter: [{ lat: 56.005, lng: 14.01 }], ...o,
  });
  const dashade = (a: { metod: string; opt: any }[]) => a.filter((x) => x.metod === 'drawSvgPath' && Array.isArray(x.opt?.borderDashArray) && x.opt.borderDashArray.join() === '4,2.5');

  it('en linje ritas som kant + linje, en pil far dessutom en pilspets, en punkt en cirkel och varje etikett sin text', async () => {
    const anrop = await rita([
      kn('p'),
      kn('l', { typ: 'linje', punkter: [{ lat: 56.002, lng: 14.002 }, { lat: 56.009, lng: 14.012 }] }),
      kn('a', { typ: 'linje', pil: true, punkter: [{ lat: 56.003, lng: 14.003 }, { lat: 56.004, lng: 14.015 }] }),
    ]);
    const bana = anrop.filter((x) => x.metod === 'drawSvgPath');
    const linjer = bana.filter((x) => typeof x.arg === 'string' && x.arg.startsWith('M') && x.arg.includes(' L ') && !x.arg.endsWith('Z'));
    expect(linjer.length).toBeGreaterThanOrEqual(4);                                     // 2 linjer x (kant + linje)
    expect(bana.filter((x) => typeof x.arg === 'string' && x.arg.includes(' A ')).length).toBe(1);   // punkten
    expect(bana.filter((x) => typeof x.arg === 'string' && x.arg.endsWith('Z') && x.arg.split(' L ').length === 3 && !x.arg.includes(' Q ')).length).toBe(1);   // pilspetsen (triangel)
    expect(anrop.filter((x) => x.metod === 'drawText').map((x) => x.arg).filter((t) => t.startsWith('Text ')).sort()).toEqual(['Text a', 'Text l', 'Text p']);
  });

  it('"blev" ritas heldragen, och ritaren ritar ALDRIG en "skulle" ens om en skickas in (skyddsnat bakom modellens filter)', async () => {
    const blev = await rita([kn('l', { typ: 'linje', punkter: [{ lat: 56.002, lng: 14.002 }, { lat: 56.009, lng: 14.012 }] })]);
    expect(dashade(blev)).toHaveLength(0);
    const skulle = await rita([{ ...kn('s', { typ: 'linje', etikett: 'Text skulle', punkter: [{ lat: 56.002, lng: 14.002 }, { lat: 56.009, lng: 14.012 }] }), avsikt: 'skulle' } as unknown as import('./egenkontrollRapport').KartNotering]);
    const utan = await rita([]);
    expect(skulle).toHaveLength(utan.length);                                            // ingenting alls ritades
    expect(skulle.filter((x) => x.metod === 'drawText' && String(x.arg).includes('Text skulle'))).toHaveLength(0);
  });

  it('inga noteringar: ingenting extra ritas', async () => {
    const utan = await rita([]);
    const med = await rita([kn('p')]);
    expect(med.length).toBeGreaterThan(utan.length);
  });

  it('en etikett vid kartans kant flyttas in: ingen text hamnar utanfor rutan', async () => {
    const anrop = await rita([kn('kant', { punkter: [{ lat: 56.0121, lng: 14.0201 }], etikett: 'En ganska lang etikett vid hornet' })]);
    for (const t of anrop.filter((x) => x.metod === 'drawText')) {
      expect(t.opt.x).toBeGreaterThanOrEqual(48);
      expect(t.opt.x).toBeLessThanOrEqual(48 + 499);
    }
  });
});
