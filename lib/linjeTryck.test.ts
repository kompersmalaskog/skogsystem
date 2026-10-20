import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EGNA_LINJER_TRAFFLAGER, LINJE_TRAFF_PX, LINJE_TRAFF_RADIE_PX, VIDA_LINJE_TRAFFLAGER, avstandPx, linjeAtgard, narmasteLinje,
} from './linjeTryck';
import { GRUPPER } from './larm/grupper';
import { LINJE_FORKLARING, LINJE_KORT_TYPER, VIDA_FORKLARING, linjeKort } from './symboler';
import { KLICK_LAGER, kategoriForLager, valjKlickKategori } from './klickPrioritet';
import { LINJE_TYP_IDN } from './kartstil';

// Skärmen = vanliga pixlar: projiceringen är identitet, så koordinaterna ÄR pixlar.
const proj = (lng: number, lat: number) => ({ x: lng, y: lat });
const linje = (...pts: [number, number][]) => ({ type: 'LineString', coordinates: pts });
const vag = linje([0, 100], [200, 100]);   // vågrät linje på y = 100 (ritad bara 3 px bred — träffytan är det som räknas)

describe('träffyta för linjer', () => {
  it('minst 44 px bred: 22 px åt varje håll', () => {
    expect(LINJE_TRAFF_PX).toBeGreaterThanOrEqual(44);
    expect(LINJE_TRAFF_RADIE_PX).toBe(LINJE_TRAFF_PX / 2);
  });
  it('en TUNN linje träffas inom 22 px — och inte längre bort', () => {
    for (const dy of [0, 5, 15, 21.9, 22]) expect(narmasteLinje({ x: 80, y: 100 + dy }, [{ geometri: vag, data: 'a' }], proj), `${dy} px`).not.toBeNull();
    for (const dy of [22.5, 30, 60]) expect(narmasteLinje({ x: 80, y: 100 + dy }, [{ geometri: vag, data: 'a' }], proj), `${dy} px`).toBeNull();
    expect(narmasteLinje({ x: 80, y: 100 - 21 }, [{ geometri: vag, data: 'a' }], proj)).not.toBeNull();   // båda sidor
  });
  it('avstånd räknas till segmentet, inte till linjens förlängning; ändpunkterna är runda', () => {
    expect(avstandPx({ x: 100, y: 130 }, vag, proj)).toBe(30);
    expect(avstandPx({ x: 230, y: 100 }, vag, proj)).toBe(30);                 // bortom änden: avstånd till ändpunkten
    expect(avstandPx({ x: 215, y: 120 }, vag, proj)).toBe(25);                 // 15 bortom + 20 vid sidan
  });
  it('flera linjer under fingret: den NÄRMASTE vinner (inte den som ritats sist)', () => {
    const a = { geometri: linje([0, 100], [200, 100]), data: 'långt' };
    const b = { geometri: linje([0, 110], [200, 110]), data: 'närmast' };
    const c = { geometri: linje([0, 85], [200, 85]), data: 'mellan' };
    const r = narmasteLinje({ x: 50, y: 108 }, [a, b, c], proj)!;
    expect(r.kandidat.data).toBe('närmast');
    expect(r.avstandPx).toBe(2);
    expect(narmasteLinje({ x: 50, y: 108 }, [c, a, b], proj)!.kandidat.data).toBe('närmast');   // ordningen spelar ingen roll
  });
  it('lika långt: den första (resultatet hoppar inte mellan tryck)', () => {
    const r = narmasteLinje({ x: 50, y: 100 }, [{ geometri: linje([0, 90], [200, 90]), data: 'x' }, { geometri: linje([0, 110], [200, 110]), data: 'y' }], proj)!;
    expect(r.kandidat.data).toBe('x');
  });
  it('MultiLineString och ytors kanter räknas; tom geometri träffas aldrig', () => {
    expect(avstandPx({ x: 5, y: 50 }, { type: 'MultiLineString', coordinates: [[[0, 0], [0, 100]], [[300, 0], [300, 100]]] }, proj)).toBe(5);
    expect(avstandPx({ x: 50, y: 5 }, { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] }, proj)).toBe(5);
    expect(avstandPx({ x: 1, y: 1 }, { type: 'LineString', coordinates: [] }, proj)).toBe(Infinity);
    expect(avstandPx({ x: 1, y: 1 }, null, proj)).toBe(Infinity);
    expect(narmasteLinje({ x: 1, y: 1 }, [{ geometri: undefined, data: 1 }], proj)).toBeNull();
  });
});

