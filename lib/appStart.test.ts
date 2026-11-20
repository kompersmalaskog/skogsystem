import { describe, it, expect } from 'vitest';
import { avgorAppStart, harSerialGps, startbeslutGaller, vaktVy, OMDIRIGERA_MAX_MS, type VaktSteg } from './appStart';

describe('avgorAppStart — startsidans beslut', () => {
  it('maskin vald → /planering i maskinläge', () => {
    expect(avgorAppStart({ enhetMaskinId: 'A130743', serialGps: true })).toEqual({ typ: 'planering' });
    // maskinen är vald även om serial-GPS:en tappats (flaggan rensad) — enheten ÄR en maskindator
    expect(avgorAppStart({ enhetMaskinId: 'A130743', serialGps: false })).toEqual({ typ: 'planering' });
  });

  it('serial-GPS men ingen maskin → helskärmsfrågan', () => {
    expect(avgorAppStart({ enhetMaskinId: null, serialGps: true })).toEqual({ typ: 'fraga-maskin' });
    expect(avgorAppStart({ enhetMaskinId: undefined, serialGps: true })).toEqual({ typ: 'fraga-maskin' });
    expect(avgorAppStart({ enhetMaskinId: '', serialGps: true })).toEqual({ typ: 'fraga-maskin' });
    expect(avgorAppStart({ enhetMaskinId: '   ', serialGps: true })).toEqual({ typ: 'fraga-maskin' });
  });

  it('ingen serial → som idag (appens meny)', () => {
    expect(avgorAppStart({ enhetMaskinId: null, serialGps: false })).toEqual({ typ: 'meny' });
    expect(avgorAppStart({ enhetMaskinId: undefined, serialGps: false })).toEqual({ typ: 'meny' });
  });

  it('"Till appen" på frågan: i den sessionen går det till menyn, inte fråga igen', () => {
    expect(avgorAppStart({ enhetMaskinId: null, serialGps: true, fragaHoppad: true })).toEqual({ typ: 'meny' });
    // ett redan valt maskin påverkas inte av ett tidigare hopp
    expect(avgorAppStart({ enhetMaskinId: 'A130743', serialGps: true, fragaHoppad: true })).toEqual({ typ: 'planering' });
  });
});

describe('harSerialGps — flaggan ELLER en sparad (beviljad) port', () => {
  it('flaggan räcker', () => expect(harSerialGps({ flagga: true, beviljadePortar: 0 })).toBe(true));
  it('en beviljad port räcker (flaggan borta)', () => expect(harSerialGps({ flagga: false, beviljadePortar: 1 })).toBe(true));
  it('varken eller → nej', () => expect(harSerialGps({ flagga: false, beviljadePortar: 0 })).toBe(false));
});

describe('startbeslutGaller — var tas beslutet?', () => {
  const bas = { pathname: '/', menyParam: false, menyValdISessionen: false, appStartSettRedan: false };

  it('startsidan: alltid', () => {
    expect(startbeslutGaller(bas)).toBe(true);
    expect(startbeslutGaller({ ...bas, appStartSettRedan: true })).toBe(true);
  });

  it('/oversikt (PWA:ns start_url): bara vid app-START, inte när någon navigerar dit', () => {
    expect(startbeslutGaller({ ...bas, pathname: '/oversikt' })).toBe(true);
    expect(startbeslutGaller({ ...bas, pathname: '/oversikt', appStartSettRedan: true })).toBe(false);
  });

  it('andra sidor: aldrig (en bokmärkt /planering sköter sin egen fråga)', () => {
    for (const p of ['/planering', '/maskin', '/arbetsrapport', '/oversikt-v2', '/login', '/maskinflytt']) {
      expect(startbeslutGaller({ ...bas, pathname: p })).toBe(false);
    }
  });

  it('?meny=1 / valt i sessionen: lämna användaren ifred ("Till appen" får inte studsa tillbaka)', () => {
    expect(startbeslutGaller({ ...bas, menyParam: true })).toBe(false);
    expect(startbeslutGaller({ ...bas, menyValdISessionen: true })).toBe(false);
    expect(startbeslutGaller({ ...bas, pathname: '/oversikt', menyValdISessionen: true })).toBe(false);
  });
});

describe('vaktVy — ren svart skärm står aldrig över 1 s', () => {
  const STEG: VaktSteg[] = ['inte-aktuellt', 'avgor', 'omdirigerar', 'fraga', 'fel'];
  const TIDER = [0, 1, 250, 999, 1000, 1001, 3000, 7999, OMDIRIGERA_MAX_MS - 1, OMDIRIGERA_MAX_MS, OMDIRIGERA_MAX_MS + 1, 30000, 600000];

  it('INVARIANT: över alla steg × tider är "svart" bara < 1 s; därefter gran, fråga eller felskärm', () => {
    for (const s of STEG) {
      for (const t of TIDER) {
        const vy = vaktVy(s, t);
        if (vy === 'svart') expect(t, `${s} @ ${t} ms`).toBeLessThan(1000);
      }
    }
  });

  it('avgör/omdirigerar: svart först, gran efter 1 s', () => {
    expect(vaktVy('avgor', 0)).toBe('svart');
    expect(vaktVy('avgor', 999)).toBe('svart');
    expect(vaktVy('avgor', 1000)).toBe('svart-med-gran');
    expect(vaktVy('omdirigerar', 5000)).toBe('svart-med-gran');
  });

  it('omdirigeringen tar ALDRIG över på 8 s → felskärm med vad som hänt (inte svart för evigt)', () => {
    expect(vaktVy('omdirigerar', OMDIRIGERA_MAX_MS - 1)).toBe('svart-med-gran');
    expect(vaktVy('omdirigerar', OMDIRIGERA_MAX_MS)).toBe('fel');
    expect(vaktVy('omdirigerar', 60000)).toBe('fel');
  });

  it('frågan och felskärmen är innehåll från första stund; inte-aktuellt ritar inget', () => {
    expect(vaktVy('fraga', 0)).toBe('fraga');
    expect(vaktVy('fel', 0)).toBe('fel');
    expect(vaktVy('inte-aktuellt', 0)).toBe('inget');
  });
});
