import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byggOmimportPatch, hittaBefintligtObjekt } from './befintligt';

// Minnesdatabas med de två tabellerna uppslaget läser. Räknar frågor per tabell så testerna kan visa vad som INTE läses.
function fakeDb(opt: { objekt?: any[]; alias?: any[]; fel?: Record<string, any> } = {}) {
  const tabeller: Record<string, any[]> = { objekt: opt.objekt ?? [], objekt_alt_nummer: opt.alias ?? [] };
  const fragor: Record<string, number> = {};
  const klient = {
    from: (t: string) => ({
      select: () => {
        fragor[t] = (fragor[t] ?? 0) + 1;
        const filter: Array<(r: any) => boolean> = [];
        const b: any = {
          eq: (k: string, v: any) => { filter.push((r) => r[k] === v); return b; },
          is: (k: string, v: any) => { filter.push((r) => (r[k] ?? null) === v); return b; },
          limit: (n: number) => {
            if (opt.fel?.[t]) return Promise.resolve({ data: null, error: opt.fel[t] });
            return Promise.resolve({ data: tabeller[t].filter((r) => filter.every((f) => f(r))).slice(0, n).map((r) => ({ ...r })), error: null });
          },
        };
        return b;
      },
    }),
  } as any;
  return { klient, fragor };
}

const BAGSKYTT_EFTER_BYTE = { id: 'u-bagskytt', namn: 'Bågskyttebanan RP J-Hus- 25', vo_nummer: '11271849', larmkoordinat_kalla: 'envz' };
const ALIAS_BYTE = { nummer: '11166440', maskin_id: null, objekt_id: 'u-bagskytt', byte_till: '11271849' };

describe('hittaBefintligtObjekt — Bågskyttebanan', () => {
  it('leverans med det GAMLA numret 11166440 hittar objektet som nu har 11271849 (ingen ny rad)', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    const r = await hittaBefintligtObjekt(klient, '11166440');
    expect(r).toMatchObject({ typ: 'traff', objekt: { id: 'u-bagskytt', larmkoordinat_kalla: 'envz', vo_nummer: '11271849', via: 'extra_nummer' } });
  });

  it('leverans med objektets nuvarande nummer: träff på vo_nummer som förut — extra nummer läses aldrig', async () => {
    const { klient, fragor } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    const r = await hittaBefintligtObjekt(klient, '11271849');
    expect(r).toMatchObject({ typ: 'traff', objekt: { id: 'u-bagskytt', via: 'vo_nummer' } });
    expect(fragor.objekt_alt_nummer).toBeUndefined();
  });

  it('vanligt extra nummer (gamla numret hade data → filens nummer sparades som extra nummer) hittar också objektet', async () => {
    const { klient } = fakeDb({
      objekt: [{ id: 'u-molleryd', namn: 'Mölleryd', vo_nummer: '11166477', larmkoordinat_kalla: null }],
      alias: [{ nummer: '11271883', maskin_id: null, objekt_id: 'u-molleryd' }],
    });
    expect(await hittaBefintligtObjekt(klient, '11271883')).toMatchObject({ typ: 'traff', objekt: { id: 'u-molleryd', vo_nummer: '11166477', via: 'extra_nummer' } });
  });
});

