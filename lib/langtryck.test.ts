import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { skapaLangtryck, LANGTRYCK_MS } from './langtryck';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('långtryck', () => {
  it('avfyras efter 500 ms och inte före', () => {
    expect(LANGTRYCK_MS).toBe(500);
    const lt = skapaLangtryck();
    const vid = vi.fn();
    lt.start(vid, 10, 10);
    vi.advanceTimersByTime(499);
    expect(vid).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(vid).toHaveBeenCalledTimes(1);
  });

  it('släpps fingret före tiden (vanligt tryck) avfyras inget och klicket släpps igenom', () => {
    const lt = skapaLangtryck();
    const vid = vi.fn();
    lt.start(vid);
    vi.advanceTimersByTime(200);
    lt.stopp();
    vi.advanceTimersByTime(1000);
    expect(vid).not.toHaveBeenCalled();
    expect(lt.slukKlick()).toBe(false);   // ett kort tryck ska fortfarande vara ett klick
  });

  it('efter ett långtryck sväljs det klick som kommer när fingret lyfts — men bara ett', () => {
    const lt = skapaLangtryck();
    lt.start(() => {});
    vi.advanceTimersByTime(600);
    lt.stopp();                            // fingerlyftet
    expect(lt.slukKlick()).toBe(true);     // klicket efter långtrycket ignoreras
    expect(lt.slukKlick()).toBe(false);    // nästa, riktiga klick går igenom
  });

  it('ett nytt tryck nollställer en gammal flagga (klick efter ett långtryck som aldrig fick sitt klick)', () => {
    const lt = skapaLangtryck();
    lt.start(() => {});
    vi.advanceTimersByTime(600);
    lt.start(() => {});                    // nytt tryck, kort
    lt.stopp();
    expect(lt.slukKlick()).toBe(false);
  });

  it('fingret glider iväg (scroll) → avbryts', () => {
    const lt = skapaLangtryck();
    const vid = vi.fn();
    lt.start(vid, 100, 100);
    lt.rorelse(104, 103);                  // 5 px: liten darrning, räknas inte
    vi.advanceTimersByTime(300);
    lt.rorelse(100, 140);                  // 40 px: scroll
    vi.advanceTimersByTime(1000);
    expect(vid).not.toHaveBeenCalled();
  });

  it('små darrningar avbryter inte', () => {
    const lt = skapaLangtryck();
    const vid = vi.fn();
    lt.start(vid, 100, 100);
    lt.rorelse(106, 104);
    vi.advanceTimersByTime(500);
    expect(vid).toHaveBeenCalledTimes(1);
  });
});
