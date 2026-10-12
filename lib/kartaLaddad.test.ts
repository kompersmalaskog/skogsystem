import { describe, it, expect } from 'vitest';
import { GRUNDKARTA_LAGER, synligaGrundkartaKallor, grundkartaLaddad, kameraAndrad, kameraLage, vantaPaGrundkarta } from './kartaLaddad';

// Fejk-karta: lager {id → {source, visibility}}, källor {id → laddad}, och en enkel händelsebuss.
function fejk(lager: Record<string, { source: string; vis?: string }>, kallor: Record<string, boolean>) {
  const lyss: Record<string, ((e?: any) => void)[]> = {};
  const m: any = {
    kallor,
    getLayer: (id: string) => (lager[id] ? { id, source: lager[id].source } : undefined),
    getLayoutProperty: (id: string, p: string) => (p === 'visibility' ? (lager[id]?.vis ?? 'visible') : undefined),
    isSourceLoaded: (id: string) => kallor[id],
    getCenter: () => ({ lng: 15.05, lat: 56.35 }), getZoom: () => 14.5, getPitch: () => 0, getBearing: () => 0,
    on: (ev: string, f: any) => { (lyss[ev] ||= []).push(f); },
    once: (ev: string, f: any) => { const w = (e?: any) => { m.off(ev, w); f(e); }; (lyss[ev] ||= []).push(w); },
    off: (ev: string, f: any) => { lyss[ev] = (lyss[ev] || []).filter((x) => x !== f); },
    emit: (ev: string, e?: any) => { for (const f of [...(lyss[ev] || [])]) f(e); },
    antal: (ev: string) => (lyss[ev] || []).length,
  };
  return m;
}

describe('synligaGrundkartaKallor / grundkartaLaddad', () => {
  it('bara SYNLIGA grundkarte-lager räknas (appens standard: lm-layer synlig, resten dolda)', () => {
    const m = fejk({ 'lm-layer': { source: 'lantmateriet' }, 'osm-layer': { source: 'osm', vis: 'none' }, 'satellite-layer': { source: 'satellite', vis: 'none' }, 'terrain-layer': { source: 'topographic', vis: 'none' } },
      { lantmateriet: true, osm: false, satellite: false, topographic: false });
    expect(synligaGrundkartaKallor(m)).toEqual(['lantmateriet']);
    expect(grundkartaLaddad(m)).toBe(true);
  });

  it('överlägg och terräng-DEM hindrar INTE: bara grundkartan avgör (annars väntar svart på ett långsamt WMS-lager)', () => {
    const m = fejk({ 'lm-layer': { source: 'lantmateriet' }, 'wms-layer-x': { source: 'wms-x' } }, { lantmateriet: true, 'wms-x': false, 'terrain-dem': false });
    expect(grundkartaLaddad(m)).toBe(true);
  });

  it('grundkartans rutor kommer än → false; ingen synlig grundkarta alls (stilen ej klar) → false', () => {
    expect(grundkartaLaddad(fejk({ 'lm-layer': { source: 'lantmateriet' } }, { lantmateriet: false }))).toBe(false);
    expect(grundkartaLaddad(fejk({}, {}))).toBe(false);
    expect(grundkartaLaddad({ getLayer() { throw new Error('stil'); } })).toBe(false);
  });

  it('två synliga grundkartor (t.ex. topo + LM) → båda måste vara laddade', () => {
    const lager = { 'lm-layer': { source: 'lantmateriet' }, 'terrain-layer': { source: 'topographic' } };
    expect(grundkartaLaddad(fejk(lager, { lantmateriet: true, topographic: false }))).toBe(false);
    expect(grundkartaLaddad(fejk(lager, { lantmateriet: true, topographic: true }))).toBe(true);
    expect(GRUNDKARTA_LAGER).toContain('lm-layer');
  });
});

