import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Egenkontroll, EgenkontrollFoto, EgenkontrollPunkt } from './egenkontroll';
import { byggRapport, type RapportIndata } from './egenkontrollRapport';
import { brytText, projicera, skalstock, skapaBilagaPdf, skapaRapportPdf } from './egenkontrollRapportPdf';
import { backvagStreckPt, kartaHojd, ritaKarta, ritaTeckenforklaring } from './egenkontrollRapportKartaPdf';
import { markeringsStil } from './egenkontrollRapportKarta';

let n = 0;
const punkt = (o: Partial<EgenkontrollPunkt> & { rubrik: string }): EgenkontrollPunkt => ({
  id: `p${++n}`, egenkontroll_id: 'e1', ordning: n, del: 'utforande', grupp: null, kalla: 'fast', markering_id: null,
  markering_marker_id: null, punkt_typ: null, antal_planerat: null, geometri_snapshot: null, plan_kommentar: null,
  status: 'bra', avvikelse_typ: null, kommentar: null, varde_foreslaget: null, varde_bekraftat: null, lat: null,
  lng: null, besvarad: '2026-10-12T08:00:00Z', ...o,
}) as EgenkontrollPunkt;

const RUNDA = {
  id: 'e1', objekt_id: 'o1', objekt_typ: 'slutavverkning', status: 'klar', utford_av: 'Martin',
  startad: '2026-10-12T05:30:00Z', klar: '2026-10-12T11:30:00Z', kommentar: null, vader: null, maskiner: null, skapad: '',
} as unknown as Egenkontroll;

const indata = (o: Partial<RapportIndata> = {}): RapportIndata => ({
  objektNamn: 'Aramo Marcus AU 2026', voNummer: '886788', runda: RUNDA, punkter: [], observationer: [], foton: [],
  provytor: [], platser: {}, traktgrans: [], stammar: [], antalStammar: null, hyttspar: [], markeringar: [], areal: null, ...o,
});

async function sidor(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: false });
  return text as string[];
}

// En liten giltig JPEG (1x1) - ritaren ska bara bädda in den.
const JPEG_1X1 = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
));

describe('brytText', () => {
  const mat = (t: string) => t.length * 5;
  it('ingen rad blir bredare an bredden, och inget ord tappas', () => {
    const rader = brytText('Basväg över stenmuren på två platser och muren är påverkad', 100, mat);
    expect(rader.every((r) => mat(r) <= 100)).toBe(true);
    expect(rader.join(' ')).toBe('Basväg över stenmuren på två platser och muren är påverkad');
  });
  it('ett ord som är bredare än raden bryts tecken för tecken i stället för att rinna över', () => {
    const rader = brytText('Superkalifragilistiskexpialidocious', 50, mat);
    expect(rader.length).toBeGreaterThan(1);
    expect(rader.every((r) => mat(r) <= 50)).toBe(true);
    expect(rader.join('')).toBe('Superkalifragilistiskexpialidocious');
  });
  it('tom text ger inga rader', () => {
    expect(brytText('   ', 100, mat)).toEqual([]);
  });
});

