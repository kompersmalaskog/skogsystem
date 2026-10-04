import { describe, it, expect } from 'vitest';
import { barighetText, byggVarningar, telHref, type MarkeringRow } from './objekt-info';

const rad = (objekt_id: string | null, data: any): MarkeringRow => ({ objekt_id, typ: 'marker', data });

describe('byggVarningar — ALLA faror och hänsyn, med planerarens kommentar', () => {
  it('flera faror och hänsyn på samma objekt: alla med, var och en med sin kommentar', () => {
    const w = byggVarningar([
      rad('A', { type: 'powerline', comment: 'Stolpe 3 m från vägen' }),
      rad('A', { type: 'warning', comment: '  Sluttning mot bäcken  ' }),   // kommentaren trimmas
      rad('A', { type: 'fornlamning', comment: 'Stensättning, kör inte här' }),
      rad('A', { type: 'highstump' }),                                       // ingen kommentar → null
    ])['A'];
    expect(w.faror).toEqual([{ label: 'Kraftledning', kommentar: 'Stolpe 3 m från vägen' }, { label: 'Varning', kommentar: 'Sluttning mot bäcken' }]);
    expect(w.hansyn).toEqual([{ label: 'Fornlämning', kommentar: 'Stensättning, kör inte här' }, { label: 'Högstubbe', kommentar: null }]);
  });
  it('samma fara två gånger med OLIKA kommentarer = två faror; med samma kommentar = en', () => {
    const w = byggVarningar([
      rad('A', { type: 'powerline', comment: 'norr' }), rad('A', { type: 'powerline', comment: 'söder' }),
      rad('A', { type: 'powerline', comment: 'norr' }),
    ])['A'];
    expect(w.faror.map((f) => f.kommentar)).toEqual(['norr', 'söder']);
  });
  it('övriga markeringar (väg, avlägg, brant …) och rader utan objekt hör inte hit', () => {
    const w = byggVarningar([rad('A', { type: 'landing', comment: 'avlägg' }), rad('A', { lineType: 'mainRoad' }), rad(null, { type: 'powerline' }), rad('A', null)]);
    expect(w).toEqual({});
  });
  it('zon-, linje- och pilnycklar räknas som subtyp, och en okänd subtyp får inget påhittat namn', () => {
    const w = byggVarningar([rad('A', { zoneType: 'naturecorner', comment: 'Hänsynsyta' }), rad('A', { type: 'powerline' })])['A'];
    expect(w.hansyn).toEqual([{ label: 'Naturhörn', kommentar: 'Hänsynsyta' }]);
    expect(w.faror).toEqual([{ label: 'Kraftledning', kommentar: null }]);
  });
  it('kommentar som inte är text eller bara är blanksteg → ingen kommentar', () => {
    const w = byggVarningar([rad('A', { type: 'powerline', comment: 42 }), rad('B', { type: 'powerline', comment: '   ' })]);
    expect(w['A'].faror[0].kommentar).toBeNull();
    expect(w['B'].faror[0].kommentar).toBeNull();
  });
  it('objekten hålls isär, och ordningen är stabil oavsett radernas ordning', () => {
    const a = byggVarningar([rad('A', { type: 'warning' }), rad('B', { type: 'powerline' }), rad('A', { type: 'powerline' })]);
    const b = byggVarningar([rad('A', { type: 'powerline' }), rad('A', { type: 'warning' }), rad('B', { type: 'powerline' })]);
    expect(a).toEqual(b);
    expect(a['A'].faror.map((f) => f.label)).toEqual(['Kraftledning', 'Varning']);
    expect(a['B'].faror.map((f) => f.label)).toEqual(['Kraftledning']);
  });
});

describe('barighetText', () => {
  it('bra · medel · dålig, och bara dålig är en begränsning', () => {
    expect(barighetText('bra')).toEqual({ text: 'Bra', begransning: false });
    expect(barighetText('medel')).toEqual({ text: 'Medel', begransning: false });
    expect(barighetText('dalig')).toEqual({ text: 'Dålig', begransning: true });
    expect(barighetText('dålig')).toEqual({ text: 'Dålig', begransning: true });
    expect(barighetText(' DALIG ')).toEqual({ text: 'Dålig', begransning: true });
  });
  it('gamla synonymer, okänt värde som det står, tomt → null', () => {
    expect(barighetText('god')).toEqual({ text: 'Bra', begransning: false });
    expect(barighetText('normal')).toEqual({ text: 'Medel', begransning: false });
    expect(barighetText('sankt')).toEqual({ text: 'Sankt', begransning: false });
    expect(barighetText('')).toBeNull();
    expect(barighetText('  ')).toBeNull();
    expect(barighetText(null)).toBeNull();
    expect(barighetText(undefined)).toBeNull();
  });
});

describe('telHref', () => {
  it('rensar mellanslag och bindestreck, behåller inledande +', () => {
    expect(telHref('070-123 45 67')).toBe('tel:0701234567');
    expect(telHref(' +46 70 123 45 67 ')).toBe('tel:+46701234567');
    expect(telHref('0478-123 45')).toBe('tel:047812345');
  });
  it('inget nummer → ingen länk (hellre ingen knapp än en som ringer fel)', () => {
    for (const t of [null, undefined, '', '  ', '-', 'Ring Anders', '12345', '+']) expect(telHref(t)).toBeNull();
  });
  it('ett + mitt i numret är inget landsnummer', () => {
    expect(telHref('070+1234567')).toBe('tel:0701234567');
  });
});
