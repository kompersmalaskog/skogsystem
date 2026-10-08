import { describe, expect, it } from 'vitest';
import { byggUtforanderader, utforandeKatalog, utforandeUnderrad } from './egenkontroll';

// Katalogen bor i kod (underraden ar en fast etikett, inte en kolumn). Det ar den
// som bestammer hur manga utforandepunkter en NY runda far - och de fjorton rundorna
// som redan finns i prod bygger INTE om (ingen backfill), sa de behaller sina nio/atta.

const SLUTAVVERKNING_FORE = [
  'risning_basvag', 'rishogar', 'korspar', 'avlagg', 'upplagg_avverkning', 'stubbhojder',
  'frotrad_eller_skarm', 'kantzon_mot_vatten', 'hyggesrester_mot_markberedning',
];
const GALLRING_FORE = [
  'risning_basvag', 'rishogar', 'korspar', 'avlagg', 'upplagg_avverkning', 'stubbhojder',
  'val_av_stammar', 'tradslagsblandning_kvar',
];

describe('utforandekatalogen - tva nya punkter, bada avverkningstyperna', () => {
  it('slutavverkning: 11 punkter (var 9)', () => {
    expect(utforandeKatalog('slutavverkning')).toHaveLength(11);
  });
  it('gallring: 10 punkter (var 8)', () => {
    expect(utforandeKatalog('gallring')).toHaveLength(10);
  });

  it('de befintliga punkterna behaller sina platser - de nya kommer SIST', () => {
    const slut = utforandeKatalog('slutavverkning').map((m) => m.slug);
    const gall = utforandeKatalog('gallring').map((m) => m.slug);
    expect(slut.slice(0, SLUTAVVERKNING_FORE.length)).toEqual(SLUTAVVERKNING_FORE);
    expect(gall.slice(0, GALLRING_FORE.length)).toEqual(GALLRING_FORE);
    expect(slut.slice(-2)).toEqual(['naturhansyn_utforande', 'grotuttag']);
    expect(gall.slice(-2)).toEqual(['naturhansyn_utforande', 'grotuttag']);
  });

  it('rubriker och underrader som i uppdraget', () => {
    for (const typ of ['slutavverkning', 'gallring'] as const) {
      const k = utforandeKatalog(typ);
      const nat = k.find((m) => m.slug === 'naturhansyn_utforande')!;
      const grot = k.find((m) => m.slug === 'grotuttag')!;
      expect(nat.rubrik).toBe('Naturhänsynens utförande');
      expect(nat.underrad).toBe('Högstubbar, grova toppar, död ved');
      expect(grot.rubrik).toBe('Grotuttaget');
      expect(grot.underrad).toBe('Påverkan på hänsyn och mark');
    }
  });

  it('slugs ar unika inom varje typ - de ar stabila nycklar', () => {
    for (const typ of ['slutavverkning', 'gallring'] as const) {
      const slugs = utforandeKatalog(typ).map((m) => m.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('underraden slas upp pa slug - ocksa for de nya, och Rishogar behaller sin', () => {
    expect(utforandeUnderrad('naturhansyn_utforande')).toBe('Högstubbar, grova toppar, död ved');
    expect(utforandeUnderrad('grotuttag')).toBe('Påverkan på hänsyn och mark');
    expect(utforandeUnderrad('rishogar')).toBe('Placering och åtkomst');
    expect(utforandeUnderrad('korspar')).toBeNull();
    expect(utforandeUnderrad('okand_slug')).toBeNull();
    expect(utforandeUnderrad(null)).toBeNull();
  });
});

describe('byggUtforanderader - raderna som skrivs vid generering', () => {
  it('varje rad ar en fast utforandepunkt utan plats: del, kalla, markering_id null, obesvarad', () => {
    for (const typ of ['slutavverkning', 'gallring'] as const) {
      for (const r of byggUtforanderader(typ)) {
        expect(r).toMatchObject({
          del: 'utforande', kalla: 'fast', grupp: null,
          markering_id: null, markering_marker_id: null,
          antal_planerat: null, geometri_snapshot: null, plan_kommentar: null, status: null,
        });
        expect(r.rubrik.length).toBeGreaterThan(0);
        expect(r.punkt_typ).toBeTruthy();
      }
    }
  });

  it('antalen och rubrikerna per avverkningstyp', () => {
    const slut = byggUtforanderader('slutavverkning');
    const gall = byggUtforanderader('gallring');
    expect(slut).toHaveLength(11);
    expect(gall).toHaveLength(10);
    expect(slut.slice(-2).map((r) => r.rubrik)).toEqual(['Naturhänsynens utförande', 'Grotuttaget']);
    expect(gall.slice(-2).map((r) => r.rubrik)).toEqual(['Naturhänsynens utförande', 'Grotuttaget']);
  });

  it('stubbehandlingen (mätning) och planpunkterna hor inte hit - bara utforande', () => {
    for (const typ of ['slutavverkning', 'gallring'] as const) {
      expect(byggUtforanderader(typ).every((r) => r.del === 'utforande')).toBe(true);
      expect(byggUtforanderader(typ).some((r) => r.punkt_typ === 'stubbehandling')).toBe(false);
    }
  });

  it('hogstubbarna flyttas inte: ingen av de nya raderna har en markering eller en plats', () => {
    const nya = byggUtforanderader('slutavverkning').filter((r) => ['naturhansyn_utforande', 'grotuttag'].includes(r.punkt_typ));
    expect(nya).toHaveLength(2);
    for (const r of nya) {
      expect(r.markering_id).toBeNull();
      expect(r.geometri_snapshot).toBeNull();
    }
  });
});