describe('vektorkartan', () => {
  it('projicerar allt inom rutan och bevarar proportionerna (längdgrad skalas med cos(lat))', () => {
    const p = [{ lat: 56, lng: 15 }, { lat: 56.01, lng: 15 }, { lat: 56.01, lng: 15.02 }];
    const { till, meterPerPt } = projicera(p, 400, 300, 10);
    for (const q of p.map(till)) {
      expect(q.x).toBeGreaterThanOrEqual(10 - 1e-6); expect(q.x).toBeLessThanOrEqual(390 + 1e-6);
      expect(q.y).toBeGreaterThanOrEqual(10 - 1e-6); expect(q.y).toBeLessThanOrEqual(290 + 1e-6);
    }
    // 0,02° längdgrad vid 56° nord = 0,02 × 111 320 × cos(56°) ≈ 1 245 m; 0,01° latitud = 1 113 m.
    const a = till(p[0]), b = till(p[1]), c = till(p[2]);
    const meterX = Math.abs(c.x - b.x) * meterPerPt, meterY = Math.abs(a.y - b.y) * meterPerPt;
    expect(meterX).toBeCloseTo(0.02 * 111320 * Math.cos((56.0067 * Math.PI) / 180), -1);
    expect(meterY).toBeCloseTo(0.01 * 111320, -1);
    expect(b.y).toBeLessThan(a.y); // norr är uppåt
  });
  it('en ensam punkt går att rita (ingen division med noll)', () => {
    const { till } = projicera([{ lat: 56, lng: 15 }], 400, 300);
    const q = till({ lat: 56, lng: 15 });
    expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true);
  });
  it('skalstocken är den största runda längden som ryms', () => {
    expect(skalstock(1.9, 120)).toEqual({ meter: 200, pt: 200 / 1.9 });
    expect(skalstock(0.1, 120).meter).toBe(10);
  });
});

describe('skapaRapportPdf', () => {
  const fyra = [
    punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Basväg över stenmuren' }),
    punkt({ rubrik: 'Kantzon', status: 'battre' }),
  ];

  it('KOMMENTAREN KOMMER SIST - efter förutsättningarna och allt annat', async () => {
    const m = byggRapport(indata({ punkter: fyra, runda: { ...RUNDA, kommentar: 'Bra avverkning.\nBasväg över stenmur.' } }));
    const [s1] = await sidor(await skapaRapportPdf(m));
    const sist = s1.indexOf('KOMMENTAR');
    expect(sist).toBeGreaterThan(s1.indexOf('FÖRUTSÄTTNINGAR'));
    expect(sist).toBeGreaterThan(s1.indexOf('AVVIKELSER'));
    expect(s1.indexOf('Basväg över stenmur.')).toBeGreaterThan(sist);
  });

  it('ingen kommentar: ingen tom ruta och ingen rubrik KOMMENTAR', async () => {
    const [s1] = await sidor(await skapaRapportPdf(byggRapport(indata({ punkter: fyra }))));
    expect(s1).not.toContain('KOMMENTAR');
  });

  it('inga tomma rader: en runda utan avvikelser har ingen rubrik AVVIKELSER, och utkastet säger att det är ett utkast', async () => {
    const m = byggRapport(indata({ punkter: [punkt({ rubrik: 'Kantzon', status: 'bra' })], runda: { ...RUNDA, status: 'pagaende', klar: null } }));
    const [s1] = await sidor(await skapaRapportPdf(m));
    expect(s1).not.toContain('AVVIKELSER');
    expect(s1).not.toContain('KAN BLI BÄTTRE');
    expect(s1).toContain('UTKAST');
  });

  it('en lång lista går över flera sidor och varje sida har sidnummer; kommentaren är fortfarande sist', async () => {
    const manga = Array.from({ length: 40 }, (_, i) => punkt({ rubrik: `Kantzon ${i}`, status: 'battre', kommentar: 'En längre kommentar som tar plats på raden och bryts över flera rader när den inte ryms på en rad i rapporten.' }));
    const m = byggRapport(indata({ punkter: manga, runda: { ...RUNDA, kommentar: 'Slutord.' } }));
    const s = await sidor(await skapaRapportPdf(m));
    expect(s.length).toBeGreaterThan(1);
    s.forEach((t, i) => expect(t).toContain(`Sida ${i + 1} av ${s.length}`));
    expect(s[s.length - 1]).toContain('Slutord.');
    expect(s.slice(0, -1).join('')).not.toContain('Slutord.');
  });
});

