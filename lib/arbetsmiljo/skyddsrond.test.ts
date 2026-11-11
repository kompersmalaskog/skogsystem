import { describe, it, expect } from 'vitest';
import { BRAND_OMRADE, OMRADEN, antalBesvarade, avsluta, behoverDigText, byggPunkter, grupperaPunkter, gallerMaskin, lage, platsFranRad, platsText, svara, svarRad, type Rond } from './skyddsrond';
import { atgardTitel, kallaText } from './atgarder';

const nu = new Date('2026-11-02T12:00:00Z');
const maskiner = [{ id: 'G', namn: 'Giant' }, { id: 'W', namn: 'Wisent' }];
const rond = (o: Partial<Rond>): Rond => ({ id: 'r', punkter: byggPunkter(maskiner), deltagare: null, startad: '2026-11-01T08:00:00Z', klar: null, svar: [], ...o });

describe('skyddsronden', () => {
  it('två brandskyddspunkter per maskin först, sedan alla områden, unika id', () => {
    const p = byggPunkter(maskiner);
    expect(p.slice(0, 4).map(x => x.id)).toEqual(['brand_protokoll:G', 'brand_slackare:G', 'brand_protokoll:W', 'brand_slackare:W']);
    expect(p[0]).toMatchObject({ omrade: BRAND_OMRADE, maskinId: 'G' });
    expect(p.length).toBe(4 + OMRADEN.reduce((n, o) => n + o.punkter.length, 0));
    expect(new Set(p.map(x => x.id)).size).toBe(p.length);
    expect(grupperaPunkter(p).map(g => g.namn)[0]).toBe('Brandskydd på maskinerna');
  });

  it('läget: ingen rond = dags; pågående = fortsätt; gjord i år = ok; över ett år = dags igen', () => {
    expect(lage([], nu).typ).toBe('dags');
    expect(behoverDigText(lage([], nu))).toBe('Dags för skyddsrond');
    const p = rond({ svar: [{ punkt: 'brand_protokoll:G', svar: 'ok', beskrivning: null }] });
    expect(behoverDigText(lage([p], nu))).toBe(`Fortsätt skyddsronden · 1 av ${p.punkter.length}`);
    const klar = rond({ klar: '2026-03-01T10:00:00Z' });
    expect(lage([klar], nu)).toMatchObject({ typ: 'ok' });
    expect(behoverDigText(lage([klar], nu))).toBeNull();
    expect(lage([rond({ klar: '2025-10-01T10:00:00Z' })], nu).typ).toBe('dags');
  });

  it('svar på en punkt som inte finns i ronden räknas inte', () => {
    expect(antalBesvarade(rond({ svar: [{ punkt: 'finns_inte', svar: 'ok', beskrivning: null }] }))).toBe(0);
  });

  it('brist utan text sparas aldrig; avslut utan deltagare skickas inte', async () => {
    let anrop = 0;
    const sb = { from: () => { anrop++; return { upsert: async () => ({ error: null }) }; } } as never;
    expect(await svara(sb, 'r', byggPunkter(maskiner)[0], 'brist', '  ')).toBe(false);
    expect(anrop).toBe(0);
    expect(await svara(sb, 'r', byggPunkter(maskiner)[0], 'brist', 'saknas')).toBe(true);
    expect(await avsluta(sb, 'r', ' ')).toBe('Skriv vilka som gick ronden.');
  });

  it('en brist från ronden heter Skyddsrond i åtgärdslistan', () => {
    expect(kallaText('skyddsrond')).toBe('Skyddsrond');
    expect(atgardTitel({ kalla: 'skyddsrond', maskinNamn: 'Giant' })).toBe('Skyddsrond · Giant');
    expect(atgardTitel({ kalla: 'skyddsrond', maskinNamn: null })).toBe('Skyddsrond');
  });
});

describe('skyddsrond: brist på maskinbilden', () => {
  const p = byggPunkter(maskiner).find(x => x.id === 'brand_slackare:G')!;
  const sasong = byggPunkter(maskiner).find(x => x.id === 'sasong')!;
  const val = { del: 'slackare' as const, x: 200, y: 120, sida: 'hoger' as const };

  it('bara punkter som gäller en maskin får bilden', () => {
    expect(gallerMaskin(p)).toBe(true);
    expect(gallerMaskin(sasong)).toBe(true);
    expect(gallerMaskin({ id: 'forband' })).toBe(true);
    expect(gallerMaskin({ id: 'hlr' })).toBe(false);
    expect(gallerMaskin({ id: 'mar' })).toBe(false);
  });

  it('raden: brist med plats får del, x/y 0..1 och sida; utan plats nollas allt', () => {
    expect(svarRad('r', p, 'brist', 'Tom', null, { maskinId: 'G', val })).toMatchObject({
      maskin_id: 'G', maskin_del: 'slackare', maskin_x: 0.5, maskin_y: 0.5, maskin_sida: 'hoger',
    });
    expect(svarRad('r', p, 'brist', 'Tom', null, null)).toMatchObject({ maskin_id: 'G', maskin_del: null, maskin_x: null, maskin_y: null, maskin_sida: null });
    // Vald maskin utan plats: maskinen sparas, ingen prick.
    expect(svarRad('r', sasong, 'brist', 'Spade', null, { maskinId: 'W', val: null })).toMatchObject({ maskin_id: 'W', maskin_del: null });
    // Utan sida: sidan nollas, aldrig en gissad.
    expect(svarRad('r', p, 'brist', 'Tom', null, { maskinId: 'G', val: { del: 'kran', x: 10, y: 10 } })).toMatchObject({ maskin_sida: null });
  });

  it('Bra och Gäller inte sparar aldrig en plats, och punktens egen maskin står kvar', () => {
    expect(svarRad('r', p, 'ok', null, 'x.jpg', { maskinId: 'W', val })).toMatchObject({ maskin_id: 'G', maskin_del: null, foto_url: null, beskrivning: null });
    expect(svarRad('r', sasong, 'galler_inte', null, null, { maskinId: 'W', val })).toMatchObject({ maskin_id: null, maskin_del: null });
  });

  it('platsen läses tillbaka och sägs i ord', () => {
    const pl = platsFranRad({ id: 's', rond_id: 'r', punkt: 'x', svar: 'brist', beskrivning: 'Tom', foto_url: null, maskin_id: 'G',
      maskin_del: 'slackare', maskin_x: 0.5, maskin_y: 0.5, maskin_sida: 'hoger', dim_maskin: { maskin_typ: 'Harvester', modell: 'Scorpion Giant 8W' } });
    expect(pl?.typ).toBe('skordare8');
    expect(platsText(pl)).toBe('Släckare, höger sida');
    // Fel värde eller ingen brist → ingen plats.
    expect(platsFranRad({ id: 's', rond_id: 'r', punkt: 'x', svar: 'brist', beskrivning: 'Tom', foto_url: null, maskin_id: 'G', maskin_del: 'kran', maskin_x: 2, maskin_y: 0.5 })).toBeNull();
    expect(platsFranRad({ id: 's', rond_id: 'r', punkt: 'x', svar: 'ok', beskrivning: null, foto_url: null, maskin_id: 'G', maskin_del: 'kran', maskin_x: 0.1, maskin_y: 0.5 })).toBeNull();
    // Maskin utan teckning: ingen text.
    expect(platsText({ maskinId: 'L', typ: null, val })).toBeNull();
  });
});
