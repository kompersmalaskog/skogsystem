// @vitest-environment jsdom
// Skördarförslaget: tolkning av RPC-raden, texterna föraren läser, "Inte nu" och att ett fel aldrig blir ett förslag.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tolkaForslag, datumSpann, forslagText, arAvvisat, avvisa, hamtaSkordarForslag, kopplaSkordarObjekt } from './skordarForslag';
import { stamObjektId, hogarObjektIds } from './objektNummer';

// Max Vällust-fall, ur prod 2026-10-20 (foresla_skordarobjekt provkörd i en återrullad transaktion).
const VALLUST = { stam_objekt_id: 'PONS20SDJAA270231_132', objekt_namn: 'Gallring Vällust', skal: 'samma VO', stammar: 644, forsta: '2026-10-05', sista: '2026-10-06', avstand_m: null };
const GRANNE = { stam_objekt_id: '11251428', objekt_namn: 'Vällust RP M-R -25', skal: 'inom 500 m', stammar: 1062, forsta: '2026-10-01', sista: '2026-10-05', avstand_m: 16 };

beforeEach(() => { localStorage.clear(); });

describe('tolkaForslag', () => {
  it('Max fall blir ett förslag med alla fält', () => {
    expect(tolkaForslag(VALLUST)).toEqual({ stamObjektId: 'PONS20SDJAA270231_132', namn: 'Gallring Vällust', skal: 'samma VO', stammar: 644, forsta: '2026-10-05', sista: '2026-10-06', avstandM: null });
  });
  it('trasig rad eller okänt skäl är inget förslag — aldrig ett påhittat', () => {
    expect(tolkaForslag(null)).toBeNull();
    expect(tolkaForslag({})).toBeNull();
    expect(tolkaForslag({ ...VALLUST, stam_objekt_id: '' })).toBeNull();
    expect(tolkaForslag({ ...VALLUST, skal: 'gissning' })).toBeNull();
  });
  it('saknat namn faller tillbaka på nyckeln, inte på tom text', () => {
    expect(tolkaForslag({ ...VALLUST, objekt_namn: null })!.namn).toBe('PONS20SDJAA270231_132');
  });
});

describe('texterna', () => {
  it('samma VO: ett konstaterande med namn, stammar och dagar', () => {
    expect(forslagText(tolkaForslag(VALLUST)!)).toEqual({ fraga: 'Skördaren har kört här: Gallring Vällust · 644 stammar · 5–6 okt', svar: 'Koppla' });
  });
  it('inom 500 m: avståndet står med så ett grannobjekt går att avfärda, och tusental får fast mellanrum', () => {
    const t = forslagText(tolkaForslag(GRANNE)!);
    expect(t.fraga).toBe('Skördaren har kört 16 m härifrån: Vällust RP M-R -25 · 1 062 stammar · 1–5 okt. Samma jobb?');
    expect(t.svar).toBe('Ja, koppla');
  });
  it('datumSpann: samma dag, samma månad, över månadsskifte', () => {
    expect(datumSpann('2026-10-05', '2026-10-05')).toBe('5 okt');
    expect(datumSpann('2026-10-05', '2026-10-06')).toBe('5–6 okt');
    expect(datumSpann('2026-09-30', '2026-10-02')).toBe('30 sep–2 okt');
    expect(datumSpann(null, null)).toBe('');
  });
});

describe('Inte nu', () => {
  it('gäller just det objektet och just det förslaget', () => {
    expect(arAvvisat('a', 'x')).toBe(false);
    avvisa('a', 'x');
    expect(arAvvisat('a', 'x')).toBe(true);
    expect(arAvvisat('a', 'y')).toBe(false);
    expect(arAvvisat('b', 'x')).toBe(false);
  });
});

describe('läsning och koppling', () => {
  const klient = (svar: { data?: any; error?: any }, anrop?: any[]) => ({ rpc: async (namn: string, arg: any) => { anrop?.push([namn, arg]); return { data: svar.data ?? null, error: svar.error ?? null }; } }) as any;
  it('läser bästa först och hoppar över trasiga rader', async () => {
    const f = await hamtaSkordarForslag(klient({ data: [VALLUST, { fel: true }, GRANNE] }), 'obj');
    expect(f.map((x) => x.stamObjektId)).toEqual(['PONS20SDJAA270231_132', '11251428']);
  });
  it('fel eller saknad funktion ger inga förslag och inget kast', async () => {
    expect(await hamtaSkordarForslag(klient({ error: { message: 'finns inte' } }), 'obj')).toEqual([]);
    expect(await hamtaSkordarForslag({ rpc: async () => { throw new Error('nät'); } } as any, 'obj')).toEqual([]);
  });
  it('koppla skickar objekt och skördarens nyckel, och ett fel kommer tillbaka som fel', async () => {
    const anrop: any[] = [];
    expect(await kopplaSkordarObjekt(klient({ data: { alias: 2 } }, anrop), 'obj', 'PONS20SDJAA270231_132')).toEqual({ ok: true });
    expect(anrop).toEqual([['koppla_skordarobjekt', { p_objekt: 'obj', p_stam_objekt_id: 'PONS20SDJAA270231_132' }]]);
    const r = await kopplaSkordarObjekt(klient({ error: { message: 'Förslaget gäller inte längre' } }), 'obj', 'x');
    expect(r).toEqual({ ok: false, fel: 'Förslaget gäller inte längre' });
  });
});

describe('databasen och appen räknar nyckeln lika', () => {
  const sql = (fil: string) => readFileSync(path.resolve(process.cwd(), 'supabase/migrations', fil), 'utf-8');
  it('k-numret som koppla lägger läses tillbaka till samma skördarnyckel som appen letar under (hogarObjektIds)', () => {
    // skordar_alias_nyckel('PONS20SDJAA270231_132') = ('k132', 'PONS20SDJAA270231') — och appen vänder det tillbaka:
    const alias = { nummer: 'k132', maskin_id: 'PONS20SDJAA270231' };
    expect(stamObjektId(alias)).toBe('PONS20SDJAA270231_132');
    expect(hogarObjektIds('P-1024', [alias, { nummer: 'k185', maskin_id: 'A030353' }])).toEqual(['P-1024', 'PONS20SDJAA270231_132', 'A030353_185']);
    // och kontraktsnummer är sitt eget id
    expect(stamObjektId({ nummer: '11251428', maskin_id: null })).toBe('11251428');
  });
  it('migrationerna innehåller regeln som testet förutsätter', () => {
    const nyckel = sql('20261020112728_skordar_forslag_1_alias_nyckel.sql');
    expect(nyckel).toContain("'k' || substring(p_objekt_id from '_([0-9]+)$')");
    expect(nyckel).toContain("substring(p_objekt_id from '^(.*)_[0-9]+$')");
    const foresla = sql('20261020112735_skordar_forslag_2_foresla.sql');
    expect(foresla).toContain("interval '60 days'");
    expect(foresla).toContain('<= 500');
    expect(foresla).toContain("a.maskin_id || '_' || substr(a.nummer, 2)");   // samma omräkning som stamObjektId
    expect(sql('20261020112739_skordar_forslag_3_koppla.sql')).toContain('foresla_skordarobjekt(p_objekt)');   // bara ett aktuellt förslag går att koppla
  });
});