describe('hittaBefintligtObjekt — övriga lägen', () => {
  it('okänt nummer → ingen träff (importen skapar en ny rad som förut)', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    expect(await hittaBefintligtObjekt(klient, '11999999')).toEqual({ typ: 'ingen' });
  });
  it('inget VO-nummer → ingen träff utan att fråga', async () => {
    const { klient, fragor } = fakeDb();
    expect(await hittaBefintligtObjekt(klient, '')).toEqual({ typ: 'ingen' });
    expect(await hittaBefintligtObjekt(klient, null)).toEqual({ typ: 'ingen' });
    expect(fragor).toEqual({});
  });
  it('icke-numeriskt VO (P-1012) kan inte vara ett extra nummer: bara vo_nummer-uppslaget görs', async () => {
    const { klient, fragor } = fakeDb({ objekt: [{ id: 'u-p', vo_nummer: 'P-1012', larmkoordinat_kalla: null }] });
    expect(await hittaBefintligtObjekt(klient, 'P-1012')).toMatchObject({ typ: 'traff', objekt: { id: 'u-p', via: 'vo_nummer' } });
    expect(await hittaBefintligtObjekt(klient, 'P-9999')).toEqual({ typ: 'ingen' });
    expect(fragor.objekt_alt_nummer).toBeUndefined();
  });
  it('maskinens egna k-nummer (maskin_id satt) är aldrig ett VO-nummer', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [{ nummer: '12345', maskin_id: 'PONS', objekt_id: 'u-bagskytt' }] });
    expect(await hittaBefintligtObjekt(klient, '12345')).toEqual({ typ: 'ingen' });
  });
  it('mellanslag runt numret spelar ingen roll', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    expect(await hittaBefintligtObjekt(klient, ' 11166440 ')).toMatchObject({ typ: 'traff', objekt: { via: 'extra_nummer' } });
  });
});

describe('hittaBefintligtObjekt — läsfel är aldrig "ingen träff"', () => {
  it('fel på objekt → fel (annars hade importen skapat en ny rad)', async () => {
    const { klient } = fakeDb({ fel: { objekt: { message: 'nät' } } });
    expect(await hittaBefintligtObjekt(klient, '11166440')).toMatchObject({ typ: 'fel' });
  });
  it('fel på extra nummer → fel', async () => {
    const { klient } = fakeDb({ objekt: [], fel: { objekt_alt_nummer: { code: '42501', message: 'permission denied' } } });
    const r = await hittaBefintligtObjekt(klient, '11166440');
    expect(r.typ).toBe('fel');
  });
  it('tabellen saknas (migrationen ej körd) → inga extra nummer → som förut', async () => {
    const { klient } = fakeDb({ objekt: [], fel: { objekt_alt_nummer: { code: '42P01', message: 'relation "public.objekt_alt_nummer" does not exist' } } });
    expect(await hittaBefintligtObjekt(klient, '11166440')).toEqual({ typ: 'ingen' });
  });
});

describe('byggOmimportPatch — skyddade fält, nummer och larm är som förut', () => {
  const data = {
    vo_nummer: '11166440', namn: 'Bågskyttebanan RP J-Hus- 25', bolag: 'Vida', typ: 'slutavverkning', volym: 900,
    lat: 56.1, lng: 14.2, anteckningar: 'egen text', status: undefined, areal: null, traktnr: '  ',
    larmkoordinat_lat: 56.2, larmkoordinat_lng: 14.3, larmkoordinat_kalla: 'envz', ar: 2026,
  };
  const SKYDDADE = ['lat', 'lng', 'anteckningar', 'ar', 'manad', 'ordning', 'status'];
  // Raden är tom på det leveransen vill skriva → allt som inte är skyddat/tomt skrivs, som förut.
  const TOM_RAD = { id: 'u1' };
  const opt = (o: Partial<Parameters<typeof byggOmimportPatch>[1]> = {}) =>
    ({ skyddade: SKYDDADE, bevaraLarm: false, behallVoNummer: false, nuvarande: TOM_RAD, importVarden: null, ...o });

  it('omimport på vo_nummer: skyddade, nollor och tomma strängar skrivs aldrig; vo_nummer skrivs', () => {
    expect(byggOmimportPatch(data, opt()).patch).toEqual({
      vo_nummer: '11166440', namn: 'Bågskyttebanan RP J-Hus- 25', bolag: 'Vida', typ: 'slutavverkning', volym: 900,
      larmkoordinat_lat: 56.2, larmkoordinat_lng: 14.3, larmkoordinat_kalla: 'envz',
    });
  });
  it("larmkoordinat 'egen' bevaras som förut", () => {
    const { patch } = byggOmimportPatch(data, opt({ bevaraLarm: true }));
    expect(Object.keys(patch).some((k) => k.startsWith('larmkoordinat_'))).toBe(false);
    expect(patch.vo_nummer).toBe('11166440');
  });
  it('träff via extra nummer: leveransens (gamla) vo_nummer skrivs INTE över objektets nuvarande — resten uppdateras', () => {
    const { patch } = byggOmimportPatch(data, opt({ behallVoNummer: true }));
    expect('vo_nummer' in patch).toBe(false);
    expect(patch).toMatchObject({ namn: 'Bågskyttebanan RP J-Hus- 25', bolag: 'Vida', volym: 900 });
  });
  it('0 i volym/areal betyder "hittades inte i filen" och skriver aldrig över ett riktigt värde', () => {
    const { patch } = byggOmimportPatch({ volym: 0, areal: 0, namn: 'X' }, opt({ nuvarande: { volym: 950, areal: 3.6 } }));
    expect(patch).toEqual({ namn: 'X' });
  });
});

