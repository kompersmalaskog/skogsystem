import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import { atgardStatus, langtDatum, riskDokument, skyddsrondDokument, type RondAtgard } from './dokument';
import { skapaArbetsmiljoPdf } from './pdf';
import { byggPunkter, type Rond } from './skyddsrond';
import { MASKINTYPER, TOM, lista, underlag, type Bedomning, type MaskinTyp } from './maskinRisk';

async function texten(bytes: Uint8Array): Promise<{ text: string; sidor: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: text.replace(/\s+/g, ' '), sidor: totalPages };
}

const NU = new Date('2026-11-20T10:00:00Z');
const punkter = byggPunkter([{ id: 'PONS', namn: 'Giant' }]);

function rond(brister: Record<string, string> = {}): Rond {
  return {
    id: 'r1', punkter, deltagare: 'Martin och Oskar (skyddsombud)', startad: '2026-11-02T08:00:00Z', klar: '2026-11-02T11:30:00Z',
    svar: punkter.map((p, i) => brister[p.id]
      ? { id: `s${i}`, punkt: p.id, svar: 'brist' as const, beskrivning: brister[p.id] }
      : { id: `s${i}`, punkt: p.id, svar: (p.id === 'storm' ? 'galler_inte' : 'ok') as 'ok' | 'galler_inte', beskrivning: null }),
  };
}
const svarId = (r: Rond, punkt: string) => r.svar.find(s => s.punkt === punkt)!.id!;

describe('datum', () => {
  it('skrivs ut i svensk tid', () => {
    expect(langtDatum('2026-11-02')).toBe('2 november 2026');
    expect(langtDatum('2026-12-31T23:30:00Z')).toBe('1 januari 2027');
  });
});

describe('skyddsrondens dokument', () => {
  it('utan brister: svaret säger det och ingen åtgärdssektion finns', () => {
    const d = skyddsrondDokument(rond(), [], NU);
    expect(d.svar).toBe('Inga brister');
    expect(d.svarTon).toBe('bra');
    expect(d.sektioner[0].rubrik).toBe('Brandskydd på maskinerna');
    expect(d.sektioner.some(s => s.rubrik === 'Vad ska åtgärdas?')).toBe(false);
    expect(d.fakta).toContainEqual({ etikett: 'Gick ronden', varde: 'Martin och Oskar (skyddsombud)' });
    expect(d.filnamn).toBe('skyddsrond-2026-11-02');
  });

  it('bristerna står först, det som inte är gjort överst, med vad som hänt med åtgärden', () => {
    const r = rond({ datablad: 'Datablad för AdBlue saknas', bod: 'Ingen toalett vid Skälviken' });
    const atg: RondAtgard[] = [
      { svarId: svarId(r, 'datablad'), status: 'klar', deadline: '2026-12-02', vadGjordes: 'Utskrivet och satt i pärmen', stangdTid: '2026-11-10T09:00:00Z' },
      { svarId: svarId(r, 'bod'), status: 'oppen', deadline: '2026-11-15', vadGjordes: null, stangdTid: null },
    ];
    const d = skyddsrondDokument(r, atg, NU);
    expect(d.svar).toBe('2 brister · 1 av 2 åtgärdade');
    expect(d.svarTon).toBe('brist');
    const forsta = d.sektioner[0];
    expect(forsta.rubrik).toBe('Vad ska åtgärdas?');
    expect(forsta.rader.map(x => x.status)).toEqual([
      'Inte åtgärdad · skulle vara klar 15 november 2026',
      'Åtgärdad 10 november 2026 – Utskrivet och satt i pärmen',
    ]);
    expect(forsta.rader[0].text).toBe('Ingen toalett vid Skälviken');
  });

  it('alla åtgärdade = bra', () => {
    const r = rond({ datablad: 'Saknas' });
    const d = skyddsrondDokument(r, [{ svarId: svarId(r, 'datablad'), status: 'klar', deadline: null, vadGjordes: null, stangdTid: null }], NU);
    expect(d.svar).toBe('1 brist · alla åtgärdade');
    expect(d.svarTon).toBe('bra');
  });

  it('åtgärderna gick inte att läsa: ingen status gissas och noten säger det', () => {
    const d = skyddsrondDokument(rond({ datablad: 'Saknas' }), null, NU);
    expect(d.svar).toBe('1 brist');
    expect(d.sektioner[0].rader[0].status).toBeUndefined();
    expect(d.not).toContain('kunde inte läsas');
  });

  it('en brist utan åtgärd säger det, aldrig "åtgärdad"', () => {
    expect(atgardStatus(undefined, '2026-11-20').status).toBe('Åtgärden kunde inte läsas');
    expect(atgardStatus({ svarId: 'x', status: 'oppen', deadline: '2026-11-25', vadGjordes: null, stangdTid: null }, '2026-11-20'))
      .toEqual({ status: 'Inte åtgärdad än · senast 25 november 2026', ton: 'brist' });
  });

  it('varje punkt står med sitt svar, i områdets ordning', () => {
    const d = skyddsrondDokument(rond(), [], NU);
    const ensam = d.sektioner.find(s => s.rubrik === 'Ensamarbete')!;
    expect(ensam.rader.find(x => x.titel === 'Ingen jobbar ensam i stormfälld skog')?.status).toBe('Gäller inte');
    const antal = d.sektioner.reduce((n, s) => n + s.rader.length, 0);
    expect(antal).toBe(punkter.length);
  });
});

