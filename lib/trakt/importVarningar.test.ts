import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arVarningskolumnFel, loggaImportFel, rapporteraEjSparadeVarningar, skrivObjektTolerantMotVarningskolumn } from './importVarningar';

// Minnesdatabas för objekt + import_fel. `kolumnSaknas` = PostgREST känner inte till objekt.import_varningar (migrationen ej körd / schemacache
// gammal): varje skrivning som innehåller nyckeln avvisas med PGRST204, precis som i prod.
function fakeDb(opt: { kolumnSaknas?: boolean; importFelFel?: boolean; skrivFel?: { code: string; message: string } } = {}) {
  const objekt: any[] = [{ id: 'u1', namn: 'Bågskyttebanan RP J-Hus- 25', vo_nummer: '11271849', import_varningar: null }];
  const importFel: any[] = [];
  const skrivningar: any[] = [];
  const felIKolumn = { code: 'PGRST204', message: "Could not find the 'import_varningar' column of 'objekt' in the schema cache" };
  const avvisa = (p: any) => (opt.skrivFel ? opt.skrivFel : opt.kolumnSaknas && 'import_varningar' in p ? felIKolumn : null);

  const klient: any = {
    from: (t: string) => {
      if (t === 'import_fel') {
        return { insert: async (r: any) => (opt.importFelFel ? { error: { code: '42P01', message: 'relation "import_fel" does not exist' } } : (importFel.push(r), { error: null })) };
      }
      return {
        insert: (p: any) => ({ select: () => ({ single: async () => {
          skrivningar.push({ typ: 'insert', payload: p });
          const fel = avvisa(p); if (fel) return { data: null, error: fel };
          const rad = { id: 'u2', ...p }; objekt.push(rad); return { data: { ...rad }, error: null };
        } }) }),
        update: (p: any) => ({ eq: (_k: string, id: string) => ({ select: () => ({ single: async () => {
          skrivningar.push({ typ: 'update', payload: p });
          const fel = avvisa(p); if (fel) return { data: null, error: fel };
          const rad = objekt.find((r) => r.id === id)!; Object.assign(rad, p); return { data: { ...rad }, error: null };
        } }) }) }),
      };
    },
  };
  return { klient, objekt, importFel, skrivningar };
}

const VARNINGAR = [
  'VO 11166440 är ett extra nummer på ett befintligt objekt (som nu har nummer 11271849) — det objektet uppdaterades i stället för att en ny rad skapades. Objektets nummer lämnades orört.',
  'envz saknar object-info.xml — bara TD-fält används.',
];
const PATCH = { namn: 'Bågskyttebanan RP J-Hus- 25', volym: 4100, import_varningar: VARNINGAR };

afterEach(() => vi.restoreAllMocks());

describe('arVarningskolumnFel', () => {
  it('känner igen bara fel som gäller kolumnen import_varningar', () => {
    expect(arVarningskolumnFel({ code: 'PGRST204', message: "Could not find the 'import_varningar' column of 'objekt' in the schema cache" })).toBe(true);
    expect(arVarningskolumnFel({ code: '42703', message: 'column "import_varningar" of relation "objekt" does not exist' })).toBe(true);
    // andra kolumner, andra fel och oklara fel räknas aldrig som "varningskolumnen"
    expect(arVarningskolumnFel({ code: 'PGRST204', message: "Could not find the 'valtlapp_url' column of 'objekt' in the schema cache" })).toBe(false);
    expect(arVarningskolumnFel({ code: '23505', message: 'duplicate key value violates unique constraint "objekt_vo_nummer_key"' })).toBe(false);
    expect(arVarningskolumnFel({ code: '42501', message: 'permission denied for table objekt' })).toBe(false);
    expect(arVarningskolumnFel(null)).toBe(false);
  });
});