describe('byggOmimportPatch — skriv bara över det importen själv har satt', () => {
  const O = { skyddade: ['status'], bevaraLarm: false, behallVoNummer: false };

  it('tomt fält → skrivs, och importen minns vad den satte', () => {
    const r = byggOmimportPatch({ atgard: 'Första gallring', avtalsform: 'Rp' }, { ...O, nuvarande: { atgard: null, avtalsform: '' }, importVarden: null });
    expect(r.patch).toEqual({ atgard: 'Första gallring', avtalsform: 'Rp' });
    expect(r.importVarden).toEqual({ atgard: 'Första gallring', avtalsform: 'Rp' });
    expect(r.behollna).toEqual([]);
  });

  it('fältet har exakt det värde förra importen satte → skrivs över med det nya', () => {
    const r = byggOmimportPatch({ volym: 1200, avverkningsform: 'Föryngringsavverkning' }, {
      ...O, nuvarande: { volym: 1000, avverkningsform: 'Föryngringsavverkning' }, importVarden: { volym: 1000, avverkningsform: 'Föryngringsavverkning' },
    });
    expect(r.patch).toEqual({ volym: 1200 });                        // avverkningsform är oförändrad: inget att skriva
    expect(r.importVarden).toMatchObject({ volym: 1200, avverkningsform: 'Föryngringsavverkning' });
    expect(r.behollna).toEqual([]);
  });

  it('Martin har rättat fältet → det ligger kvar, och importen säger det', () => {
    const r = byggOmimportPatch({ atgard: 'Gallring', typ: 'gallring', volym: 1200 }, {
      ...O, nuvarande: { atgard: 'Första gallring', typ: 'gallring', volym: 1000 }, importVarden: { atgard: 'Gallring', typ: 'gallring', volym: 1000 },
    });
    expect(r.patch).toEqual({ volym: 1200 });                        // volym orörd sedan importen → uppdateras; åtgärden rättades → kvar
    expect(r.behollna).toEqual(['atgard']);
    expect(r.importVarden.atgard).toBe('Gallring');                  // importens minne ändras inte av en kvarbehållen rättning
  });

  it('rad från före import_varden (inget minne): ett icke-tomt värde som skiljer sig behålls — ursprunget går inte att veta', () => {
    const r = byggOmimportPatch({ atgard: 'Gallring', cert: 'FSC PEFC', volym: 1000 }, {
      ...O, nuvarande: { atgard: 'Första gallring', cert: 'FSC PEFC', volym: 1000 }, importVarden: null,
    });
    expect(r.patch).toEqual({});
    expect(r.behollna).toEqual(['atgard']);
    expect(r.importVarden).toEqual({ cert: 'FSC PEFC', volym: 1000 });   // det som stämmer lärs in som importens
  });

  it('en rättning till samma värde som leveransen ger är bara samma värde: ingen skrivning, ingen "behållen"', () => {
    const r = byggOmimportPatch({ atgard: 'Gallring' }, { ...O, nuvarande: { atgard: 'Gallring' }, importVarden: { atgard: 'Första gallring' } });
    expect(r.patch).toEqual({});
    expect(r.behollna).toEqual([]);
  });

  it('tal och talsträngar är samma värde (numeric kan komma tillbaka som text)', () => {
    const r = byggOmimportPatch({ areal: 3.64 }, { ...O, nuvarande: { areal: '3.64' }, importVarden: null });
    expect(r.patch).toEqual({});
    expect(r.behollna).toEqual([]);
  });

  it('leveransen har inget värde (null/tomt) → fältet rörs inte, även om det är importens eget', () => {
    const r = byggOmimportPatch({ atgard: null, avtalsform: '', sortiment: [] }, {
      ...O, nuvarande: { atgard: 'Gallring', avtalsform: 'Rp', sortiment: ['Massa · Barr'] }, importVarden: { atgard: 'Gallring', avtalsform: 'Rp' },
    });
    expect(r.patch).toEqual({});
  });

  it('importägda artefakter (dokumentvägar, kartor, checklista, kalla) skrivs alltid över — de redigeras aldrig för hand', () => {
    const r = byggOmimportPatch({ traktkartor: [{ path: 'ny.pdf' }], traktdirektiv_url: '1_td.pdf', kalla: 'envz', import_varningar: ['v'] }, {
      ...O, nuvarande: { traktkartor: [{ path: 'gammal.pdf' }], traktdirektiv_url: 'annat.pdf', kalla: 'traktdirektiv' }, importVarden: null,
    });
    expect(r.patch).toEqual({ traktkartor: [{ path: 'ny.pdf' }], traktdirektiv_url: '1_td.pdf', kalla: 'envz', import_varningar: ['v'] });
    expect(r.importVarden).toEqual({});                               // artefakter hamnar inte i minnet
  });
});

