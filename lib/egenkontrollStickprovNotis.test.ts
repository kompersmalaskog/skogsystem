import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EGENKONTROLL_STICKPROV, STICKPROV_MAX_ALDER_MS, arStickprovNotis, byggStickprovNotis, stickprovNotisText, type HamtaStickprov, type StickprovNotisRad } from './egenkontrollStickprovNotis';
import { flushUrval } from './ledighet/notis';

const valda = (n: number) => Array.from({ length: n }, (_, i) => ({ objekt_id: `o${i}`, namn: `O${i}`, ordning: i + 1, km_fran_ankare: i }));
const rad = (n: number, spridning: number | null): StickprovNotisRad => ({ manad: '2026-11-01', valda: valda(n), spridning_km: spridning });
const finns = (r: StickprovNotisRad | null, fel?: string): HamtaStickprov => async () => ({ rad: r, fel });

// 07:00 svensk tid 1 nov 2026 (normaltid, UTC+1) = 06:00 UTC
const SEDAN = Date.parse('2026-11-01T06:00:00Z');
const kö = (extra: Record<string, unknown> = {}, skapad = '2026-10-31T23:05:00Z') => ({
  typ: EGENKONTROLL_STICKPROV,
  skapad_at: skapad,
  payload: { manad: '2026-11-01', skicka_efter: '2026-11-01T06:00:00Z', ...extra },
});

describe('texten', () => {
  it('"Månadens stickprov: 3 objekt, 14,8 km isär" — fågelväg, decimalkomma', () => {
    expect(stickprovNotisText(rad(3, 14.8))).toBe('Månadens stickprov: 3 objekt, 14,8 km isär');
    expect(stickprovNotisText(rad(2, 5.2))).toBe('Månadens stickprov: 2 objekt, 5,2 km isär');
  });
  it('ett objekt har inget "isär"', () => {
    expect(stickprovNotisText(rad(1, null))).toBe('Månadens stickprov: 1 objekt');
    expect(stickprovNotisText(rad(1, 5))).toBe('Månadens stickprov: 1 objekt');   // även om en spridning av misstag skulle vara satt
  });
});

describe('typen', () => {
  it('känns igen exakt', () => {
    expect(arStickprovNotis('egenkontroll_stickprov')).toBe(true);
    expect(arStickprovNotis('lass_maskin')).toBe(false);
    expect(arStickprovNotis(undefined)).toBe(false);
  });
  it('flushens urval tar typen oavsett skickas_at (raden köas med infinity)', () => {
    expect(flushUrval('2026-11-01T06:00:00.000Z', ['lass_maskin', EGENKONTROLL_STICKPROV])).toContain('egenkontroll_stickprov');
  });
});

describe('byggStickprovNotis', () => {
  it('efter 07:00: skickas, med färsk text, länk till listan och en tagg per månad (en ny dragning ersätter inte gårdagens)', async () => {
    const u = await byggStickprovNotis(kö(), finns(rad(3, 14.8)), SEDAN + 60_000);
    expect(u).toEqual({
      typ: 'skicka',
      meddelande: { title: 'Egenkontroll', body: 'Månadens stickprov: 3 objekt, 14,8 km isär', url: '/egenkontroll', tag: 'egenkontroll-stickprov-2026-11-01' },
    });
  });

  it('FÖRE 07:00: uppskjuts (raden lämnas oskickad, nästa cron försöker igen) — och raden läses inte ens', async () => {
    let lasningar = 0;
    const u = await byggStickprovNotis(kö(), async () => { lasningar++; return { rad: rad(3, 14.8) }; }, SEDAN - 60_000);
    expect(u).toEqual({ typ: 'uppskjut' });
    expect(lasningar).toBe(0);
  });

  it('exakt klockan 07:00 skickas den', async () => {
    expect((await byggStickprovNotis(kö(), finns(rad(3, 14.8)), SEDAN)).typ).toBe('skicka');
  });

  it('en dragning sent på dagen (skicka_efter = nu) skickas direkt', async () => {
    const dragen = '2026-11-03T12:00:00Z';
    const u = await byggStickprovNotis(kö({ manad: '2026-11-01', skicka_efter: dragen }, dragen), finns(rad(3, 14.8)), Date.parse(dragen) + 1000);
    expect(u.typ).toBe('skicka');
  });

  it('läsfel → uppskjuts, aldrig "finns inte"', async () => {
    expect(await byggStickprovNotis(kö(), finns(null, 'nät'), SEDAN + 1)).toEqual({ typ: 'uppskjut' });
  });

  it('raden finns inte kvar → hoppas över med orsak', async () => {
    const u = await byggStickprovNotis(kö(), finns(null), SEDAN + 1);
    expect(u).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — månadens stickprov finns inte kvar' });
  });

  it('tom månad → ingen push', async () => {
    expect((await byggStickprovNotis(kö(), finns(rad(0, null)), SEDAN + 1)).typ).toBe('hoppa_over');
  });

  it('köad för mer än 24 timmar sedan → hoppas över, även om tiden passerat (en hög efter en release skickas aldrig på en gång)', async () => {
    const u = await byggStickprovNotis(kö({}, '2026-10-31T23:05:00Z'), finns(rad(3, 14.8)), Date.parse('2026-10-31T23:05:00Z') + STICKPROV_MAX_ALDER_MS + 1);
    expect(u).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' });
  });

  it('en för gammal rad skjuts aldrig upp av en framtida tid', async () => {
    const u = await byggStickprovNotis(kö({ skicka_efter: '2099-01-01T00:00:00Z' }, '2026-01-01T00:00:00Z'), finns(rad(3, 1)), SEDAN);
    expect(u.typ).toBe('hoppa_over');
  });

  it('saknad eller trasig månad → hoppas över', async () => {
    expect((await byggStickprovNotis({ typ: EGENKONTROLL_STICKPROV, payload: {} }, finns(rad(3, 1)), SEDAN)).typ).toBe('hoppa_over');
    expect((await byggStickprovNotis({ typ: EGENKONTROLL_STICKPROV, payload: { manad: 'nov' } }, finns(rad(3, 1)), SEDAN)).typ).toBe('hoppa_over');
  });
});

// Flush-routen är den enda som drar stickprovet utan att någon öppnat appen och den enda som skickar pushen. Den kopplingen får inte tyst försvinna.
describe('flush-routen är kopplad', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../app/api/notis/flush/route.ts'), 'utf8');
  it('anropar egenkontroll_stickprov FÖRE köns läsning, och ett fel där stoppar inte kön', () => {
    const rpc = src.indexOf('rpc("egenkontroll_stickprov")');
    const kon = src.indexOf('.from("notis_kö")');
    expect(rpc).toBeGreaterThan(-1);
    expect(rpc).toBeLessThan(kon);
    expect(src.slice(src.lastIndexOf('try {', rpc), rpc)).toContain('try {');
    expect(src).toMatch(/catch \(e\) \{\s*console\.error\("\[notis\/flush\] egenkontroll_stickprov:"/);
  });
  it('tar typen i urvalet och bygger texten med byggStickprovNotis', () => {
    expect(src).toContain('flushUrval(nu, [LASS_MASKIN, EGENKONTROLL_STICKPROV])');
    expect(src).toContain('byggStickprovNotis(n, hamtaStickprovrad)');
  });
});
