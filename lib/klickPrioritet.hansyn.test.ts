// TRYCK PÅ EN HÄNSYN ÖPPNAR HÄNSYNEN, INTE TRAKTEN (Martin 2026-11-23, Brokamåla 1:5 V-H -26).
//
// Orsaken: Vidas traktdel och hänsyn bär ingen areal i datan (AREA_HA/SHAPE.STAr saknas), så "minsta ytan" (valjMinstaYta) kunde inte avgöra på storlek — då vinner översta
// lagret. Lagerordningen (#1008, 2026-10-26) lade traktgräns-lagren (trakt-gr-*, grans-*) över ytorna, och traktdelen slog hänsynen. Nu avgör KATEGORIN: hänsyn, zon,
// nyckelbiotop, fornlämning och Övrigt är 'yta', traktdelen och egna områdens fyllning är 'traktyta' — sist. Körspåren deltar inte i prioriteringen alls.
import { describe, expect, it } from 'vitest';
import { ALLA_KLICK_LAGER, KLICK_LAGER, bastaKategoriFeatures, kategoriForLager, prioritetsRang, valjKlickKategori } from './klickPrioritet';
import { valjMinstaYta } from './traktGeometri';
import { RANG, lagerRang } from './lagerOrdning';

const f = (layerId: string, properties: Record<string, any> = {}) => ({ layer: { id: layerId }, properties });

describe('hänsyn före traktyta, oavsett vilket lager som ligger överst', () => {
  it('kategorierna: specifika ytor = yta, traktdel och egna områden = traktyta (sist)', () => {
    for (const l of ['zone-fill', 'trakt-hansyn-fill', 'trakt-ovrigt-fill', 'trakt-nb-fill', 'trakt-raa-fill']) expect(kategoriForLager(l), l).toBe('yta');
    for (const l of ['grans-fill', 'trakt-gr-fill']) expect(kategoriForLager(l), l).toBe('traktyta');
    expect(prioritetsRang('yta')).toBeLessThan(prioritetsRang('traktyta'));
    expect(KLICK_LAGER[KLICK_LAGER.length - 1].kategori).toBe('traktyta');
  });

  it('hänsyn under trycket tillsammans med traktdelen → hänsyn vinner, i båda lagerordningarna', () => {
    expect(valjKlickKategori(['trakt-gr-fill', 'trakt-hansyn-fill'])).toBe('yta');
    expect(valjKlickKategori(['trakt-hansyn-fill', 'trakt-gr-fill'])).toBe('yta');
    expect(valjKlickKategori(['trakt-gr-fill', 'zone-fill'])).toBe('yta');          // egen hänsynsyta (zon) inne i traktdelen
    expect(valjKlickKategori(['grans-fill', 'zone-fill'])).toBe('yta');             // egen zon inne i ett eget område
    expect(valjKlickKategori(['trakt-gr-fill'])).toBe('traktyta');                  // bara traktdelen → traktdelen
  });

  it('bastaKategoriFeatures: av flera träffar behålls bara de i den vinnande kategorin, utan att lita på ordningen eller på arealen', () => {
    // Båda utan areal (Vidas data) — översta lagret först, som queryRenderedFeatures lämnar dem. Förut gav valjMinstaYta då traktdelen.
    const traff = [f('trakt-gr-fill', { _partKey: 'td:0' }), f('trakt-hansyn-fill', { LOPNR: '3' })];
    expect(valjMinstaYta(traff)!.layer.id).toBe('trakt-gr-fill');                                // så var felet
    expect(valjMinstaYta(bastaKategoriFeatures(traff))!.layer.id).toBe('trakt-hansyn-fill');     // så är det nu
    expect(valjMinstaYta(bastaKategoriFeatures([...traff].reverse()))!.layer.id).toBe('trakt-hansyn-fill');
  });

  it('bastaKategoriFeatures: lager utanför prioriteringen rörs inte, och inget träffat ger tillbaka listan som den är', () => {
    const okanda = [f('nagot-annat'), f('och-ett-till')];
    expect(bastaKategoriFeatures(okanda)).toEqual(okanda);
    expect(bastaKategoriFeatures([])).toEqual([]);
  });

  it('ordningen mellan specifika ytor och punkter/linjer/symboler är oförändrad', () => {
    expect(valjKlickKategori(['markers-hit', 'trakt-hansyn-fill', 'trakt-gr-fill'])).toBe('symbol');
    expect(valjKlickKategori(['line-hitbox', 'trakt-hansyn-fill'])).toBe('linje');
    expect(valjKlickKategori(['yta-nr-hit', 'trakt-hansyn-fill'])).toBe('yta-nr');
    expect(valjKlickKategori(['larm-pin-hit', 'trakt-hansyn-fill'])).toBe('larm');
  });
});

describe('väg-⚠ (TMA-varningslinjen): efter det som är satt ut, före alla ytor', () => {
  it('ordningen', () => {
    expect(kategoriForLager('tma-warning-hitbox')).toBe('tma');
    expect(valjKlickKategori(['tma-warning-hitbox', 'trakt-hansyn-fill', 'trakt-gr-fill'])).toBe('tma');
    expect(valjKlickKategori(['tma-warning-hitbox', 'zone-fill'])).toBe('tma');
    expect(valjKlickKategori(['tma-warning-hitbox', 'markers-hit'])).toBe('symbol');
    expect(valjKlickKategori(['tma-warning-hitbox', 'larm-pin-hit'])).toBe('larm');
  });
});

describe('körspår tar aldrig emot tryck', () => {
  it('inget körspårs-, planspårs- eller högbakgrundslager deltar i prioriteringen', () => {
    for (const l of ALLA_KLICK_LAGER) expect(l, l).not.toMatch(/^(hyttspar|planspar|klart-|korspar|line-kor-)/);
  });
  it('lagerordningen är orörd: traktgränsens fyllning ligger över ytorna — därför får ordningen mellan dem inte avgöras av lagren', () => {
    expect(lagerRang({ id: 'trakt-gr-fill', type: 'fill' })).toBeGreaterThan(lagerRang({ id: 'trakt-hansyn-fill', type: 'fill' }));
    expect(lagerRang({ id: 'trakt-gr-fill', type: 'fill' })).toBe(RANG.traktgrans);
    expect(lagerRang({ id: 'hyttspar-egen-0', type: 'line' })).toBeGreaterThan(lagerRang({ id: 'trakt-hansyn-fill', type: 'fill' }));
  });
});
