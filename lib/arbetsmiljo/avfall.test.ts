import { describe, it, expect } from 'vitest';
import { arSvar, avfallDokument, forAr, forvald, lamningTitel, lamningUnder, poster, posterText, svar, uppskattaKg, type Lamning } from './avfall';
import { dataUrlTillBlob, laggIKo, lasKo, skickaKo, vantande, type KoPost } from './avfallKo';

const l = (o: Partial<Lamning>): Lamning => ({
  id: 'x', mottagareNamn: 'LBC Ryd', poster: [{ typ: 'slang', antal: 2 }, { typ: 'trasor' }], kg: 7, kvitteradNamn: 'Kalle',
  underskriftSokvag: 'm/avfall/x-underskrift.png', foljesedelSokvag: null, lamnadTid: '2026-11-03T14:40:00Z', lamnadAvNamn: 'Stefan', ...o,
});

describe('formuläret', () => {
  it('bara det som är valt blir poster, i fast ordning', () => {
    expect(poster({ slang: 2, dunkar: 0, trasor: true, annat: false, annatText: '' })).toEqual([{ typ: 'slang', antal: 2 }, { typ: 'trasor' }]);
    expect(poster({ slang: 0, dunkar: 0, trasor: false, annat: false, annatText: '' })).toEqual([]);
    expect(poster({ slang: 0, dunkar: 3, trasor: false, annat: true, annatText: '  oljefilter ' })).toEqual([{ typ: 'dunkar', antal: 3 }, { typ: 'annat', text: 'oljefilter' }]);
  });
  it('vikten: 2 kg per slang, 3 kg trasor, 1 kg per dunk, aldrig 0 när något är valt', () => {
    expect(uppskattaKg([{ typ: 'slang', antal: 2 }, { typ: 'trasor' }])).toBe(7);
    expect(uppskattaKg([{ typ: 'dunkar', antal: 1 }])).toBe(1);
    expect(uppskattaKg([])).toBe(0);
  });
  it('texten säger vad det var i vanliga ord', () => {
    expect(posterText([{ typ: 'slang', antal: 1 }, { typ: 'trasor' }, { typ: 'dunkar', antal: 2 }])).toBe('1 slang, trasor, 2 dunkar');
    expect(lamningUnder(l({}))).toBe('2 slangar, trasor · ca 7 kg');
    expect(lamningTitel(l({}))).toBe('LBC Ryd · 3 nov');
  });
  it('förvalt ställe är det man senast lämnade på, annars det första', () => {
    const m = [{ id: 'a', namn: 'LBC Ryd' }, { id: 'b', namn: 'Hydroscand' }];
    expect(forvald(m, 'b')).toBe('b');
    expect(forvald(m, 'borta')).toBe('a');
    expect(forvald([], null)).toBeNull();
  });
});

describe('svaret', () => {
  it('senaste lämningen, eller att något väntar på täckning', () => {
    expect(svar([])).toMatchObject({ text: 'Inget lämnat än' });
    expect(svar([l({ id: 'a', lamnadTid: '2026-10-03T08:00:00Z' }), l({ id: 'b' })])).toMatchObject({ text: 'Senast lämnat 3 nov', under: 'LBC Ryd · kvitterat' });
    expect(svar([l({ vantar: true })])).toMatchObject({ text: '1 lämning väntar på täckning', ton: 'orange' });
  });
  it('året räknas i svensk tid', () => {
    const nyar = l({ lamnadTid: '2026-12-31T23:30:00Z' });
    expect(forAr([nyar], 2027)).toHaveLength(1);
    expect(arSvar([l({ kg: 2 }), l({ kg: 4.5 })])).toEqual({ text: '2 lämningar', under: 'ca 6,5 kg · alla kvitterade' });
  });
});

describe('årets lista som PDF-innehåll', () => {
  it('en rad per lämning med avfallskod, vikt, vem som lämnade och vem som tog emot', () => {
    const d = avfallDokument([l({}), l({ id: 'v', vantar: true }), l({ id: 'g', lamnadTid: '2025-05-01T10:00:00Z' })], 2026, new Date('2026-11-03T15:00:00Z'));
    expect(d.titel).toBe('Farligt avfall 2026');
    expect(d.sektioner[0].rader).toHaveLength(1);
    const r = d.sektioner[0].rader[0];
    expect(r.titel).toBe('3 november 2026 · LBC Ryd');
    expect(r.text).toBe('Hydraulslangar 2 st (16 01 21*), Trasor och absorbent (15 02 02*) · ca 7 kg · lämnat av Stefan');
    expect(r.status).toBe('Mottaget av Kalle 15:40');
    expect(d.not).toContain('minst tre år');
  });
  it('ett tomt år säger det', () => {
    expect(avfallDokument([], 2026).svar).toBe('Inget farligt avfall lämnat');
  });
});

// ── Kön i telefonen ─────────────────────────────────────────────────────────────────────────────────────────────────────
class Minne { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const post = (id: string): KoPost => ({
  id, medarbetareId: 'm1', mottagareId: 'a', mottagareNamn: 'LBC Ryd', poster: [{ typ: 'slang', antal: 1 }], kg: 2,
  kvitteradNamn: 'Kalle', underskrift: PNG, foljesedel: null, skapad: '2026-11-03T14:40:00Z', lamnadAvNamn: 'Stefan',
});

function fakeSb(o: { natFel?: boolean; finnsRedan?: boolean } = {}) {
  const uppladdat: string[] = [];
  const rader: Record<string, unknown>[] = [];
  return {
    uppladdat, rader,
    storage: { from: () => ({ upload: async (s: string) => {
      if (o.natFel) return { error: { message: 'Failed to fetch' } };
      if (uppladdat.includes(s)) return { error: { message: 'The resource already exists', statusCode: '409' } };
      uppladdat.push(s); return { error: null };
    } }) },
    from: () => ({ insert: async (r: Record<string, unknown>) => {
      if (o.finnsRedan || rader.some(x => x.id === r.id)) return { error: { code: '23505' } };
      rader.push(r); return { error: null };
    } }),
  };
}

describe('kön', () => {
  it('sparas i telefonen först och skickas sedan: bilden under förarens mapp, sedan raden', async () => {
    const m = new Minne();
    expect(laggIKo(post('p1'), m)).toBe(true);
    expect(vantande(m)[0]).toMatchObject({ id: 'p1', vantar: true });
    const sb = fakeSb();
    expect(await skickaKo(sb as never, m)).toBe(0);
    expect(sb.uppladdat).toEqual(['m1/avfall/p1-underskrift.png']);
    expect(sb.rader[0]).toMatchObject({ id: 'p1', underskrift_sokvag: 'm1/avfall/p1-underskrift.png', mottagare_namn: 'LBC Ryd' });
    expect(lasKo(m)).toEqual([]);
  });
  it('utan nät ligger den kvar; ett omförsök efter halva vägen dubblerar ingenting', async () => {
    const m = new Minne();
    laggIKo(post('p1'), m);
    expect(await skickaKo(fakeSb({ natFel: true }) as never, m)).toBe(1);
    const sb = fakeSb({ finnsRedan: true });
    expect(await skickaKo(sb as never, m)).toBe(0);
    expect(sb.rader).toEqual([]);
  });
  it('data-URL blir en bild', () => {
    expect(dataUrlTillBlob(PNG).type).toBe('image/png');
  });
});
