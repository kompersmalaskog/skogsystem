// Läsningen av appens lass + källvakter för hur den är kopplad.
//
// Risken här är TYSTHET: ett lass som ligger under ett annat av traktens
// nummer, eller ett obekräftat lass som smyger in, syns inte som ett fel —
// det syns som en faktura med fel avståndstillägg.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lasAppLass, lasLassCykel } from './lasAppLass';

const HAMTA = readFileSync('lib/faktura/hamtaUnderlag.ts', 'utf8');
const LAS = readFileSync('lib/faktura/lasAppLass.ts', 'utf8');

/** Minsta möjliga klient: spelar in anropet och svarar med rader. */
function fejk(svar: any[] | null, fel: any = null) {
  const anrop: any[] = [];
  return {
    sb: {
      rpc: async (namn: string, args: Record<string, unknown>) => {
        anrop.push({ namn, args });
        return { data: svar, error: fel };
      },
    },
    anrop,
  };
}

const rad = (o: Record<string, unknown> = {}) => ({
  lass_id: 'L1', vo_nummer: '11271860', maskin_id: 'A130743', datum: '2026-11-02',
  volym: 20, cykel_m: 1000, punkter: 120, vid_avlagget_m: 200,
  hem_med_lass_m: 400, ytterst_m: 350, skal: 'ok', ...o,
});

describe('appens lass för en trakt', () => {
  it('läser på ALLA traktens nummer — ett lass under ett annat nummer tappas tyst', async () => {
    const { sb, anrop } = fejk([]);
    await lasAppLass(sb as any, ['11271883', 'R64428_12', '11166477']);
    expect(anrop[0].namn).toBe('skotar_lass_cykel');
    expect(anrop[0].args.p_vo).toEqual(['11271883', 'R64428_12', '11166477']);
  });

  it('dubbletter i numren frågas bara en gång', async () => {
    const { sb, anrop } = fejk([]);
    await lasAppLass(sb as any, ['X', 'X', '', 'Y']);
    expect(anrop[0].args.p_vo).toEqual(['X', 'Y']);
  });

  it('avståndet är HALVA cykeln — enkel väg', async () => {
    const { sb } = fejk([rad({ cykel_m: 1477 })]);
    const r = await lasAppLass(sb as any, ['X']);
    expect(r).toHaveLength(1);
    expect(r[0].avstandM).toBeCloseTo(738.5, 1);
    expect(r[0].volym).toBe(20);
    expect(r[0].kalla).toBe('app');
    expect(r[0].maskinId).toBe('A130743');
  });

  it('lass utan cykel får avstandM null — aldrig 0, som ser mätt ut', async () => {
    const { sb } = fejk([
      rad({ lass_id: 'A', skal: 'forsta_lasset', cykel_m: null }),
      rad({ lass_id: 'B', skal: 'fonster_for_langt', cykel_m: null }),
      rad({ lass_id: 'C', skal: 'inga_punkter', cykel_m: null }),
      rad({ lass_id: 'D', skal: 'saknar_lossning', cykel_m: null }),
    ]);
    const r = await lasAppLass(sb as any, ['X']);
    expect(r).toHaveLength(4);
    for (const l of r) {
      expect(l.avstandM).toBeNull();
      // Lasset KÖRDES: volymen är kvar, så det väger när källorna jämförs.
      expect(l.volym).toBe(20);
    }
  });

  it('cykel 0 är ingen cykel', async () => {
    const { sb } = fejk([rad({ cykel_m: 0 })]);
    expect((await lasAppLass(sb as any, ['X']))[0].avstandM).toBeNull();
  });

  it('inga nummer ger tom lista utan att fråga', async () => {
    const { sb, anrop } = fejk([]);
    expect(await lasAppLass(sb as any, [])).toEqual([]);
    expect(anrop).toHaveLength(0);
  });

  it('ett läsfel KASTAR — en tom lista hade blivit 0 kr som ser mätt ut', async () => {
    const { sb } = fejk(null, { code: '57014', message: 'canceling statement due to statement timeout' });
    await expect(lasAppLass(sb as any, ['X'])).rejects.toThrow(/cykel/i);
  });

  it('en SAKNAD funktion är inte ett läsfel — tom lista, inget gissat avstånd', async () => {
    for (const fel of [
      { code: 'PGRST202', message: 'Could not find the function public.skotar_lass_cykel' },
      { code: '42883', message: 'function skotar_lass_cykel(text[]) does not exist' },
    ]) {
      const { sb } = fejk(null, fel);
      await expect(lasAppLass(sb as any, ['X'])).resolves.toEqual([]);
      // … men den SÄGER det, så underlaget kan varna: utan appens lass bär
      // Optis avståndet ensamma och talet kan bli för HÖGT.
      expect((await lasLassCykel(sb as any, ['X'])).tillganglig).toBe(false);
    }
  });

  it('ett lyckat svar är tillgängligt', async () => {
    const { sb } = fejk([rad()]);
    expect((await lasLassCykel(sb as any, ['X'])).tillganglig).toBe(true);
    // Inga nummer frågar inte, och det är inte ett saknat funktion-fall.
    const tom = fejk([]);
    expect((await lasLassCykel(tom.sb as any, [])).tillganglig).toBe(true);
  });

  it('okänt skäl läses som inga_punkter, aldrig som ok', async () => {
    const { sb } = fejk([rad({ skal: 'nytt_skal_fran_framtiden', cykel_m: 1000 })]);
    const c = (await lasLassCykel(sb as any, ['X'])).rader;
    expect(c[0].skal).toBe('inga_punkter');
    expect((await lasAppLass(sb as any, ['X']))[0].avstandM).toBeNull();
  });

  it('delarna följer med för granskningen', async () => {
    const { sb } = fejk([rad()]);
    const c = (await lasLassCykel(sb as any, ['X'])).rader;
    expect(c[0]).toMatchObject({
      lassId: 'L1', voNummer: '11271860', cykelM: 1000,
      vidAvlaggetM: 200, hemMedLassM: 400, ytterstM: 350, punkter: 120, skal: 'ok',
    });
  });
});

