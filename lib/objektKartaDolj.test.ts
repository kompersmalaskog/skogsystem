import { describe, it, expect } from 'vitest';
import { arBehalld, skapaLagerDoljare } from './objektKartaDolj';

function fakeKarta(lager: Record<string, string | undefined>) {
  const vis: Record<string, string | undefined> = { ...lager };
  const k: any = {
    vis,
    getStyle: () => ({ layers: Object.keys(vis).map((id) => ({ id })) }),
    getLayoutProperty: (id: string, p: string) => (p === 'visibility' ? vis[id] : undefined),
    setLayoutProperty: (id: string, p: string, v: string) => { if (p === 'visibility') vis[id] = v; },
    getLayer: (id: string) => (id in vis ? { id } : undefined),
  };
  return k;
}

const OBJEKTLAGER = ['markers-layer', 'arrows-layer', 'line-mainroad-base', 'zone-fill', 'trakt-gr-line', 'trakt-punkt-circle', 'hogar-circle', 'vida-layer', 'planspar-skordare-line', 'larm-pin'];
const BAS = ['bg', 'lm-layer', 'satellite-layer', 'terrain-layer', 'wms-layer-korbarhet'];
const BEHALL = ['objlista-prick', 'objlista-ring', 'objlista-namn', 'maskin-symbol', 'gps-puck'];

describe('göm det valda objektets markeringar medan listan är öppen', () => {
  it('allt som hör till objektet göms (symboler, linjer, zoner, pilar, etiketter, traktgräns, högar, kartbild, spår) — bara prickarna syns', () => {
    const k = fakeKarta(Object.fromEntries([...OBJEKTLAGER, ...BAS, ...BEHALL].map((id) => [id, 'visible'])));
    const d = skapaLagerDoljare(k);
    expect(d.dolj()).toBe(OBJEKTLAGER.length);
    for (const id of OBJEKTLAGER) expect(k.vis[id]).toBe('none');
  });

  it('baskartan, prickarna och förarens position rörs inte', () => {
    const k = fakeKarta(Object.fromEntries([...OBJEKTLAGER, ...BAS, ...BEHALL].map((id) => [id, 'visible'])));
    skapaLagerDoljare(k).dolj();
    for (const id of [...BAS, ...BEHALL]) expect(k.vis[id]).toBe('visible');
    expect(arBehalld('objlista-prick')).toBe(true);
    expect(arBehalld('markers-layer')).toBe(false);
  });

  it('återställer EXAKT: synligt blir synligt, och det som var dolt (planeringsvyns egna val) förblir dolt', () => {
    const k = fakeKarta({ 'markers-layer': 'visible', 'zone-fill': undefined, 'trakt-gr-line': 'none', 'hogar-circle': 'none', 'objlista-prick': 'visible' });
    const d = skapaLagerDoljare(k);
    d.dolj();
    expect(k.vis).toMatchObject({ 'markers-layer': 'none', 'zone-fill': 'none', 'trakt-gr-line': 'none', 'hogar-circle': 'none' });
    d.aterstall();
    expect(k.vis['markers-layer']).toBe('visible');
    expect(k.vis['zone-fill']).toBe('visible');       // utan egen synlighet = synlig
    expect(k.vis['trakt-gr-line']).toBe('none');
    expect(k.vis['hogar-circle']).toBe('none');
  });

  it('lager som skapas eller tänds MEDAN listan är öppen göms vid nästa anrop, och kommer tillbaka vid återställning', () => {
    const k = fakeKarta({ 'markers-layer': 'visible', 'trakt-gr-line': 'none' });
    const d = skapaLagerDoljare(k);
    d.dolj();
    k.vis['yta-nr-label'] = 'visible';          // nytt lager medan listan är öppen
    k.vis['trakt-gr-line'] = 'visible';         // tänds av en effekt medan listan är öppen
    d.dolj();
    expect(k.vis['yta-nr-label']).toBe('none');
    expect(k.vis['trakt-gr-line']).toBe('none');
    d.aterstall();
    expect(k.vis['yta-nr-label']).toBe('visible');
    expect(k.vis['markers-layer']).toBe('visible');
  });

  it('upprepade anrop skriver inte över den sparade synligheten (andra gången ser lagret "none")', () => {
    const k = fakeKarta({ 'markers-layer': 'visible' });
    const d = skapaLagerDoljare(k);
    d.dolj(); d.dolj(); d.dolj();
    d.aterstall();
    expect(k.vis['markers-layer']).toBe('visible');
  });

  it('återställning två gånger är ofarlig, och ett lager som försvunnit hoppas över', () => {
    const k = fakeKarta({ 'markers-layer': 'visible', 'zone-fill': 'visible' });
    const d = skapaLagerDoljare(k);
    d.dolj();
    delete k.vis['zone-fill'];
    expect(d.aterstall()).toBe(1);
    expect(d.aterstall()).toBe(0);
  });

  it('en karta utan stil ger inga fel', () => {
    const k: any = { getStyle: () => { throw new Error('stilen är inte laddad'); } };
    expect(skapaLagerDoljare(k).dolj()).toBe(0);
  });
});