describe('skrivning när import_varningar går att skriva (som förut)', () => {
  it('UPDATE: EN skrivning, varningarna ligger på objektet, ingenting extra', async () => {
    const db = fakeDb();
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, (p) => db.klient.from('objekt').update(p).eq('id', 'u1').select().single());
    expect(r.error).toBeNull();
    expect(r.varningarSparade).toBe(true);
    expect(r.ejSparade).toEqual([]);
    expect(db.skrivningar).toHaveLength(1);
    expect(db.objekt[0].import_varningar).toEqual(VARNINGAR);
    expect(db.importFel).toHaveLength(0);
  });
});

describe('skrivning när import_varningar INTE går att skriva (kolumnen saknas)', () => {
  it('UPDATE: importen går igenom — objektet uppdateras utan kolumnen, varningarna returneras som ej sparade', async () => {
    const db = fakeDb({ kolumnSaknas: true });
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, (p) => db.klient.from('objekt').update(p).eq('id', 'u1').select().single());
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ id: 'u1', volym: 4100 });
    expect(r.varningarSparade).toBe(false);
    expect(r.ejSparade).toEqual(VARNINGAR);
    expect(r.kolumnFel).toMatch(/import_varningar/);
    // två skrivningar: den avvisade, sedan samma patch utan kolumnen — och inget annat ändrades
    expect(db.skrivningar).toHaveLength(2);
    expect('import_varningar' in db.skrivningar[1].payload).toBe(false);
    expect(db.skrivningar[1].payload).toEqual({ namn: 'Bågskyttebanan RP J-Hus- 25', volym: 4100 });
    expect(db.objekt[0].volym).toBe(4100);
  });

  it('INSERT: ett nytt objekt skapas ändå', async () => {
    const db = fakeDb({ kolumnSaknas: true });
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, (p) => db.klient.from('objekt').insert(p).select().single());
    expect(r.error).toBeNull();
    expect(r.data?.id).toBe('u2');
    expect(r.varningarSparade).toBe(false);
    expect(db.objekt).toHaveLength(2);
  });

  it('varningarna tappas inte tyst: de hamnar i import_fel med objektets namn och varje varningstext', async () => {
    const db = fakeDb({ kolumnSaknas: true });
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, (p) => db.klient.from('objekt').update(p).eq('id', 'u1').select().single());
    const sparadeILogg = await rapporteraEjSparadeVarningar(db.klient, 'trakt-inbox/bagskytt.zip', 'Bågskyttebanan RP J-Hus- 25', r);
    expect(sparadeILogg).toBe(true);
    expect(db.importFel).toHaveLength(1);
    expect(db.importFel[0]).toMatchObject({ tabell: 'objekt', filnamn: 'trakt-inbox/bagskytt.zip', felkod: 'VARNINGAR_EJ_SPARADE' });
    expect(db.importFel[0].feltext).toContain('Bågskyttebanan RP J-Hus- 25');
    expect(db.importFel[0].feltext).toContain('20260805_6_objekt_dokument_varningar.sql');
    expect(db.importFel[0].feltext).toContain('är ett extra nummer på ett befintligt objekt');
    expect(db.importFel[0].feltext).toContain('envz saknar object-info.xml');
  });

  it('import_fel går INTE heller att skriva: loggningen faller inte, returnerar false och texten står i serverloggen', async () => {
    const fel = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = fakeDb({ kolumnSaknas: true, importFelFel: true });
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, (p) => db.klient.from('objekt').update(p).eq('id', 'u1').select().single());
    const sparadeILogg = await rapporteraEjSparadeVarningar(db.klient, 'bagskytt.zip', 'Bågskyttebanan', r);
    expect(sparadeILogg).toBe(false);
    expect(r.error).toBeNull(); // importen är ändå inte fälld
    const loggat = fel.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(loggat).toContain('VARNINGAR_EJ_SPARADE');
    expect(loggat).toContain('envz saknar object-info.xml'); // varningen finns kvar i loggen
  });

  it('inga varningar att tappa: importen går igenom och loggraden säger det', async () => {
    const db = fakeDb({ kolumnSaknas: true });
    const r = await skrivObjektTolerantMotVarningskolumn<any>({ ...PATCH, import_varningar: null }, (p) => db.klient.from('objekt').update(p).eq('id', 'u1').select().single());
    expect(r.error).toBeNull();
    expect(r.ejSparade).toEqual([]);
    await rapporteraEjSparadeVarningar(db.klient, 'x.zip', 'X', r);
    expect(db.importFel[0].feltext).toContain('inga varningar den här gången');
  });
});