describe('källvakter: hur det är kopplat', () => {
  it('avståndet kommer ur hyttspåret, inte ur lassets spårkopia', () => {
    expect(LAS).toContain('skotar_lass_cykel');
    // Kommentaren FÅR nämna spårkopian (den förklarar varför den är borta) —
    // koden får inte läsa den.
    const kod = LAS.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(kod).not.toMatch(/sparAvstandM|\.spar\b|'spar'/);
  });

  it('underlaget läser appens lass på VO plus dim-numren', () => {
    expect(HAMTA).toMatch(/lasLassCykel\(sb, \[voNummer, \.\.\.objektIds\]\)/);
  });

  it('underlaget VARNAR när cykeln inte gick att läsa — aldrig tyst', () => {
    expect(HAMTA).toContain('!appCykel.tillganglig');
    // Varningen ligger i samma block som flaggan, och den säger åt vilket håll
    // tystnaden lutar: utan appens lass kan talet bli för HÖGT.
    const block = HAMTA.slice(HAMTA.indexOf('!appCykel.tillganglig'));
    expect(block.slice(0, 700)).toContain("niva: 'varning'");
    expect(block.slice(0, 700)).toContain('kan då bli för högt');
  });

  it('källorna vägs mot varandra — aldrig summerade', () => {
    expect(HAMTA).toContain('valjLassKalla([...optiLass, ...appLass])');
    // Loopen som summerar kronor går över de VALDA lassen, inte över båda.
    expect(HAMTA).toMatch(/for \(const l of barande\)/);
    expect(HAMTA).not.toMatch(/for \(const l of \[\.\.\.optiLass/);
  });

  it('halveringen sker på ETT ställe, aldrig med en egen division', () => {
    const utanKommentar = (f: string) => f.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(utanKommentar(LAS)).not.toMatch(/\/\s*2\b/);
    const cykel = readFileSync('lib/faktura/lassCykel.ts', 'utf8');
    expect(cykel).toContain('skotningsavstandM(');
    expect(utanKommentar(cykel)).not.toMatch(/\/\s*2\b/);
  });
});
