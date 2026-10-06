import { describe, it, expect, vi } from 'vitest';

// supabase-klienten kräver env vid import; testet rör bara rena funktioner.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { harFoto, byggFotoSokvag, arMarkeringFotoSokvagFor } from './markeringFoto';

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

describe('arMarkeringFotoSokvagFor (vakt mot att radera fel fil)', () => {
  it('bara filer i objektets egen mapp', () => {
    expect(arMarkeringFotoSokvagFor('abc', 'abc/123.jpg')).toBe(true);
    expect(arMarkeringFotoSokvagFor('abc', 'xyz/123.jpg')).toBe(false);
    expect(arMarkeringFotoSokvagFor('abc', 'abc/../xyz/1.jpg')).toBe(false);
    expect(arMarkeringFotoSokvagFor('abc', 'abc/under/1.jpg')).toBe(false);
    expect(arMarkeringFotoSokvagFor('abc', 'abcd/1.jpg')).toBe(false);
  });
});
