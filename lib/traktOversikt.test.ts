import { describe, expect, it } from 'vitest';
import { behoverVisas, inforJobbet, lasSett, markeringSignatur, nyaMarkeringar, oversiktMening, oversiktUnder, signaturer, sparaSett, textNy } from './traktOversikt';

const lager = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const markers = [{ id: 1, type: 'eternitytree', comment: '' }, { id: 2, type: 'warning', comment: 'Stolpe lutar' }];
const sig = (ms = markers, texter = ['Lämna kantzon']) => signaturer({ markers: ms, kommentarIds: ['k1'], texter, infor: [] });

describe('överblicken — när den visas', () => {
  it('aldrig sett → visas; samma innehåll efter Börja köra → visas inte', () => {
    const l = lager();
    expect(lasSett('GIANT', 'o1', l)).toBeNull();
    expect(behoverVisas(null, sig())).toBe(true);
    sparaSett('GIANT', 'o1', sig(), l);
    expect(behoverVisas(lasSett('GIANT', 'o1', l), sig())).toBe(false);
  });
  it('per maskin: en annan maskin på samma trakt får överblicken', () => {
    const l = lager();
    sparaSett('GIANT', 'o1', sig(), l);
    expect(lasSett('WISENT', 'o1', l)).toBeNull();
  });
  it('planeraren lägger till, ändrar en kommentar eller ändrar direktivet → visas igen, och det nya märks', () => {
    const sett = new Set(sig());
    const ny = [...markers, { id: 3, type: 'highstump', comment: '' }];
    expect(behoverVisas(sett, sig(ny))).toBe(true);
    expect([...nyaMarkeringar(sett, ny)]).toEqual(['3']);
    const andrad = [markers[0], { ...markers[1], comment: 'Stolpe lutar mot vägen' }];
    expect(behoverVisas(sett, sig(andrad))).toBe(true);
    expect([...nyaMarkeringar(sett, andrad)]).toEqual(['2']);
    expect(behoverVisas(sett, sig(markers, ['Lämna kantzon 10 m']))).toBe(true);
    expect(textNy(sett, 'Lämna kantzon 10 m')).toBe(true);
    expect(textNy(sett, 'Lämna kantzon')).toBe(false);
  });
  it('något som tagits bort ger ingen ny överblick', () => {
    expect(behoverVisas(new Set(sig()), sig([markers[0]]))).toBe(false);
  });
  it('första gången märks inget som nytt (allt är nytt)', () => {
    expect(nyaMarkeringar(null, markers).size).toBe(0);
    expect(textNy(null, 'x')).toBe(false);
  });
  it('en ny kartkommentar på en symbol märker symbolen', () => {
    const sett = new Set(sig());
    expect([...nyaMarkeringar(sett, markers, [{ id: 'k1', nyckel: 'marker:1' }, { id: 'k2', nyckel: 'marker:2' }])]).toEqual(['2']);
  });
  it('trasigt minne = aldrig sett (visas hellre en gång för mycket)', () => {
    expect(lasSett('G', 'o', { getItem: () => '{inte json' })).toBeNull();
    expect(lasSett('G', 'o', { getItem: () => { throw new Error('blockerat'); } })).toBeNull();
  });
  it('samma markering ger samma signatur', () => {
    expect(markeringSignatur(markers[1])).toBe(markeringSignatur({ ...markers[1] }));
  });
});

describe('överblicken — vad som står', () => {
  it('Inför jobbet = bara det som avviker', () => {
    const rader = [
      { id: 'avlagg', etikett: 'Avlägg', text: '2 från Vida' }, { id: 'basvag', etikett: 'Basväg', text: 'Röd · 640 m' },
      { id: 'barighet', etikett: 'Bärighet', text: 'Bra' }, { id: 'terrang', etikett: 'Terräng', text: 'Lätt' },
      { id: 'band-skordare', etikett: 'Band skördare', text: 'Ja' }, { id: 'ved', etikett: 'Ved till markägaren', text: 'vid avlägget' },
      { id: 'manuell', etikett: 'Manuell fällning', text: 'Ja' },
    ];
    expect(inforJobbet(rader).map((r) => r.id)).toEqual(['band-skordare', 'ved', 'manuell']);
    expect(inforJobbet([{ id: 'barighet', etikett: 'Bärighet', text: 'Dålig' }])).toHaveLength(1);
  });
  it('raden under namnet: bara det som finns', () => {
    expect(oversiktUnder('Slutavverkning', ['PEFC'], 2.51)).toBe('Slutavverkning · PEFC · 2,5 ha');
    expect(oversiktUnder('Gallring', [], null)).toBe('Gallring');
    expect(oversiktUnder('Slutavverkning', ['PEFC', 'FSC'], 0)).toBe('Slutavverkning · PEFC och FSC');
  });
  it('meningen överst', () => {
    expect(oversiktMening({ faror: 2, infor: 3, paKartan: 24, medText: 5 })).toBe('2 faror · 3 saker inför jobbet · 24 saker på kartan, 5 med text');
    expect(oversiktMening({ faror: 1, infor: 0, paKartan: 1, medText: 0 })).toBe('1 fara · 1 sak på kartan');
    expect(oversiktMening({ faror: 0, infor: 0, paKartan: 0, medText: 0 })).toBe('Inga faror');
  });
});

