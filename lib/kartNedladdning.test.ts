import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  KART_CACHE, KARTRUTA_MALL, MAX_RUTOR, braNat, lasMeta, medTrakt, nedladdningText, planeraRutor, punktBbox, rutorFor, traktBbox, type Bbox,
} from './kartNedladdning';

// En trakt på ca 600 × 600 m vid Kompersmåla (57° N).
const TRAKT: Bbox = { vast: 15.70, ost: 15.71, syd: 56.80, nord: 56.8055 };

describe('rutorna runt trakten', () => {
  it('rutorFor ger rutan punkten ligger i (XYZ)', () => {
    // 15.7 E, 56.8 N på zoom 10 = ruta 556/314 (handräknat: x = 195,7/360·1024 = 556,7; y = (1 − ln(tan φ + sec φ)/π)/2·1024 = 314,8)
    expect(rutorFor({ vast: 15.7, ost: 15.7, syd: 56.8, nord: 56.8 }, 10)).toEqual([{ x: 556, y: 314 }]);
  });

  it('alla tre bakgrunderna och höjddatan — aldrig OpenStreetMap', () => {
    const r = planeraRutor(TRAKT);
    expect(r.some((u) => u.startsWith('/api/forarkarta?layer=ortofoto&z=18&'))).toBe(true);
    expect(r.some((u) => u.startsWith('/api/forarkarta?z=17&'))).toBe(true);
    expect(r.some((u) => u.startsWith('/api/forarkarta?layer=farg&z=17&'))).toBe(true);
    expect(r.some((u) => u.includes('/terrarium/15/'))).toBe(true);
    expect(r.some((u) => u.includes('openstreetmap'))).toBe(false);
    expect(new Set(r).size).toBe(r.length);
  });

  it('en stor trakt tar bort Flygfotots högsta zoom först, aldrig fler än taket', () => {
    const stor: Bbox = { vast: 15.70, ost: 15.76, syd: 56.80, nord: 56.83 };
    const r = planeraRutor(stor);
    expect(r.length).toBeLessThanOrEqual(MAX_RUTOR);
    expect(r.some((u) => u.includes('layer=ortofoto&z=18&'))).toBe(false);
    expect(r.some((u) => u.includes('/terrarium/15/'))).toBe(true);   // höjddatan rörs aldrig
  });
});

describe('traktens yta', () => {
  it('ur Vidas traktgräns (L_TRAKTDEL), aldrig ur andra lager', () => {
    const fc = { features: [
      { properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [[[15.70, 56.80], [15.71, 56.80], [15.71, 56.81], [15.70, 56.80]]] } },
      { properties: { _lager: 'SV_FASTIGHET' }, geometry: { type: 'Polygon', coordinates: [[[10, 50], [20, 50], [20, 60], [10, 50]]] } },
    ] };
    expect(traktBbox(fc)).toEqual({ vast: 15.70, ost: 15.71, syd: 56.80, nord: 56.81 });
    expect(traktBbox({ features: [] })).toBeNull();
  });
  it('utan traktgräns: en ruta runt punkten', () => {
    const b = punktBbox(56.8, 15.7);
    expect(b.vast).toBeLessThan(15.7); expect(b.ost).toBeGreaterThan(15.7);
  });
});

describe('när och hur mycket', () => {
  it('bra nät: online, inte spara data, inte 2G; okänt räknas som bra', () => {
    expect(braNat({ onLine: true })).toBe(true);
    expect(braNat({ onLine: false })).toBe(false);
    expect(braNat({ onLine: true, connection: { saveData: true } })).toBe(false);
    expect(braNat({ onLine: true, connection: { effectiveType: '2g' } })).toBe(false);
    expect(braNat({ onLine: true, connection: { effectiveType: '4g' } })).toBe(true);
  });
  it('de senaste trakterna sparas, äldre rensas', () => {
    let meta = [] as ReturnType<typeof lasMeta>;
    const rensat: string[] = [];
    for (let i = 0; i < 10; i++) { const r = medTrakt(meta, { id: `t${i}`, bbox: TRAKT, ts: i, antal: 1 }, 8); meta = r.meta; rensat.push(...r.rensa.map((m) => m.id)); }
    expect(meta.map((m) => m.id)).toEqual(['t9', 't8', 't7', 't6', 't5', 't4', 't3', 't2']);
    expect(rensat).toEqual(['t0', 't1']);
    expect(medTrakt(meta, { id: 't2', bbox: TRAKT, ts: 99, antal: 1 }).meta[0].id).toBe('t2');   // öppnad igen = först
  });
  it('trasigt minne = inget sparat', () => {
    expect(lasMeta({ getItem: () => '{trasig' } as any)).toEqual([]);
  });
  it('texten i ⓘ', () => {
    expect(nedladdningText({ lage: 'klar' })).toBe('Kartan sparad i enheten ✓');
    expect(nedladdningText({ lage: 'laddar', klara: 30, totalt: 50 })).toBe('Sparar kartan i enheten … 60 %');
    expect(nedladdningText({ lage: 'av' })).toBeNull();
  });
});

