import { describe, it, expect, vi } from 'vitest';

// supabase-klienten kräver env vid import; testet rör bara rena funktioner.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { harFoto, byggFotoSokvag, KOMPRIMERINGSSTEG, MAL_BYTES } from './markeringFoto';

describe('harFoto', () => {
  it('true för photoPath eller photoData, false annars', () => {
    expect(harFoto({ photoPath: 'a/b.jpg' })).toBe(true);
    expect(harFoto({ photoData: 'data:image/jpeg;base64,AAAA' })).toBe(true);
    expect(harFoto({})).toBe(false);
    expect(harFoto({ photoPath: '', photoData: '' })).toBe(false);
    expect(harFoto(null)).toBe(false);
  });
});

describe('byggFotoSokvag', () => {
  it('{objekt_id}/{marker_id}.jpg', () => {
    expect(byggFotoSokvag('abc-123', 1760000000000)).toBe('abc-123/1760000000000.jpg');
  });
  it('rensar tecken som inte hör hemma i en sökväg', () => {
    expect(byggFotoSokvag('a/b', '../x y')).toBe('a_b/___x_y.jpg');
  });
});

describe('komprimering: ca 200 KB, max 1280 px', () => {
  it('mål 200 KB; första steget är 1280 px; stegen blir aldrig större och aldrig under 960 px / kvalitet 0,5 (text på en skylt ska gå att läsa)', () => {
    expect(MAL_BYTES).toBe(200 * 1024);
    expect(KOMPRIMERINGSSTEG[0].sida).toBe(1280);
    for (let i = 1; i < KOMPRIMERINGSSTEG.length; i++) {
      expect(KOMPRIMERINGSSTEG[i].sida).toBeLessThanOrEqual(KOMPRIMERINGSSTEG[i - 1].sida);
      expect(KOMPRIMERINGSSTEG[i].kvalitet).toBeLessThanOrEqual(KOMPRIMERINGSSTEG[i - 1].kvalitet);
    }
    expect(Math.min(...KOMPRIMERINGSSTEG.map((s) => s.sida))).toBeGreaterThanOrEqual(960);
    expect(Math.min(...KOMPRIMERINGSSTEG.map((s) => s.kvalitet))).toBeGreaterThanOrEqual(0.5);
  });
});