describe('skapaBilagaPdf', () => {
  const foto = (id: string, punktId: string): EgenkontrollFoto => ({
    id, egenkontroll_id: 'e1', punkt_id: punktId, provyta_id: null, sokvag: `e1/${id}.jpg`, tackningsgrad: null,
    lat: null, lng: null, tagen: null, skapad: `2026-10-12T09:00:0${id.length}Z`,
  }) as EgenkontrollFoto;

  const m = () => {
    const a = punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Basväg över stenmuren', lat: 56.1, lng: 15.1 });
    const b = punkt({ rubrik: 'Kantzon', status: 'battre', lat: 56.101, lng: 15.101 });
    return byggRapport(indata({ punkter: [a, b], foton: [foto('a', a.id), foto('bb', b.id)], traktgrans: [[{ lat: 56.09, lng: 15.09 }, { lat: 56.11, lng: 15.09 }, { lat: 56.11, lng: 15.11 }]] }));
  };

  it('karta + ett foto per fynd med nummer och bildtext; kartan är sida 1', async () => {
    const s = await sidor(await skapaBilagaPdf(m(), async () => ({ bytes: JPEG_1X1, typ: 'jpg' })));
    expect(s).toHaveLength(2); // karta + de två fotona på en sida
    expect(s[0]).toContain('Traktgräns');
    expect(s[1]).toContain('Basväg över stenmuren');
    expect(s[1]).toContain('Kantzon');
    // Numret från rapporten och kartan står vid fotot.
    expect(s[1]).toMatch(/\b1\s+Basväg över stenmuren/);
    expect(s[1]).toMatch(/\b2\s+Kantzon/);
  });

  it('EN bild som inte går att hämta stoppar HELA bilagan - aldrig en lucka i utskicket', async () => {
    await expect(skapaBilagaPdf(m(), async (sok) => (sok.includes('bb') ? null : { bytes: JPEG_1X1, typ: 'jpg' })))
      .rejects.toThrow('1 av 2 bilder gick inte att hämta');
  });

  it('ett kast vid hämtningen räknas likadant', async () => {
    await expect(skapaBilagaPdf(m(), async () => { throw new Error('nätet'); })).rejects.toThrow('2 av 2 bilder');
  });

  it('utan traktgräns och utan positioner säger kartan det, i stället för en tom ruta', async () => {
    const tom = byggRapport(indata());
    const [s1] = await sidor(await skapaBilagaPdf(tom, async () => null));
    expect(s1).toContain('Kartan saknas');
  });
});