describe('vakter', () => {
  const sw = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');
  const sida = fs.readFileSync(path.resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
  it('service workern läser samma cache som nedladdningen', () => {
    expect(sw).toContain(`const KART_CACHE = '${KART_CACHE}';`);
  });
  it('planeringssidans bakgrunder begär rutorna på EXAKT nedladdningens adresser', () => {
    expect(sida).toContain('tiles: [KARTRUTA_MALL.satellite]');
    expect(sida).toContain('tiles: [KARTRUTA_MALL.lantmateriet]');
    expect(sida).toContain('tiles: [KARTRUTA_MALL.topographic]');
    const terrang = fs.readFileSync(path.resolve(__dirname, '../components/MapLibreMap.tsx'), 'utf8');
    expect(terrang).toContain(KARTRUTA_MALL.terrang);
  });
});

import { attRensa, bakgrundNat, nogPlats, onskadeTrakter } from './kartNedladdning';

describe('bakgrunden (som Tesla: föraren gör ingenting)', () => {
  it('maskinen: den öppna trakten + de två nästa i kön, i köns ordning', () => {
    const ko = [{ objekt_id: 'c', ordning: 3 }, { objekt_id: 'a', ordning: 1 }, { objekt_id: 'b', ordning: 2 }, { objekt_id: 'd', ordning: 4 }];
    expect(onskadeTrakter({ roll: 'maskin', oppen: 'x', ko, aktiva: [] })).toEqual(['x', 'a', 'b']);
    expect(onskadeTrakter({ roll: 'maskin', oppen: 'a', ko, aktiva: [] })).toEqual(['a', 'b', 'c']);
  });
  it('planeraren: alla pågående och planerade; ingen roll = inget', () => {
    expect(onskadeTrakter({ roll: 'planerare', oppen: null, ko: [], aktiva: ['p1', 'p2'] })).toEqual(['p1', 'p2']);
    expect(onskadeTrakter({ roll: null, oppen: 'x', ko: [], aktiva: ['p1'] })).toEqual([]);
  });
  it('bara wifi/kabel; okänt nät räcker på dator och maskin men aldrig på en telefon', () => {
    expect(bakgrundNat({ onLine: true, connection: { type: 'wifi' } }, false)).toBe(true);
    expect(bakgrundNat({ onLine: true, connection: { type: 'cellular' } }, true)).toBe(false);
    expect(bakgrundNat({ onLine: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' }, false)).toBe(false);
    expect(bakgrundNat({ onLine: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' }, true)).toBe(true);   // iPad/telefon som är maskin
    expect(bakgrundNat({ onLine: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130' }, false)).toBe(true);
    expect(bakgrundNat({ onLine: false, connection: { type: 'wifi' } }, true)).toBe(false);
  });
  it('gott om plats: minst 500 MB kvar och högst 60 % använt; okänt = ja', () => {
    const MB = 1024 * 1024;
    expect(nogPlats({ usage: 100 * MB, quota: 2000 * MB })).toBe(true);
    expect(nogPlats({ usage: 1300 * MB, quota: 2000 * MB })).toBe(false);
    expect(nogPlats({ usage: 100 * MB, quota: 550 * MB })).toBe(false);
    expect(nogPlats(null)).toBe(true);
  });
  it('rensa: bara det som inte behövs OCH inte öppnats på 14 dagar', () => {
    const dag = 86_400_000, nu = 100 * dag;
    const meta = [
      { id: 'behovs', bbox: TRAKT, ts: 0, antal: 1 },
      { id: 'gammal', bbox: TRAKT, ts: 0, antal: 1 },
      { id: 'oppnadNyss', bbox: TRAKT, ts: 0, antal: 1, oppnad: nu - dag },
    ];
    expect(attRensa(meta, ['behovs'], nu)).toEqual(['gammal']);
  });
});
