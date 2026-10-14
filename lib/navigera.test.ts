import { describe, it, expect, vi } from 'vitest';
import { harKoordinat, navigeringsUrl, startaNavigering } from './navigera';

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
});
