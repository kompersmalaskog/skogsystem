import { describe, it, expect, vi } from 'vitest';
import { harKoordinat, navigeringsMal, navigeringsUrl, startaNavigering } from './navigera';

describe('navigering', () => {
  it('samma adress som dagens "Navigera" (Google Maps vägbeskrivning mot koordinaten)', () => {
    expect(navigeringsUrl(56.4, 14.7)).toBe('https://www.google.com/maps/dir/?api=1&destination=56.4,14.7');
  });
  it('startaNavigering öppnar url:en — och ingenting alls utan koordinat', () => {
    const oppna = vi.fn();
    expect(startaNavigering({ lat: 56.4, lng: 14.7 }, oppna)).toBe(true);
    expect(oppna).toHaveBeenCalledWith('https://www.google.com/maps/dir/?api=1&destination=56.4,14.7');
    oppna.mockClear();
    expect(startaNavigering({ lat: null, lng: 14.7 }, oppna)).toBe(false);
    expect(startaNavigering(null, oppna)).toBe(false);
    expect(startaNavigering({ lat: 0, lng: 0 }, oppna)).toBe(false);
    expect(oppna).not.toHaveBeenCalled();
  });
  it('harKoordinat', () => {
    expect(harKoordinat({ lat: 56, lng: 14 })).toBe(true);
    expect(harKoordinat({ lat: undefined, lng: 14 })).toBe(false);
    expect(harKoordinat({ lat: NaN, lng: 14 })).toBe(false);
  });
  it('larmkoordinaten (infarten) går före objektets punkt — samma regel för bilknappen och Kör dit', () => {
    const oppna = vi.fn();
    const trakt = { lat: 56.4, lng: 14.7, larmkoordinat_lat: 56.41, larmkoordinat_lng: 14.69 };
    expect(navigeringsMal(trakt)).toEqual({ lat: 56.41, lng: 14.69 });
    startaNavigering(trakt, oppna);
    expect(oppna).toHaveBeenCalledWith('https://www.google.com/maps/dir/?api=1&destination=56.41,14.69');
    expect(navigeringsMal({ lat: 56.4, lng: 14.7, larmkoordinat_lat: null, larmkoordinat_lng: null })).toEqual({ lat: 56.4, lng: 14.7 });
    expect(navigeringsMal({ lat: 56.4, lng: 14.7, larmkoordinat_lat: 0, larmkoordinat_lng: 0 })).toEqual({ lat: 56.4, lng: 14.7 });
    expect(navigeringsMal({ lat: null, lng: null, larmkoordinat_lat: 56.41, larmkoordinat_lng: 14.69 })).toEqual({ lat: 56.41, lng: 14.69 });
    expect(navigeringsMal(null)).toBeNull();
  });
});