describe('överblicken — kvitto, cert, skydd (2026-11-05)', async () => {
  const { oversiktUnderlag, harLastOversikt, certRad, skyddadeOmraden, utanTextRad, nyaKommentarer, kommentarSig, OVERSIKT_PREFIX } = await import('./traktOversikt');
  it('kvittot: eget prefix, samma innehåll samma underlag, en ändring ger ett nytt', () => {
    const a = oversiktUnderlag(['m:1:a', 'k:2:b']);
    expect(a.startsWith(OVERSIKT_PREFIX)).toBe(true);
    expect(oversiktUnderlag(['k:2:b', 'm:1:a'])).toBe(a);
    expect(oversiktUnderlag(['m:1:a', 'k:2:c'])).not.toBe(a);
    expect(harLastOversikt([{ medarbetareId: 's', underlag: a }], 's', a)).toBe(true);
    expect(harLastOversikt([{ medarbetareId: 'v', underlag: a }], 's', a)).toBe(false);   // per förare: en vikarie måste läsa själv
    expect(harLastOversikt([{ medarbetareId: 's', underlag: a }], null, a)).toBe(false);
  });
  it('cert: det ni satt ut, i ord — klart eller hur många som fattas; inget cert eller inget krav = ingen rad', () => {
    const allt = [{ id: 'hogstubbar', antal: 8, krav: 8 }, { id: 'evighetstrad', antal: 26, krav: 26 }];
    expect(certRad(['PEFC'], allt)).toEqual({ text: 'PEFC: alla 26 evighetsträd och 8 högstubbar är utsatta – spara dem.', klar: true });
    expect(certRad(['PEFC'], [{ id: 'hogstubbar', antal: 8, krav: 8 }, { id: 'evighetstrad', antal: 18, krav: 26 }]))
      .toEqual({ text: 'PEFC: 18 av 26 evighetsträd utsatta – 8 till behövs.', klar: false });
    expect(certRad(['PEFC', 'FSC'], allt)!.text.startsWith('PEFC och FSC:')).toBe(true);
    expect(certRad([], allt)).toBeNull();
    expect(certRad(['PEFC'], [{ id: 'hogstubbar', antal: 3, krav: null }])).toBeNull();
  });
  it('skyddade områden: aldrig körd ≠ inget hittat', () => {
    expect(skyddadeOmraden([], false).lage).toBe('inte');
    expect(skyddadeOmraden([], true).lage).toBe('inga');
    const r = skyddadeOmraden([{ type: 'vattenskydd', name: 'Ryd', warning: 'Ingen tankning' }], true);
    expect(r).toEqual({ lage: 'finns', rader: [{ namn: 'Vattenskyddsområde · Ryd', text: 'Ingen tankning' }] });
  });
  it('utan text: en rad, sorter utan något hoppas över', () => {
    expect(utanTextRad([{ namn: 'Avlägg', antal: 1 }, { namn: 'Basväg', antal: 0 }, { namn: 'Blött', antal: 4 }])).toBe('Avlägg 1 · Blött 4');
    expect(utanTextRad([])).toBe('');
  });
  it('en ändrad kommentar är ny', () => {
    const sett = new Set([kommentarSig('k1', 'Kör inte här')]);
    expect([...nyaKommentarer(sett, [{ id: 'k1', text: 'Kör inte här' }])]).toEqual([]);
    expect([...nyaKommentarer(sett, [{ id: 'k1', text: 'Kör inte här alls' }])]).toEqual(['k1']);
    expect(nyaKommentarer(null, [{ id: 'k1', text: 'x' }]).size).toBe(0);
  });
});

import { certLage } from './traktOversikt';
describe('certLage', () => {
  it('FSC/PEFC = certifierad, "Ej certifierad"/"None" = inte, tomt eller "Not known" = okänt', () => {
    expect(certLage('FSC PEFC', ['PEFC', 'FSC'])).toEqual({ lage: 'cert', namn: 'PEFC och FSC' });
    expect(certLage('Ej certifierad', []).lage).toBe('ingen');
    expect(certLage('None', []).lage).toBe('ingen');
    expect(certLage('Not known', []).lage).toBe('okand');
    expect(certLage(null, []).lage).toBe('okand');
  });
});