describe('kartan pa sida 1', () => {
  const ll = (lat: number, lng: number) => ({ lat, lng });
  const moln = (n: number) => Array.from({ length: n }, (_, i) => ll(56 + (i % 50) * 1e-5, 15 + Math.floor(i / 50) * 1e-5));

  it('KARTAN KOMMER DIREKT UNDER DE TRE TALEN - fore avvikelserna - och faktaraden star vid den', async () => {
    const a = punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Basväg över stenmuren', lat: 56.0001, lng: 15.0002 });
    const m = byggRapport(indata({ punkter: [a], stammar: moln(2247), antalStammar: 2247, areal: 4.8, traktgrans: [[ll(56, 15), ll(56.002, 15), ll(56.002, 15.01)]] }));
    const [s1] = await sidor(await skapaRapportPdf(m));
    const norm = s1.replace(/\s+/g, ' ');
    expect(norm).toContain('2 247 stammar · 4,8 ha');
    expect(norm.indexOf('avvikelse')).toBeLessThan(norm.indexOf('2 247 stammar'));     // talen forst...
    expect(norm.indexOf('2 247 stammar')).toBeLessThan(norm.indexOf('AVVIKELSER'));    // ...sedan kartan, sedan texten
    expect(norm).toContain('Avverkad stam');                                          // teckenforklaringen
    expect(norm).toContain('Traktgräns');
  });

  it('en jamforelserad skrivs under faktaraden nar den finns - och ingenting nar den inte gor det', async () => {
    const m = byggRapport(indata({ stammar: moln(10), antalStammar: 10, areal: 1, jamforelse: [{ etikett: 'Stammar per ha', text: '468 · tidigare 410–520' }] }));
    const [s1] = await sidor(await skapaRapportPdf(m));
    expect(s1.replace(/\s+/g, ' ')).toContain('Stammar per ha: 468 · tidigare 410–520');
    const [utan] = await sidor(await skapaRapportPdf(byggRapport(indata({ stammar: moln(10), antalStammar: 10, areal: 1 }))));
    expect(utan).not.toContain('Stammar per ha');
  });

  it('det som saknas pa kartan star pa sidan (aldrig en tyst tom karta)', async () => {
    const [s1] = await sidor(await skapaRapportPdf(byggRapport(indata({ stammar: null, hyttspar: null }))));
    expect(s1).toContain('Stammolnet kunde inte läsas.');
    expect(s1).toContain('Hyttsparet kunde inte läsas.');
    expect(s1).toContain('Kartan saknas');
  });

  it('en lang lista fynd ligger fortfarande EFTER kartan - kartan skjuts aldrig ner', async () => {
    const manga = Array.from({ length: 30 }, (_, i) => punkt({ rubrik: `Kantzon ${i}`, status: 'battre', kommentar: 'En kommentar.' }));
    const m = byggRapport(indata({ punkter: manga, stammar: moln(100), antalStammar: 100, areal: 2 }));
    const [s1] = await sidor(await skapaRapportPdf(m));
    expect(s1.replace(/\s+/g, ' ')).toContain('100 stammar');
    expect(s1.replace(/\s+/g, ' ').indexOf('100 stammar')).toBeLessThan(s1.replace(/\s+/g, ' ').indexOf('KAN BLI BÄTTRE'));
  });

  describe('ritaKarta ritar ALLT, och glesar aldrig ut', () => {
    async function ritaMedFakeSida(lager: Parameters<typeof ritaKarta>[4], opts = {}) {
      const lib = await import('pdf-lib');
      const anrop: { metod: string; arg: any; opt: any }[] = [];
      const sida: any = new Proxy({}, { get: (_t, metod: string) => (arg: any, opt: any) => { anrop.push({ metod, arg, opt }); } });
      const font: any = { widthOfTextAtSize: (t: string) => t.length * 4 };
      const r = ritaKarta(lib, sida, { normal: font, fet: font }, { x: 48, top: 100, b: 499, h: 300 }, lager, (t) => t, opts);
      return { r, anrop };
    }
    const cirklar = (a: { metod: string; arg: any }[]) => a.filter((x) => x.metod === 'drawSvgPath' && typeof x.arg === 'string' && x.arg.includes(' A ')).length;

    it('en cirkel per stam: 2 247 stammar ger 2 247 cirklar, 12 000 ger 12 000', async () => {
      for (const n of [2247, 12000]) {
        const { anrop } = await ritaMedFakeSida({ granser: [], stammar: moln(n), pinnar: [] });
        expect(cirklar(anrop)).toBe(n);
      }
    });

    it('ingen yta att rita pa (varken grans, stammar eller pinnar) ger null - sidan skriver da "Kartan saknas"', async () => {
      const { r } = await ritaMedFakeSida({ granser: [], stammar: [], pinnar: [] });
      expect(r).toBeNull();
    });

    it('rutans utstrackning bestams av traktgransen och stammolnet: en pin langt utanfor drar inte at sig kartan', async () => {
      // En bred, lag trakt (hojd 230 = minimum). En pin 100 km norrut skulle, om den fick bestamma, gora kartan max-hog (400).
      const lager = { granser: [[ll(56, 15), ll(56.001, 15), ll(56.001, 15.012)]], stammar: [ll(56.0005, 15.001)], pinnar: [{ nr: 1, rubrik: 'x', plats: ll(57, 15) }] };
      expect(kartaHojd(lager, 499)).toBe(230);
      expect(kartaHojd({ ...lager, pinnar: [] }, 499)).toBe(230);
      expect(kartaHojd({ granser: [], stammar: [], pinnar: lager.pinnar }, 499)).toBe(400); // utan trakt ar pinnen det som finns
    });

    it('bilagans stammoln ar BLEKT (orientering), sida 1:s ar rott - samma ritare, tva lagen', async () => {
      const lager = { granser: [], stammar: moln(3), pinnar: [] };
      const farg = (a: { metod: string; arg: any; opt: any }[]) => a.find((x) => x.metod === 'drawSvgPath' && x.arg.includes(' A '))!.opt.color;
      const full = farg((await ritaMedFakeSida(lager)).anrop);
      const blek = farg((await ritaMedFakeSida(lager, { stammarBlek: true })).anrop);
      expect(full).not.toEqual(blek);
      expect(full.red).toBeGreaterThan(full.green * 3); // rodaktigt
      expect(blek.red).toBeCloseTo(blek.green, 5);       // grått
    });

    it('hyttsparet: skordaren heldragen, skotaren streckad - farg ar aldrig ensam', async () => {
      const lager = {
        granser: [[ll(56, 15), ll(56.002, 15), ll(56.002, 15.004)]], stammar: [],
        hyttspar: [
          { roll: 'skordare' as const, linjer: [[ll(56, 15), ll(56.001, 15.001)]] },
          { roll: 'skotare' as const, linjer: [[ll(56, 15.001), ll(56.001, 15.002)]] },
        ],
        pinnar: [],
      };
      const { anrop } = await ritaMedFakeSida(lager);
      const linjer = anrop.filter((x) => x.metod === 'drawSvgPath' && typeof x.arg === 'string' && x.arg.startsWith('M') && !x.arg.includes(' A ') && !x.arg.endsWith('Z'));
      expect(linjer).toHaveLength(2);
      const [skordare, skotare] = linjer;
      expect(skordare.opt.borderDashArray).toBeUndefined();
      expect(skotare.opt.borderDashArray).toEqual([3, 1.5]);
      expect(skordare.opt.borderColor).not.toEqual(skotare.opt.borderColor);
    });
  });
});

