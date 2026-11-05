import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { byggMaskinerNu, narText, etikett, tryckText, maskinerNuGeoJson, ritaMaskinerNu, MASKINER_NU_LAGER, type MaskinPosRad } from './maskinerNu';
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from './sparStil';
import { FARG } from './design/tokens';
import { lagerRang as rangFor } from './lagerOrdning';

const nu = new Date('2026-11-05T09:30:00Z'); // 10:30 svensk tid
const rad = (o: Partial<MaskinPosRad>): MaskinPosRad => ({ maskin_id: 'PONS20SDJAA270231', roll: 'skordare', objekt_id: 'o1', objekt_namn: 'Bondeskog AU 2026', datum: '2026-11-05', lat: 56.659, lng: 15.358, tid: '2026-11-05T09:25:20Z', ...o });
const register = [
  { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant', maskin_typ: 'Harvester', aktiv_till: null },
  { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'A110148', visningsnamn: 'Elefant AF', maskin_typ: 'Forwarder', aktiv_till: '2026-07-08' },
];

describe('narText — en gammal position ser aldrig färsk ut', () => {
  it('under en timme = färsk, ingen tid', () => expect(narText('2026-11-05T09:00:00Z', '2026-11-05', nu)).toEqual({ farsk: true, nar: '' }));
  it('över en timme idag = klockslaget', () => expect(narText('2026-11-05T07:15:00Z', '2026-11-05', nu)).toEqual({ farsk: false, nar: '08:15' }));
  it('igår och äldre', () => {
    expect(narText('2026-11-04T15:00:00Z', null, nu)).toEqual({ farsk: false, nar: 'igår' });
    expect(narText('2026-11-01T15:00:00Z', null, nu).nar).toBe('1 nov');
  });
  it('utan tid: dagen ur datum, aldrig färsk', () => {
    expect(narText(null, '2026-11-05', nu)).toEqual({ farsk: false, nar: 'idag' });
    expect(narText(null, null, nu)).toEqual({ farsk: false, nar: 'tid okänd' });
  });
});

describe('byggMaskinerNu', () => {
  it('namnet ur registret, rollen ur maskintypen, färsk i rollfärg', () => {
    const [m] = byggMaskinerNu([rad({})], register, nu);
    expect(m).toMatchObject({ namn: 'Giant', roll: 'skordare', farsk: true });
    expect(etikett(m)).toBe('Giant');
    expect(tryckText(m)).toBe('Giant · Bondeskog AU 2026');
    expect(maskinerNuGeoJson([m]).features[0].properties.farg).toBe(ROLLFARG_SKORDARE);
  });
  it('gammal = grå och tiden efter namnet', () => {
    const [m] = byggMaskinerNu([rad({ maskin_id: 'A030353', roll: 'skotare', tid: '2026-11-04T15:00:00Z' })], register, nu);
    expect(etikett(m)).toBe('Wisent · igår');
    expect(tryckText(m)).toBe('Wisent · senast igår · Bondeskog AU 2026');
    expect(maskinerNuGeoJson([m]).features[0].properties.farg).toBe(FARG.text2);
    expect(maskinerNuGeoJson(byggMaskinerNu([rad({ maskin_id: 'A030353', roll: 'skotare' })], register, nu)).features[0].properties.farg).toBe(ROLLFARG_SKOTARE);
  });
  it('bort: den egna maskinen, avslutade maskiner och rader utan position', () => {
    const ut = byggMaskinerNu([
      rad({}), rad({ maskin_id: 'A030353', roll: 'skotare' }), rad({ maskin_id: 'A110148', roll: 'skotare' }), rad({ maskin_id: 'X', lat: null }),
    ], register, nu, 'PONS20SDJAA270231');
    expect(ut.map((m) => m.namn)).toEqual(['Wisent']);
  });
});

describe('namnet', () => {
  it('aldrig maskin-id:t: utan namn i registret står "Okänd maskin"', () => {
    expect(byggMaskinerNu([rad({ maskin_id: 'R64428', roll: 'skordare' })], register, nu)[0].namn).toBe('Okänd maskin');
  });
  it('hooken läser de kolumner som finns i dim_maskin (aktiv_till — kolumnen aktiv finns inte) och väntar på registret', () => {
    const hook = readFileSync('lib/hooks/useMaskinerNu.ts', 'utf8');
    expect(hook).toContain("select('maskin_id, visningsnamn, maskin_typ, aktiv_till')");
    expect(hook).toContain('aktiv && rader && register ?');
  });
});

describe('kartan', () => {
  it('ritar källan och tre lager en gång, sedan bara ny data', () => {
    const lager: string[] = []; let kalla: any = null; let satt = 0;
    const map = { getSource: () => kalla, addSource: () => { kalla = { setData: () => { satt++; } }; }, addLayer: (l: any) => lager.push(l.id) };
    ritaMaskinerNu(map, []);
    ritaMaskinerNu(map, []);
    expect(lager).toEqual([...MASKINER_NU_LAGER]);
    expect(satt).toBe(1);
  });
  it('de andra maskinerna ligger under den egna positionen men över allt annat', () => {
    expect(rangFor({ id: 'maskin-andra-prick', type: 'circle' })).toBeLessThan(rangFor({ id: 'maskin-symbol', type: 'symbol' }));
    expect(rangFor({ id: 'maskin-andra-namn', type: 'symbol', harText: true })).toBeGreaterThan(rangFor({ id: 'zone-label', type: 'symbol', harText: true }));
  });
  it('planeringssidan och kartan utan objekt ritar prickarna; den egna maskinen ritas inte', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).toContain("useMaskinerNu({ map: mapLibreReady ? mapInstanceRef.current : null, aktiv: true, utan: testlage?.maskinId ?? enhetMaskinId ?? null, onTryck: visaMaskinInfo });");
    expect(readFileSync('components/planering/ObjektKartaTom.tsx', 'utf8')).toContain('useMaskinerNu({ map: karta, aktiv: true, utan: maskin?.maskinId ?? null });');
  });
});