describe('Bågskyttebanan genom hela omimporten (uppslag + patch)', () => {
  it('leverans med 11166440 → det befintliga objektet uppdateras, numret 11271849 står kvar, ingen ny rad', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    const sok = await hittaBefintligtObjekt(klient, '11166440');
    expect(sok.typ).toBe('traff');                                    // → routen tar UPDATE-grenen, inte INSERT
    if (sok.typ !== 'traff') return;
    const { patch } = byggOmimportPatch({ vo_nummer: '11166440', namn: 'Bågskyttebanan RP J-Hus- 25', volym: 950 }, {
      skyddade: ['status'], bevaraLarm: false, behallVoNummer: sok.objekt.via === 'extra_nummer', nuvarande: sok.objekt.rad, importVarden: null,
    });
    expect(patch).toEqual({ volym: 950 });                            // namnet stämmer redan med raden
  });
});

describe('källvakt: routen använder uppslaget och patch-byggaren', () => {
  const route = readFileSync(resolve(__dirname, '../../app/api/import-trakt/route.ts'), 'utf8');
  it('uppslag via hittaBefintligtObjekt — inget kvar av det gamla enbart-vo_nummer-uppslaget', () => {
    expect(route).toContain("import { byggOmimportPatch, hittaBefintligtObjekt, importVardenForNyttObjekt, SKYDDADE_VID_OMIMPORT, type BefintligtObjekt } from '@/lib/trakt/befintligt';");
    expect(route).toContain('await hittaBefintligtObjekt(supabase, String(falt.vo_nummer))');
    expect(route).not.toContain(".eq('vo_nummer', String(falt.vo_nummer))");
  });
  it('läsfel stoppar importen (500, loggas) i stället för att falla igenom till INSERT', () => {
    expect(route).toContain("if (sok.typ === 'fel') {");
    expect(route).toContain("'OBJEKT_SOK'");
  });
  it('träff via extra nummer behåller objektets nummer och säger det i import_varningar', () => {
    expect(route).toContain("behallVoNummer: befintlig.via === 'extra_nummer'");
    expect(route).toContain('är ett extra nummer på ett befintligt objekt');
  });
});