describe('backväg i A4-kartan: dubbla tvärstreck (‖) i hinderänden', () => {
  const ll = (lat: number, lng: number) => ({ lat, lng });
  it('geometrin: två streck tvärs över vägen, bredvid varandra längs vägen, i den valda änden', () => {
    // en väg rakt österut (x växer): sista punkten (100,50), första (0,50). Toppbaserade koordinater.
    const vag = [{ x: 0, y: 50 }, { x: 60, y: 50 }, { x: 100, y: 50 }];
    const slut = backvagStreckPt(vag, 'slut')!;
    expect(slut).toHaveLength(2);
    for (const [x1, y1, x2, y2] of slut) { expect(x1).toBeCloseTo(x2, 6); expect(Math.abs(y2 - y1)).toBeCloseTo(12, 6); }   // lodräta streck = tvärs över en vågrät väg
    expect(slut.map((s) => s[0]).sort((a, b) => a - b)).toEqual([97, 103]);                                            // kring änden, 6 pt isär längs vägen
    const start = backvagStreckPt(vag, 'start')!;
    expect(start.map((s) => s[0]).sort((a, b) => a - b)).toEqual([-3, 3]);                                             // andra änden
  });
  it('dubbletter i änden ger ingen brusig riktning; en väg utan riktning ger inga streck', () => {
    const med = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50.1, y: 0 }];
    const s = backvagStreckPt(med, 'slut')!;
    expect(s[0][0]).toBeCloseTo(s[0][2], 6);
    expect(backvagStreckPt([{ x: 1, y: 1 }, { x: 1, y: 1 }], 'slut')).toBeNull();
    expect(backvagStreckPt([{ x: 1, y: 1 }], 'start')).toBeNull();
  });
  it('ritaKarta ritar vägen + två streck (mörk kant + färg) för en backväg, och ingenting extra för en vanlig väg', async () => {
    const lib = await import('pdf-lib');
    const ritaAntal = async (backvag: 'slut' | undefined) => {
      const anrop: { arg: any; opt: any }[] = [];
      const sida: any = new Proxy({}, { get: (_t, metod: string) => (arg: any, opt: any) => { if (metod === 'drawSvgPath') anrop.push({ arg, opt }); } });
      const font: any = { widthOfTextAtSize: (t: string) => t.length * 4 };
      ritaKarta(lib, sida, { normal: font, fet: font }, { x: 48, top: 100, b: 499, h: 300 },
        { granser: [[ll(56, 15), ll(56.002, 15), ll(56.002, 15.004)]], stammar: [], markeringar: [{ slag: 'linje', typ: 'mainRoad', punkter: [ll(56, 15), ll(56.001, 15.001)], ...(backvag ? { backvag } : {}) }], pinnar: [] }, (t) => t, {});
      return anrop.filter((x) => typeof x.arg === 'string' && x.arg.startsWith('M') && !x.arg.includes(' A ') && !x.arg.endsWith('Z'));
    };
    const vanlig = await ritaAntal(undefined), back = await ritaAntal('slut');
    expect(back.length - vanlig.length).toBe(4);   // 2 streck × (mörk kant + färg)
    const streck = back.slice(-4);
    expect(streck[0].opt.borderColor).toEqual(lib.rgb(0.07, 0.07, 0.07));   // mörk kant först
    expect(streck[0].opt.borderWidth).toBeGreaterThan(streck[1].opt.borderWidth);
    expect(streck[1].opt.borderColor).toEqual(streck[3].opt.borderColor);                       // båda färgstrecken i samma färg…
    expect(streck[1].opt.borderColor).toEqual(vanlig[vanlig.length - 1].opt.borderColor);        // …vägens egen
  });
  it('teckenförklaringen ritar en post för backväg utan att kasta', async () => {
    const lib = await import('pdf-lib');
    const anrop: string[] = [];
    const sida: any = new Proxy({}, { get: (_t, metod: string) => () => { anrop.push(metod); } });
    const font: any = { widthOfTextAtSize: (t: string) => t.length * 4 };
    const h = ritaTeckenforklaring(lib, sida, { normal: font }, 48, 100, 499, [{ nyckel: 'backvag', etikett: 'Backväg (dubbla tvärstreck i änden)' }], (t) => t);
    expect(h).toBeGreaterThan(0);
    expect(anrop.filter((m) => m === 'drawSvgPath')).toHaveLength(5);   // vägen + 2 streck × (kant + färg)
  });
});