describe('andra skrivfel fälls fortfarande (ingen tyst sväljning)', () => {
  it('unik-överträdelse (23505) returneras direkt, ingen omskrivning', async () => {
    const db = fakeDb({ skrivFel: { code: '23505', message: 'duplicate key value violates unique constraint "objekt_vo_nummer_key"' } });
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, (p) => db.klient.from('objekt').insert(p).select().single());
    expect(r.error?.code).toBe('23505');
    expect(r.varningarSparade).toBe(false);
    expect(db.skrivningar).toHaveLength(1);
  });

  it('fel på en ANNAN kolumn (valtlapp_url) omskrivs inte — det är ett riktigt fel', async () => {
    const db = fakeDb({ skrivFel: { code: 'PGRST204', message: "Could not find the 'valtlapp_url' column of 'objekt' in the schema cache" } });
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, (p) => db.klient.from('objekt').update(p).eq('id', 'u1').select().single());
    expect(r.error?.message).toMatch(/valtlapp_url/);
    expect(db.skrivningar).toHaveLength(1);
  });

  it('omskrivningen utan kolumnen kan själv fela — då returneras det felet', async () => {
    const db = fakeDb({ kolumnSaknas: true });
    let n = 0;
    const r = await skrivObjektTolerantMotVarningskolumn<any>(PATCH, async (p) => {
      n++;
      return n === 1 ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'import_varningar' column of 'objekt' in the schema cache" } }
        : { data: null, error: { code: '42501', message: 'permission denied for table objekt' } };
    });
    expect(r.error?.code).toBe('42501');
    expect(db.importFel).toHaveLength(0);
  });
});

describe('loggaImportFel', () => {
  it('skriver en rad i import_fel och kapar texten vid 2000 tecken', async () => {
    const db = fakeDb();
    expect(await loggaImportFel(db.klient, 'a.zip', 'OBJEKT_SOK', 'x'.repeat(3000))).toBe(true);
    expect(db.importFel[0].feltext).toHaveLength(2000);
  });

  it('ett misslyckat insert är inte tyst (supabase-js kastar inte — felet kommer som { error })', async () => {
    const fel = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = fakeDb({ importFelFel: true });
    expect(await loggaImportFel(db.klient, 'a.zip', 'OBJEKT_SOK', 'läsfel')).toBe(false);
    expect(fel).toHaveBeenCalled();
    expect(fel.mock.calls[0].join(' ')).toContain('läsfel');
  });
});

describe('källvakt: routen och objektsidan', () => {
  const route = readFileSync(resolve(__dirname, '../../app/api/import-trakt/route.ts'), 'utf8');
  const sida = readFileSync(resolve(__dirname, '../../app/objekt/page.tsx'), 'utf8');

  it('både INSERT och UPDATE av objektet går via den toleranta skrivningen — ingen direkt skrivning med import_varningar kvar', () => {
    expect(route).toMatch(/skrivObjektTolerantMotVarningskolumn<any>\(patch,/);
    expect(route).toMatch(/skrivObjektTolerantMotVarningskolumn<any>\(data,/);
    expect(route).not.toMatch(/from\('objekt'\)\s*\.update\(patch\)/);
    expect(route).not.toMatch(/from\('objekt'\)\.insert\(data\)/);
  });

  it('routen har bara EN loggaImportFel (den i lib) och svaret berättar om varningarna sparades', () => {
    expect(route).not.toMatch(/async function loggaImportFel/);
    expect(route).toMatch(/rapporteraEjSparadeVarningar\(service, sokvag/);
    expect(route).toMatch(/varningar, varningarSparade, varningarILogg/);
  });

  it('objektsidan skriver inte "Importerat!" när varningarna inte sparades', () => {
    expect(sida).toMatch(/data\.varningarSparade === false/);
    expect(sida).toMatch(/Tappades något vid import\?/);
  });
});