describe('tryck på VARJE linjetyp öppnar rätt kort', () => {
  const egna = (lineType: string, id = 'm1') => ({ id, isLine: true, lineType });
  const feat = (m: any) => ({ layer: { id: EGNA_LINJER_TRAFFLAGER }, properties: { id: m.id } });
  const typer = ['stonewall', 'mainRoad', 'sideRoadRed', 'sideRoadYellow', 'sideRoadBlue', 'nature', 'ditch', 'trail'];

  it.each(typer)('egen linje %s → markörkortet med namn, grupp och en mening', (t) => {
    const m = egna(t);
    const a = linjeAtgard(feat(m), [m])!;
    expect(a.typ).toBe('markorkort');
    if (a.typ !== 'markorkort') return;
    expect(a.marker).toBe(m);
    const k = linjeKort(t);
    expect(a.kort).toEqual(k);
    expect(k.namn.length).toBeGreaterThan(0);
    expect(k.forklaring.length).toBeGreaterThan(10);
    expect(Object.keys(GRUPPER)).toContain(k.grupp);
  });
  it('Stenmur: Kultur (brun) + dess mening ur teckenförklaringens källa', () => {
    const k = linjeKort('stonewall');
    expect(k).toEqual({ namn: 'Stenmur', grupp: 'kultur', forklaring: LINJE_FORKLARING.stonewall });
  });
  it('egen Traktgräns → samma ytkort som Vidas traktdelar', () => {
    const m = egna('boundary');
    expect(linjeAtgard(feat(m), [m])!.typ).toBe('granskort');
  });
  it('stickväg i snitsel-kartläget → mät mot den; annars markörkortet', () => {
    const m = egna('sideRoadRed');
    expect(linjeAtgard(feat(m), [m], { stickvagMode: true, snitselKarta: true })!.typ).toBe('stickvag-mat');
    expect(linjeAtgard(feat(m), [m], { stickvagMode: true, snitselKarta: false })!.typ).toBe('markorkort');
    const v = egna('mainRoad', 'v');
    expect(linjeAtgard(feat(v), [v], { stickvagMode: true, snitselKarta: true })!.typ).toBe('markorkort');
  });
  it('Vidas Kraftledning → trakt-kortet "Kraftledning · Fara – håll avstånd", samma mening som teckenförklaringen', () => {
    const a = linjeAtgard({ layer: { id: VIDA_LINJE_TRAFFLAGER }, properties: { FLBESKR: 'Kraftledning', _typ: 'linje' } }, [])!;
    expect(a.typ).toBe('vida');
    if (a.typ !== 'vida') return;
    expect(a.kort).toEqual({ slag: 'kraftledning', namn: 'Kraftledning', grupp: 'fara', forklaring: VIDA_FORKLARING.kraftledning });
    expect(a.kort.forklaring).toContain('håll avstånd');
    expect(GRUPPER[a.kort.grupp].namn).toBe('Fara');
  });
  it('Vidas övriga linje (basväg) → Info, med Vidas egen beskrivning som namn', () => {
    const a = linjeAtgard({ layer: { id: VIDA_LINJE_TRAFFLAGER }, properties: { FLBESKR: 'Basväg 3' } }, [])!;
    expect(a.typ === 'vida' && a.kort).toMatchObject({ slag: 'basvag', namn: 'Basväg 3', grupp: 'info' });
    const utan = linjeAtgard({ layer: { id: VIDA_LINJE_TRAFFLAGER }, properties: {} }, [])!;
    expect(utan.typ === 'vida' && utan.kort.namn).toBe('Basväg');
  });
  it('okänd markering (borttagen medan trycket pågick) → ingenting', () => {
    expect(linjeAtgard({ layer: { id: EGNA_LINJER_TRAFFLAGER }, properties: { id: 'finns-inte' } }, [egna('ditch')])).toBeNull();
  });
  it('varje linjetyp som kan ritas har ett kort: kartstilens och planeringens listor', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    const ids = new Set<string>(LINJE_TYP_IDN);   // kartstilens linjer (egenkontrollens karta)
    const lt = sida.slice(sida.indexOf('const lineTypes = ['), sida.indexOf('const zoneTypes = ['));
    for (const m of lt.matchAll(/\{ id: '([A-Za-z]+)', name:/g)) ids.add(m[1]);   // planeringens linjer
    expect(ids.size).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      if (id === 'boundary') continue;   // har sitt ytkort (granskort), men linjeKort finns också
      expect(LINJE_KORT_TYPER, id).toContain(id);
    }
    expect(LINJE_KORT_TYPER).toContain('boundary');
  });
});

describe('träfflagren i klickprioriteten och sidan', () => {
  it('egna och Vidas linjer är kategori "linje" — träfflagren, inte de tunna ritlagren', () => {
    expect(kategoriForLager(EGNA_LINJER_TRAFFLAGER)).toBe('linje');
    expect(kategoriForLager(VIDA_LINJE_TRAFFLAGER)).toBe('linje');
    expect(kategoriForLager('trakt-kraftledning-line')).toBeNull();
    expect(valjKlickKategori(['trakt-linje-hit', 'zone-fill'])).toBe('linje');
    expect(valjKlickKategori(['markers-hit', 'trakt-linje-hit'])).toBe('punkt');   // en symbol på linjen vinner fortfarande
    expect(KLICK_LAGER.find((k) => k.kategori === 'linje')!.lager).toContain('trakt-raa-line');
  });
  const sida = readFileSync('app/planering/page.tsx', 'utf8');
  it('sidan: båda träfflagren är LINJE_TRAFF_PX breda och osynliga', () => {
    expect(sida).toMatch(/id: 'line-hitbox', type: 'line', source: 'lines-source', paint: \{ 'line-color': 'rgba\(0,0,0,0\)', 'line-width': LINJE_TRAFF_PX \}/);
    expect(sida).toMatch(/id: 'trakt-linje-hit', type: 'line', source: 'trakt-geo-source', filter: \['==', \['get', '_typ'\], 'linje'\], paint: \{ 'line-color': 'rgba\(0,0,0,0\)', 'line-width': LINJE_TRAFF_PX \}/);
  });
  it('sidan: EN lyssnare för alla linjer (närmaste vinner), Vidas linjer trycks inte längre via de tunna lagren', () => {
    expect(sida).toContain("map.on('click', onLineClick);");
    expect(sida).toContain('narmasteLinje(');
    expect(sida).toContain('linjeAtgard(');
    const traktLager = sida.slice(sida.indexOf("const LAGER = ["), sida.indexOf("const LAGER = [") + 400);
    expect(traktLager).not.toContain('trakt-basvag-line');
    expect(traktLager).not.toContain('trakt-kraftledning-line');
  });
  it('sidan: träfflagret för Vidas linjer tänds och släcks med Kör & fara, som linjerna', () => {
    expect(sida).toContain("set('trakt-linje-hit', !!overlays.korFara);");
  });
});