describe('markeringsStil - farg ar aldrig ensam', () => {
  const linjer = ['mainRoad', 'ditch', 'stonewall', 'nature', 'trail', 'sideRoadRed', 'sideRoadBlue'];
  it('inga tva linjetyper har samma farg, bredd OCH streckning - dike ar streckat, basvag heldragen', () => {
    const stilar = linjer.map((t) => markeringsStil('linje', t)!);
    const nycklar = stilar.map((s) => `${s.farg}|${s.bredd}|${JSON.stringify(s.streck)}`);
    expect(new Set(nycklar).size).toBe(nycklar.length);
    expect(markeringsStil('linje', 'ditch')!.streck).not.toBeNull();
    expect(markeringsStil('linje', 'mainRoad')!.streck).toBeNull();
    expect(markeringsStil('linje', 'sideRoadRed')!.etikett).toBe('Stickväg');
  });
  it('traktgransen ar ingen markering; en okand typ blir "Ovrig ..." i neutral grå - aldrig dold och aldrig en gissad typ', () => {
    expect(markeringsStil('linje', 'boundary')).toBeNull();
    expect(markeringsStil('linje', 'nagot_nytt')).toMatchObject({ nyckel: 'linje:ovrigt', etikett: 'Övrig linje' });
    expect(markeringsStil('symbol', 'nagot_nytt')).toMatchObject({ nyckel: 'symbol:ovrigt', etikett: 'Övrig symbol' });
  });
});
