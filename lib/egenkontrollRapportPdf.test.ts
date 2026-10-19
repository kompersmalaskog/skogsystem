import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import type { Egenkontroll, EgenkontrollFoto, EgenkontrollPunkt } from './egenkontroll';
import { byggRapport, type RapportIndata } from './egenkontrollRapport';
import { brytText, projicera, skalstock, skapaBilagaPdf, skapaRapportPdf } from './egenkontrollRapportPdf';

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
  provytor: [], platser: {}, traktgrans: [], ...o,
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
    expect(s[0]).toContain('Streckad linje: Vidas traktgräns');
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