function godkand(typ: MaskinTyp, b: Bedomning, tid: string, av: string): Bedomning {
  return { ...b, godkandUnderlag: underlag(lista(typ, b)), godkandTid: tid, godkandAv: av };
}

describe('riskbedömningens dokument', () => {
  const bed = (): Record<MaskinTyp, Bedomning> => Object.fromEntries(MASKINTYPER.map(t => [t, { ...TOM, bort: [], egna: [] }])) as unknown as Record<MaskinTyp, Bedomning>;

  it('säger rakt ut vilka som inte är godkända', () => {
    const b = bed();
    b.skordare = godkand('skordare', b.skordare, '2026-11-03T10:00:00Z', 'm1');
    b.skotare = { ...godkand('skotare', b.skotare, '2026-11-03T10:00:00Z', 'm1'), bort: ['last'] };
    const d = riskDokument(b, { m1: 'Martin Lindqvist' }, null, [], NU);
    expect(d.svar).toBe('1 av 5 godkända');
    expect(d.sektioner.map(s => s.under)).toEqual([
      'Godkänd 3 november 2026 av Martin',
      'Ändrad efter godkännandet 3 november 2026 – inte godkänd igen',
      'Inte godkänd',
      'Inte godkänd',
      'Inte godkänd',
    ]);
    expect(d.sektioner[0].rader[0]).toEqual({ titel: 'Folk nära maskinen', text: 'Är någon närmare än 70 meter: stanna och vänta tills ni har pratat med varandra.' });
  });

  it('visar vilka förare som läst, bara på godkända', () => {
    const b = bed();
    for (const t of MASKINTYPER) b[t] = godkand(t, b[t], '2026-11-03T10:00:00Z', 'm1');
    const u = underlag(lista('skotare', b.skotare));
    const d = riskDokument(b, { m1: 'Martin' }, [
      { id: 'f1', namn: 'Daniel Ek', typ: 'skotare' }, { id: 'f2', namn: 'Max Berg', typ: 'skotare' }, { id: 'f3', namn: 'Stefan', typ: 'skordare' },
    ], [{ medarbetareId: 'f1', maskintyp: 'skotare', underlag: u, tid: '2026-11-04T07:00:00Z' }], NU);
    expect(d.svar).toBe('Alla är godkända');
    const skotare = d.sektioner.find(s => s.rubrik === 'Skotare')!;
    expect(skotare.rader.at(-1)).toEqual({ titel: 'Lästa av förarna', text: 'Daniel 4 november 2026 · Max har inte läst', ton: 'brist' });
    expect(d.sektioner.find(s => s.rubrik === 'Lastbil')!.rader.some(r => r.titel === 'Lästa av förarna')).toBe(false);
  });
});

describe('PDF:en', () => {
  it('skyddsronden bär samma text som dokumentet', async () => {
    const r = rond({ datablad: 'Datablad för AdBlue saknas' });
    const { text, sidor } = await texten(await skapaArbetsmiljoPdf(skyddsrondDokument(r, [], NU)));
    expect(sidor).toBeGreaterThanOrEqual(1);
    for (const s of ['Kompersmåla Skog', 'Skyddsrond', '2 november 2026', 'Martin och Oskar (skyddsombud)', 'Vad ska åtgärdas?',
      'Datablad för AdBlue saknas', 'Brandskydd på maskinerna', 'Giant: två brandsläckare', 'Gäller inte']) {
      expect(text).toContain(s);
    }
  });

  it('riskbedömningen ryms på flera sidor med sidnummer', async () => {
    const b = Object.fromEntries(MASKINTYPER.map(t => [t, godkand(t, { ...TOM, bort: [], egna: [] }, '2026-11-03T10:00:00Z', 'm1')])) as Record<MaskinTyp, Bedomning>;
    const { text, sidor } = await texten(await skapaArbetsmiljoPdf(riskDokument(b, { m1: 'Martin' }, null, [], NU)));
    expect(sidor).toBeGreaterThan(1);
    expect(text).toContain(`sida 1 av ${sidor}`);
    for (const s of ['Riskbedömning – maskinerna', 'Alla är godkända', 'Skördare', 'Motorsåg', 'Kedjeskott från sågen', 'Godkänd 3 november 2026 av Martin']) {
      expect(text).toContain(s);
    }
  });
});
