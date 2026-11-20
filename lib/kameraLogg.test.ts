import { describe, it, expect } from 'vitest';
import { installeraKameraLogg, kompakta, KAMERA_METODER, type KameraPost } from './kameraLogg';

// Fejk-karta med MapLibres egenskap att flyTo/fitBounds internt anropar easeTo/jumpTo.
function fejkKarta() {
  const lyssnare: Record<string, ((e: any) => void)[]> = {};
  const m: any = {
    cam: { lng: 15.05, lat: 56.35, zoom: 16, pitch: 45, bearing: 0, pad: 0 },
    getCenter() { return { lng: this.cam.lng, lat: this.cam.lat }; },
    getZoom() { return this.cam.zoom; },
    getPitch() { return this.cam.pitch; },
    getBearing() { return this.cam.bearing; },
    getPadding() { return { top: this.cam.pad }; },
    on(ev: string, f: any) { (lyssnare[ev] ||= []).push(f); },
    off(ev: string, f: any) { lyssnare[ev] = (lyssnare[ev] || []).filter((x) => x !== f); },
    emit(ev: string, e?: any) { (lyssnare[ev] || []).forEach((f) => f(e)); },
    jumpTo(o: any) { Object.assign(this.cam, o.center ? { lng: o.center[0], lat: o.center[1] } : {}, o.zoom != null ? { zoom: o.zoom } : {}); },
    easeTo(o: any) { this.jumpTo(o); },
    flyTo(o: any) { this.easeTo(o); },            // internt anrop → ska INTE loggas som egen rad
    fitBounds(_b: any, o: any) { this.jumpTo({ ...o }); },
    lyssnarAntal: (ev: string) => (lyssnare[ev] || []).length,
  };
  return m;
}

describe('installeraKameraLogg', () => {
  it('loggar bara toppnivå-anrop: flyTo som internt anropar easeTo och jumpTo blir EN rad', () => {
    const m = fejkKarta(); const logg: KameraPost[] = [];
    installeraKameraLogg(m, { logg, konsol: false, nu: () => 1000, fas: () => 'flyger' });
    m.flyTo({ center: [15.048, 56.357], zoom: 17.5, pitch: 28, duration: 1500 });
    expect(logg).toHaveLength(1);
    expect(logg[0]).toMatchObject({ t: 1000, m: 'flyTo', fas: 'flyger', fore: { zoom: 16, pitch: 45 } });
    expect((logg[0].a as any)[0]).toMatchObject({ zoom: 17.5, pitch: 28, duration: 1500 });
  });

  it('logg av olika anrop i följd, med fasen vid varje anrop', () => {
    const m = fejkKarta(); const logg: KameraPost[] = []; let fas = 'oversikt';
    installeraKameraLogg(m, { logg, konsol: false, fas: () => fas });
    m.fitBounds([[1, 2], [3, 4]], { duration: 0, maxZoom: 16, padding: 60 });
    fas = 'klar';
    m.easeTo({ center: [15.0, 56.0], zoom: 17.5 });
    expect(logg.map((p) => [p.m, p.fas])).toEqual([['fitBounds', 'oversikt'], ['easeTo', 'klar']]);
  });

  it('moveend loggas med läge efter och om det var en riktig gest (originalEvent)', () => {
    const m = fejkKarta(); const logg: KameraPost[] = [];
    installeraKameraLogg(m, { logg, konsol: false });
    m.emit('moveend', {});
    m.emit('moveend', { originalEvent: { type: 'touchend' } });
    expect(logg.map((p) => [p.h, p.gest])).toEqual([['moveend', false], ['moveend', true]]);
    expect(logg[0].efter).toMatchObject({ zoom: 16, pitch: 45 });
  });

  it('metodens returvärde och this bevaras, och avinstallation återställer allt', () => {
    const m = fejkKarta(); const logg: KameraPost[] = [];
    const orig = m.jumpTo;
    m.zoomIn = () => 'ok';
    const avinstallera = installeraKameraLogg(m, { logg, konsol: false });
    expect(m.zoomIn()).toBe('ok');
    expect(m.jumpTo).not.toBe(orig);
    avinstallera();
    expect(m.jumpTo).toBe(orig);
    expect(m.lyssnarAntal('moveend')).toBe(0);
    m.jumpTo({ zoom: 10 });
    expect(logg.filter((p) => p.m === 'jumpTo')).toHaveLength(0);   // inget loggas efter avinstallation
  });

  it('loggen kapas vid 400 poster (inget minnesläckage i en lång körning)', () => {
    const m = fejkKarta(); const logg: KameraPost[] = [];
    installeraKameraLogg(m, { logg, konsol: false });
    for (let k = 0; k < 450; k++) m.easeTo({ zoom: 16 });
    expect(logg).toHaveLength(400);
  });

  it('metoder som kartan saknar hoppas över utan fel', () => {
    const m = fejkKarta();
    expect(() => installeraKameraLogg(m, { logg: [], konsol: false })).not.toThrow();
    expect(KAMERA_METODER).toContain('flyTo');
  });
});

describe('kompakta', () => {
  it('avrundar tal, utelämnar funktioner, kapar djupa objekt', () => {
    expect(kompakta({ a: 1.23456789, b: [0.123456789, 'x'], f: () => 1 })).toEqual({ a: 1.2346, b: [0.1235, 'x'], f: '[fn]' });
    expect(kompakta({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: { d: '[…]' } } } });
  });
});