describe('kameraAndrad / kameraLage', () => {
  const a = { lng: 15.05, lat: 56.35, zoom: 14.5, pitch: 0, bearing: 0 };
  it('samma ram → ingen ändring (inga nya rutor behövs); skillnad i zoom/läge/lutning/riktning → ändrad', () => {
    expect(kameraAndrad(a, { ...a })).toBe(false);
    expect(kameraAndrad(a, { ...a, zoom: 14.505 })).toBe(false);
    expect(kameraAndrad(a, { ...a, zoom: 16 })).toBe(true);
    expect(kameraAndrad(a, { ...a, lat: 56.36 })).toBe(true);
    expect(kameraAndrad(a, { ...a, pitch: 45 })).toBe(true);
    expect(kameraAndrad(a, { ...a, bearing: 90 })).toBe(true);
  });
  it('kameraLage läser kartans läge', () => {
    expect(kameraLage(fejk({}, {}))).toEqual({ lng: 15.05, lat: 56.35, zoom: 14.5, pitch: 0, bearing: 0 });
  });
});

describe('vantaPaGrundkarta', () => {
  const lager = { 'lm-layer': { source: 'lantmateriet' } };

  it('oförändrad kamera → klart i nästa bildruta (inte efter 2,5 s) — även om kringliggande rutor fortfarande hämtas efter load', () => {
    const m = fejk(lager, { lantmateriet: false });   // källan rapporterar "inte klar" (MapLibre hämtar rutor runt om) — ska inte hindra
    let klart = 0; let kor: (() => void) | null = null;
    vantaPaGrundkarta(m, { andratKamera: false, maxMs: 2500, klart: () => { klart++; }, nasta: (f) => { kor = f; }, timer: (() => 0) as any });
    expect(klart).toBe(0);
    kor!();
    expect(klart).toBe(1);
    expect(m.antal('sourcedata')).toBe(0);   // städat
  });

  it('ändrad kamera: väntar på grundkartans SISTA ruta (sourcedata med isSourceLoaded), inte på första', () => {
    const m = fejk(lager, { lantmateriet: false });
    let klart = 0;
    vantaPaGrundkarta(m, { andratKamera: true, maxMs: 2500, klart: () => { klart++; }, nasta: () => { throw new Error('ska inte köras'); }, timer: (() => 0) as any });
    m.emit('sourcedata', { sourceId: 'lantmateriet', isSourceLoaded: false });
    expect(klart).toBe(0);
    m.kallor.lantmateriet = true;
    m.emit('sourcedata', { sourceId: 'lantmateriet', isSourceLoaded: true });
    expect(klart).toBe(1);
  });

  it('ett överlägg som blir klart först hjälper inte om grundkartan inte är klar', () => {
    const m = fejk({ ...lager, 'wms-layer-x': { source: 'wms-x' } }, { lantmateriet: false, 'wms-x': true });
    let klart = 0;
    vantaPaGrundkarta(m, { andratKamera: true, maxMs: 2500, klart: () => { klart++; }, timer: (() => 0) as any });
    m.emit('sourcedata', { sourceId: 'wms-x', isSourceLoaded: true });
    expect(klart).toBe(0);
  });

  it('idle och tidsgräns är reservvägar — och klart anropas ALDRIG två gånger', () => {
    const m = fejk(lager, { lantmateriet: false });
    let klart = 0; let tid: (() => void) | null = null;
    vantaPaGrundkarta(m, { andratKamera: true, maxMs: 2500, klart: () => { klart++; }, timer: ((f: () => void) => { tid = f; return 0; }) as any });
    m.emit('idle');
    expect(klart).toBe(1);
    tid!();
    m.kallor.lantmateriet = true;
    m.emit('sourcedata', { isSourceLoaded: true });
    expect(klart).toBe(1);
  });

  it('tidsgränsen ensam räcker när inget annat kommer (nät som hänger)', () => {
    const m = fejk(lager, { lantmateriet: false });
    let klart = 0; let tid: (() => void) | null = null;
    vantaPaGrundkarta(m, { andratKamera: true, maxMs: 2500, klart: () => { klart++; }, timer: ((f: () => void) => { tid = f; return 0; }) as any });
    expect(klart).toBe(0);
    tid!();
    expect(klart).toBe(1);
  });

  it('avbryt-funktionen städar lyssnarna och hindrar klart', () => {
    const m = fejk(lager, { lantmateriet: false });
    let klart = 0;
    const avbryt = vantaPaGrundkarta(m, { andratKamera: true, maxMs: 2500, klart: () => { klart++; }, timer: (() => 0) as any });
    avbryt();
    m.kallor.lantmateriet = true;
    m.emit('sourcedata', { isSourceLoaded: true });
    m.emit('idle');
    expect(klart).toBe(0);
    expect(m.antal('sourcedata')).toBe(0);
  });
});
