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
