// "Kommer en ambulans hit?" (lib/larmKontroll). Facit: Santhes fem larmplatser ur prod.
import { describe, it, expect } from 'vitest';
import santhe from './__fixtures__/larmpunkter_santhe_2026-11-10.json';
import { larmpunkterUr, valjLarmpunkt, larmVisning } from './larmpunkter';
import { fragaOm, kontrollFor, kontrollText, punktNyckel, type LarmKontrollRad } from './larmKontroll';

const punkter = larmpunkterUr(santhe.features as any, santhe.objektLarm);
const p014 = punkter.find((p) => p.namn?.startsWith('Avlägg 01-4'))!;
const vid014 = { lat: p014.lat + 0.0002, lng: p014.lng };      // ~22 m norr om larmplatsen
const rad = (o: Partial<LarmKontrollRad>): LarmKontrollRad => ({ id: 'r', lat: p014.lat, lng: p014.lng, svar: 'ja', kommentar: null, vem: 'Daniel', skapadAt: '2026-11-12T08:00:00Z', ...o });

describe('fragaOm', () => {
  it('står man vid en larmplats som ingen bekräftat: frågan om just den', () => {
    expect(fragaOm(punkter, [], vid014, true, new Set())).toBe(p014);
  });
  it('för långt bort (över 50 m): ingen fråga', () => {
    expect(fragaOm(punkter, [], { lat: p014.lat + 0.001, lng: p014.lng }, true, new Set())).toBeNull();
  });
  it('gammal position eller ingen position: ingen fråga', () => {
    expect(fragaOm(punkter, [], vid014, false, new Set())).toBeNull();
    expect(fragaOm(punkter, [], null, true, new Set())).toBeNull();
  });
  it('kontrollerna gick inte att läsa: ingen fråga (hellre än att fråga om något som redan är bekräftat)', () => {
    expect(fragaOm(punkter, null, vid014, true, new Set())).toBeNull();
  });
  it('någon har svarat Ja: ingen fråga — Nej senast: frågan kommer (någon kan ha rättat det)', () => {
    expect(fragaOm(punkter, [rad({ svar: 'ja' })], vid014, true, new Set())).toBeNull();
    expect(fragaOm(punkter, [rad({ svar: 'nej' })], vid014, true, new Set())).toBe(p014);
    expect(fragaOm(punkter, [rad({ id: 'a', svar: 'nej', skapadAt: '2026-11-12T08:00:00Z' }), rad({ id: 'b', svar: 'ja', skapadAt: '2026-11-13T08:00:00Z' })], vid014, true, new Set())).toBeNull();
  });
  it('tryckt bort eller redan svarat på enheten: ingen fråga igen', () => {
    expect(fragaOm(punkter, [], vid014, true, new Set([punktNyckel(p014)]))).toBeNull();
  });
  it('en kontroll några meter bredvid gäller samma punkt', () => {
    expect(kontrollFor(p014, [rad({ lat: p014.lat + 0.0001 })])).not.toBeNull();       // ~11 m
    expect(kontrollFor(p014, [rad({ lat: p014.lat + 0.001 })])).toBeNull();            // ~111 m
  });
});

describe('kontrollText och larmVisning', () => {
  it('Ja: grönt med vem och när; Nej: orange med varför', () => {
    expect(kontrollText(rad({ svar: 'ja' }))).toEqual({ text: 'Ambulansen kommer fram · Daniel 12 nov', ton: 'gron' });
    expect(kontrollText(rad({ svar: 'nej', kommentar: 'bommen är låst' }))).toEqual({ text: 'Ambulansen kommer inte fram: bommen är låst · Daniel 12 nov', ton: 'orange' });
    expect(kontrollText(null)).toBeNull();
  });
  it('kortet bär kontrollen för den valda och för varje rad i listan', () => {
    const v = larmVisning(valjLarmpunkt(punkter, vid014, true), [rad({ svar: 'ja' })]);
    expect(v.kontroll?.text).toBe('Ambulansen kommer fram · Daniel 12 nov');
    expect(v.platser[0].kontroll?.ton).toBe('gron');
    expect(v.platser.slice(1).every((p) => p.kontroll === null)).toBe(true);
  });
});
