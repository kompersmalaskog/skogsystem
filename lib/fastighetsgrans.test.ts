import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ETIKETT_INSKJUT_M, ETIKETT_MAX_KNICK_GRADER, FASTIGHET_FALL_M, NARA_STYRKA_M, NARA_TRAKTEN_M, OUTRETT_NAMN, TRAKT_MIN_ANDEL,
  avstandTillRagang, bedomTrakt, byggRagang, etikettText, fastigheterUr, fastighetNamn, fastighetsFall, gransRubrik, gransVidTryck,
  provpunkter, punktIPolygon, traktdelarUr, FASTIGHET_KORT_MENING, type RagangModell,
} from './fastighetsgrans';

// Syntetisk värld i meter (x österut, y norrut från [15, 57]) — samma omräkning som modulen använder.
const LNG0 = 15, LAT0 = 57;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 111320;
const ll = (x: number, y: number): [number, number] => [LNG0 + x / KX, LAT0 + y / KY];
const ruta = (x0: number, y0: number, x1: number, y1: number): number[][] => [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)];
const fast = (trakt: string, block: string, ring: number[][], extra: Record<string, unknown> = {}) => ({
  type: 'Feature', properties: { _lager: 'SV_FASTIGHET', DETALJTYP: 'fastighetsområde', TRAKT: trakt, BLOCKENHET: block, KOMMUNKOD: '0763', ...extra },
  geometry: { type: 'Polygon', coordinates: [ring] },
});
const traktdel = (ringar: number[][][]) => ({ type: 'Feature', properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'MultiPolygon', coordinates: ringar.map((r) => [r]) } });
const xy = (c: number[]) => [(c[0] - LNG0) * KX, (c[1] - LAT0) * KY];

// A (egen, 0–200 × 0–200), B (öster om A, 200–400), C (norr om A). Trakten ligger mitt i A.
const A = fast('KOMPERSMÅLA', '3:12', ruta(0, 0, 200, 200));
const B = fast('RYD', '1:4', ruta(200, 0, 400, 200));
const C = fast('RYD', '1:5', ruta(0, 200, 200, 400));
const TRAKT_I_A = traktdel([ruta(40, 40, 160, 160)]);
const varld = (...f: any[]) => ({ features: f });

describe('namn', () => {
  it('versaler blir stor bokstav först; bindestreck behåller sina led', () => {
    expect(fastighetNamn({ TRAKT: 'ÖSTRA TORAMÅLA', BLOCKENHET: '2:2' })).toBe('Östra Toramåla 2:2');
    expect(fastighetNamn({ TRAKT: 'SÖDRA-HÖKA', BLOCKENHET: '1:6' })).toBe('Södra-Höka 1:6');
  });
  it('samfällighet och fiskesamfällighet: litet prefix (s:1, fs:1) som Lantmäteriet skriver det', () => {
    expect(fastighetNamn({ TRAKT: 'LUMMEMÅLA', BLOCKENHET: 'S:1' })).toBe('Lummemåla s:1');
    expect(fastighetNamn({ TRAKT: 'ÖSTERGÖL', BLOCKENHET: 'FS:1' })).toBe('Östergöl fs:1');
  });
  it('outrett område har ingen beteckning och påstås inte ha någon', () => {
    expect(fastighetNamn({ DETALJTYP: 'outrett fastighetsområde', BLOCKENHET: 'None:0', TRAKT: null })).toBe(OUTRETT_NAMN);
  });
  it('utan TRAKT/BLOCKENHET används FASTIGHET utan områdessuffixet (>5)', () => {
    expect(fastighetNamn({ FASTIGHET: 'BRÄNNAMÅLA 1:2>2' })).toBe('Brännamåla 1:2');
  });
});

describe('fastigheterUr', () => {
  it('flera områden av samma fastighet blir EN fastighet med flera ytor', () => {
    const o1 = fast('STÄNKELSMÅLA', '1:5', ruta(0, 0, 10, 10), { OMRNR: 1 });
    const o2 = fast('STÄNKELSMÅLA', '1:5', ruta(50, 50, 60, 60), { OMRNR: 2 });
    const f = fastigheterUr(varld(o1, o2, A));
    expect(f).toHaveLength(2);
    expect(f.find((x) => x.namn === 'Stänkelsmåla 1:5')!.ytor).toHaveLength(2);
  });
  it('fiskesamfälligheter (sjöar) är ingen mark och tas inte med', () => {
    const fs1 = fast('ÖSTERGÖL', 'FS:1', ruta(0, 0, 10, 10), { DETALJTYP: 'fiskesamfällighet' });
    expect(fastigheterUr(varld(fs1, A))).toHaveLength(1);
  });
  it('två outretta områden slås aldrig ihop (de är inte samma enhet)', () => {
    const o = (id: number, r: number[][]) => ({ type: 'Feature', properties: { _lager: 'SV_FASTIGHET', DETALJTYP: 'outrett fastighetsområde', BLOCKENHET: 'None:0', FLID: id }, geometry: { type: 'Polygon', coordinates: [r] } });
    expect(fastigheterUr(varld(o(1, ruta(0, 0, 10, 10)), o(2, ruta(20, 0, 30, 10))))).toHaveLength(2);
  });
  it('andra lager och trasig geometri ignoreras', () => {
    const annan = { type: 'Feature', properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [ruta(0, 0, 10, 10)] } };
    const trasig = { type: 'Feature', properties: { _lager: 'SV_FASTIGHET', TRAKT: 'X', BLOCKENHET: '1:1' }, geometry: { type: 'Polygon', coordinates: [[[1, 2]]] } };
    expect(fastigheterUr(varld(annan, trasig))).toHaveLength(0);
  });
});

describe('vilka fastigheter ingår i trakten?', () => {
  const fs_ = fastigheterUr(varld(A, B, C));
  const urval = (t: any) => bedomTrakt(traktdelarUr(varld(t)), fs_);
  const namnIn = (u: ReturnType<typeof urval>) => fs_.filter((_, i) => u.iTrakten[i]).map((f) => f.namn).sort();

  it('trakten helt inom en fastighet → bara den ingår', () => {
    const u = urval(TRAKT_I_A);
    expect(u.status).toBe('kand');
    expect(u.skal).toBe('overlapp');
    expect(namnIn(u)).toEqual(['Kompersmåla 3:12']);
  });
  it('trakten på två fastigheter (hälften var) → BÅDA ingår (appen vet inte vem som äger vad, det som räknas är marken)', () => {
    expect(namnIn(urval(traktdel([ruta(150, 40, 250, 160)])))).toEqual(['Kompersmåla 3:12', 'Ryd 1:4']);
  });
  it('en smal kant i grannen (traktgränsen ligger ett par meter över rågången, ≈ 2–4 %) räknas inte som att marken ingår', () => {
    const u = urval(traktdel([ruta(40, 40, 204, 160)]));
    expect(u.andelar[1]).toBeGreaterThan(0.01); expect(u.andelar[1]).toBeLessThan(TRAKT_MIN_ANDEL);
    expect(namnIn(u)).toEqual(['Kompersmåla 3:12']);
  });
  it('6 % i grannen är mark som ingår i trakten (över tröskeln på 4 %)', () => {
    const u = urval(traktdel([ruta(40, 40, 210, 160)]));
    expect(u.andelar[1]).toBeGreaterThan(TRAKT_MIN_ANDEL);
    expect(namnIn(u)).toEqual(['Kompersmåla 3:12', 'Ryd 1:4']);
  });
  it('flera små grannar som trakten delvis täcker tas alla med', () => {
    const remsa = (i: number) => fast('GRANNE', `${i}:1`, ruta(58 + i * 6, -50, 64 + i * 6, 150));
    const fl = fastigheterUr(varld(fast('KOMPERSMÅLA', '3:12', ruta(-50, -50, 58, 150)), ...[0, 1, 2, 3, 4, 5, 6].map(remsa)));
    const u = bedomTrakt(traktdelarUr(varld(traktdel([ruta(0, 0, 100, 100)]))), fl);
    expect(u.iTrakten.filter(Boolean).length).toBeGreaterThanOrEqual(7);   // egna + remsorna som trakten når
    expect(u.iTrakten[0]).toBe(true);
  });
  it('trakt delvis utanför det Vida levererat: fastigheterna vi VET ingår tas med, resten tonas — inget "osäkert"', () => {
    const u = bedomTrakt(traktdelarUr(varld(traktdel([ruta(40, -200, 160, 160)]))), fs_);   // 55 % söder om allt
    expect(u.status).toBe('kand');
    expect(u.otackt).toBeGreaterThan(0.5);
    expect(namnIn(u)).toEqual(['Kompersmåla 3:12']);
  });
  it('trakt helt utanför fastighetsdatan, eller ingen traktgräns / inga fastigheter → okänt (ingen nedtoning), aldrig ett antagande', () => {
    const ute = bedomTrakt(traktdelarUr(varld(traktdel([ruta(2000, 2000, 2100, 2100)]))), fs_);
    expect(ute.status).toBe('okand'); expect(ute.skal).toBe('ingen_overlapp'); expect(ute.iTrakten.some(Boolean)).toBe(false);
    expect(bedomTrakt([], fs_).skal).toBe('ingen_traktgrans');
    expect(bedomTrakt(traktdelarUr(varld(TRAKT_I_A)), []).skal).toBe('inga_fastigheter');
  });
  it('flera traktdelar: delar i A och B → båda ingår', () => {
    expect(namnIn(urval(traktdel([ruta(20, 20, 100, 100), ruta(220, 20, 300, 100)])))).toEqual(['Kompersmåla 3:12', 'Ryd 1:4']);
  });
  it('ett hål i fastigheten räknas inte som fastighetens mark', () => {
    const ring = ruta(0, 0, 200, 200);
    const hal = ruta(80, 80, 120, 120);
    const poly = [ring, hal];
    expect(punktIPolygon(...(ll(100, 100) as [number, number]), poly as any)).toBe(false);
    expect(punktIPolygon(...(ll(30, 30) as [number, number]), poly as any)).toBe(true);
  });
  it('provpunkterna ligger inom traktdelarna och finns även för en liten yta', () => {
    const t = traktdelarUr(varld(traktdel([ruta(40, 40, 160, 160), ruta(10, 10, 14, 14)])));
    const p = provpunkter(t);
    expect(p.length).toBeGreaterThan(20);
    expect(p.every(([lng, lat]) => t.some((poly) => punktIPolygon(lng, lat, poly)))).toBe(true);
  });
});

/** Längd (m) av ett stycke. */
const langd = (coords: number[][]) => coords.map(xy).slice(1).reduce((sum, p, i, a) => sum + Math.hypot(p[0] - xy(coords[i])[0], p[1] - xy(coords[i])[1]), 0);
const stycken = (m: RagangModell, namn: string) => m.linjer.features.filter((f: any) => f.properties.namn === namn);
/** Styrkan i stycket som ligger närmast punkten (x, y) i meter. */
const styrkaVid = (m: RagangModell, namn: string, x: number, y: number): string => {
  let bast = { d: Infinity, styrka: '' };
  for (const f of stycken(m, namn)) for (const c of f.geometry.coordinates as number[][]) {
    const [cx, cy] = xy(c); const d = Math.hypot(cx - x, cy - y);
    if (d < bast.d) bast = { d, styrka: f.properties.styrka };
  }
  return bast.styrka;
};

describe('rågångens modell', () => {
  const m = byggRagang(varld(A, B, C, TRAKT_I_A))!;
  const delad = byggRagang(varld(A, B, C, traktdel([ruta(150, 40, 250, 160)])))!;
  const utanData = byggRagang(varld(A, B, C, traktdel([ruta(2000, 2000, 2100, 2100)])))!;
  const utanTrakt = byggRagang(varld(A, B, C))!;
  const sidor = (mm: RagangModell) => Object.fromEntries(mm.ytor.features.map((f: any) => [f.properties.namn, f.properties.sida]));

  it('sida: fastigheter trakten överlappar = trakt, ALLA övriga = utanfor (oavsett ägare)', () => {
    expect(sidor(m)).toEqual({ 'Kompersmåla 3:12': 'trakt', 'Ryd 1:4': 'utanfor', 'Ryd 1:5': 'utanfor' });
    expect(sidor(delad)).toEqual({ 'Kompersmåla 3:12': 'trakt', 'Ryd 1:4': 'trakt', 'Ryd 1:5': 'utanfor' });
  });
  it('saknas fastighetsdata runt trakten (eller traktgräns) tonas ingenting: alla okända', () => {
    expect(new Set(Object.values(sidor(utanData)))).toEqual(new Set(['okand']));
    expect(new Set(Object.values(sidor(utanTrakt)))).toEqual(new Set(['okand']));
  });
  it('rågångens stycken: varje fastighets rand finns med i sin helhet, i bitar med namn, nyckel och styrka', () => {
    for (const namn of ['Kompersmåla 3:12', 'Ryd 1:4', 'Ryd 1:5']) {
      const st = stycken(m, namn);
      expect(st.length).toBeGreaterThan(0);
      expect(st.every((f: any) => f.geometry.type === 'LineString' && f.properties.nyckel && ['full', 'svag'].includes(f.properties.styrka))).toBe(true);
      const tot = st.reduce((sum: number, f: any) => sum + langd(f.geometry.coordinates), 0);
      expect(tot, namn).toBeCloseTo(800, 0);    // 4 × 200 m, ingen bit saknas eller dubbleras
    }
  });
  it('styrka efter närhet: berör eller ligger inom 50 m från trakten = full, annars svag', () => {
    // Trakten 40–160. A:s rand (0–200) ligger som mest 40 m från den → allt full. B (200–400): västra kanten x=200 är 40 m från trakten → full; östra x=400 → svag.
    expect(styrkaVid(m, 'Kompersmåla 3:12', 0, 100)).toBe('full');
    expect(styrkaVid(m, 'Kompersmåla 3:12', 200, 100)).toBe('full');
    expect(styrkaVid(m, 'Ryd 1:4', 200, 100)).toBe('full');
    expect(styrkaVid(m, 'Ryd 1:4', 400, 100)).toBe('svag');
    expect(styrkaVid(m, 'Ryd 1:5', 100, 400)).toBe('svag');
  });
  it('en rand som korsar trakten är full där den korsar', () => {
    const E = fast('KORSAR', '1:1', ruta(100, -300, 300, 100));   // västra kanten x=100 går genom trakten (y 40–100), men är svag längre söderut
    const mm = byggRagang(varld(E, TRAKT_I_A))!;
    expect(styrkaVid(mm, 'Korsar 1:1', 100, 70)).toBe('full');
    expect(styrkaVid(mm, 'Korsar 1:1', 100, -250)).toBe('svag');
  });
  it('gränsen är NARA_STYRKA_M (50 m): 45 m bort = full, 55 m bort = svag', () => {
    expect(NARA_STYRKA_M).toBe(50);
    const D = (x: number) => fast('LÅNGT', '2:2', ruta(x, 0, x + 100, 200));
    // Trakten når x=160; fastighetens västra kant på x=205 (45 m) respektive x=215 (55 m).
    expect(styrkaVid(byggRagang(varld(D(205), TRAKT_I_A))!, 'Långt 2:2', 205, 100)).toBe('full');
    expect(styrkaVid(byggRagang(varld(D(215), TRAKT_I_A))!, 'Långt 2:2', 215, 100)).toBe('svag');
  });
  it('utan traktgräns vet vi inte vad som är nära: allt ritas i full styrka', () => {
    expect(new Set(utanTrakt.linjer.features.map((f: any) => f.properties.styrka))).toEqual(new Set(['full']));
  });
  it('beteckningens text är bara fastighetsbeteckningen — på båda sidor, aldrig "granne"', () => {
    expect(etikettText('Ryd 1:4')).toBe('Ryd 1:4');
    expect(m.etiketter.features.map((f: any) => f.properties.text).sort()).toEqual(['Kompersmåla 3:12', 'Ryd 1:4', 'Ryd 1:5']);
    expect(delad.etiketter.features.map((f: any) => f.properties.text).sort()).toEqual(['Kompersmåla 3:12', 'Ryd 1:4', 'Ryd 1:5']);
  });
  it('en kort kant närmast trakten (20 m) väljs bort för en lång (200 m): texten måste få plats — och gränsen är 40 m, inte konstanten', () => {
    const remsa = fast('SMALA', '1:1', ruta(0, 0, 200, 20));            // 200 × 20 m: östra kanten är 20 m, södra och norra är 200 m
    const m = byggRagang(varld(remsa, traktdel([ruta(208, 8, 212, 12)])))!;
    const c = (m.etiketter.features[0].geometry.coordinates as number[][]).map(xy);
    const lang = c.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - c[i][0], p[1] - c[i][1]), 0);
    expect(lang, 'beteckningslinjens längd').toBeGreaterThanOrEqual(40);   // bokstavligt 40: ETIKETT_MIN_SPAN_M får inte bli sitt eget facit
    expect(Math.max(...c.map((p) => p[0])) - Math.min(...c.map((p) => p[0])), 'ligger längs den långa kanten').toBeGreaterThan(100);
  });
  it('varje beteckning ligger på sin EGEN sida: alla punkter inne i den egna fastigheten, inskjutna från gränsen', () => {
    const poly = (namn: string) => fastigheterUr(varld(A, B, C)).find((f) => f.namn === namn)!.ytor[0];
    for (const e of m.etiketter.features) {
      const namn = String(e.properties.text);
      const p = poly(namn);
      for (const c of e.geometry.coordinates) {
        expect(punktIPolygon(c[0], c[1], p), `${namn} ${xy(c)}`).toBe(true);
        // avstånd till närmaste kant ≈ inskjutet (hörn kan ge något mer)
        const [x, y] = xy(c);
        const kant = Math.min(...p[0].slice(0, -1).map((_, i) => {
          const a = xy(p[0][i]), b = xy(p[0][i + 1]);
          const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
          return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
        }));
        expect(kant).toBeGreaterThan(ETIKETT_INSKJUT_M * 0.8);
      }
    }
  });
  it('INGA gränspinnar: modellen har ingen pinnlista och modulen ritar inga (rött är bara varning)', () => {
    expect((m as any).pinnar).toBeUndefined();
    const kalla = fs.readFileSync(path.join(process.cwd(), 'lib/fastighetsgrans.ts'), 'utf8');
    expect(kalla).not.toMatch(/pinnarLangs|PINNE_|laggPinne/);
  });
  it('beteckningar ritas bara nära trakten — en fastighet 5 km bort får ingen, men dess rågång ritas ändå (svag)', () => {
    const lang = fast('LÅNGT', '9:9', ruta(5000, 5000, 5200, 5200));
    const mm = byggRagang(varld(A, lang, TRAKT_I_A))!;
    expect(mm.etiketter.features.map((f: any) => f.properties.text)).toEqual(['Kompersmåla 3:12']);
    expect(stycken(mm, 'Långt 9:9').length).toBeGreaterThan(0);
    expect(new Set(stycken(mm, 'Långt 9:9').map((f: any) => f.properties.styrka))).toEqual(new Set(['svag']));
    expect(NARA_TRAKTEN_M).toBe(600);
  });
  it('utan fastighetsytor finns ingen modell (ingenting att rita)', () => {
    expect(byggRagang(varld(TRAKT_I_A))).toBeNull();
    expect(byggRagang(null)).toBeNull();
  });
});

describe('fällningscirkeln: rågången inom 30 m', () => {
  const m = byggRagang(varld(A, B, C, TRAKT_I_A))!;
  const pos = (x: number, y: number) => ({ lat: LAT0 + y / KY, lon: LNG0 + x / KX });
  it('18 m från rågången → 18', () => {
    expect(fastighetsFall(pos(182, 100), m)).toEqual({ avstandM: 18 });
  });
  it('precis utanför 30 m → ingen; precis innanför → ja', () => {
    expect(fastighetsFall(pos(200 - FASTIGHET_FALL_M - 1, 100), m)).toBeNull();
    expect(fastighetsFall(pos(200 - FASTIGHET_FALL_M + 1, 100), m)).not.toBeNull();
  });
  it('mitt på en fastighet, utan position eller utan modell → ingen', () => {
    expect(fastighetsFall(pos(100, 100), m)).toBeNull();
    expect(fastighetsFall(null, m)).toBeNull();
    expect(fastighetsFall(pos(190, 100), null)).toBeNull();
  });
  it('fällningsvarningen gäller ALLA gränser inom 30 m, också svaga stycken långt från trakten', () => {
    expect(styrkaVid(m, 'Ryd 1:4', 400, 100)).toBe('svag');
    expect(fastighetsFall(pos(380, 100), m)).toEqual({ avstandM: 20 });
  });
  it('avståndet räknas åt båda hållen (från grannens sida också)', () => {
    expect(fastighetsFall(pos(215, 100), m)).toEqual({ avstandM: 15 });
    expect(avstandTillRagang(pos(100, 100), m)).toBeNull();
  });
});

describe('tryck på gränsen → "X mot Y"', () => {
  const m = byggRagang(varld(A, B, C, TRAKT_I_A))!;
  const tryck = (x: number, y: number) => { const [lng, lat] = ll(x, y); return { lng, lat }; };
  it('på delad gräns: fastigheten som ingår i trakten först, sedan den andra', () => {
    const g = gransVidTryck(tryck(200, 100), m)!;
    expect(g.a).toBe('Kompersmåla 3:12');
    expect(g.b).toBe('Ryd 1:4');
    expect(gransRubrik(g)).toBe('Fastighetsgräns · Kompersmåla 3:12 mot Ryd 1:4');
  });
  it('ordningen är densamma oavsett från vilken sida man trycker', () => {
    expect(gransVidTryck(tryck(205, 100), m)!.a).toBe('Kompersmåla 3:12');
  });
  it('på en yttergräns där den andra fastigheten inte finns i Vidas data står bara den ena — aldrig "granne"', () => {
    const g = gransVidTryck(tryck(0, 100), m)!;
    expect(g.a).toBe('Kompersmåla 3:12');
    expect(g.b).toBeNull();
    expect(gransRubrik(g)).toBe('Fastighetsgräns · Kompersmåla 3:12');
  });
  it('mitt inne i en fastighet (långt från rågång) → inget kort', () => {
    expect(gransVidTryck(tryck(100, 100), m)).toBeNull();
    expect(gransVidTryck(tryck(100, 100), null)).toBeNull();
  });
  it('kortets mening: gränsen kan avvika några meter, lita på snitsel och märkning — inget om gränspinnar', () => {
    expect(FASTIGHET_KORT_MENING).toBe('Gränsen kan avvika några meter. Lita på snitsel och märkning i fält.');
  });
  it('tryck på ett SVAGT stycke (långt från trakten) öppnar kortet precis som ett starkt', () => {
    expect(styrkaVid(m, 'Ryd 1:4', 400, 100)).toBe('svag');
    expect(gransVidTryck(tryck(400, 100), m)!.a).toBe('Ryd 1:4');
  });
});

describe('verklig data: Stänkelsmåla 2025 (prod 2026-10-22)', () => {
  const fc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/fastighetsgrans_stankelsmala.json'), 'utf8'));
  const m = byggRagang(fc)!;
  it('trakten ligger på två fastigheter (Gammalsmåla 2:12 och Stänkelsmåla 1:3) → BÅDA ingår (ljusa), de 15 andra tonas ned — oavsett ägare', () => {
    expect(m.urval.status).toBe('kand');
    const namn = m.fastigheter.map((f) => f.namn);
    const i212 = namn.indexOf('Gammalsmåla 2:12'), i13 = namn.indexOf('Stänkelsmåla 1:3');
    expect(m.urval.andelar[i212]).toBeGreaterThan(0.3);
    expect(m.urval.andelar[i13]).toBeGreaterThan(0.3);
    const sidor = Object.fromEntries(m.ytor.features.map((f: any) => [f.properties.namn, f.properties.sida]));
    expect(Object.entries(sidor).filter(([, v]) => v === 'trakt').map(([k]) => k).sort()).toEqual(['Gammalsmåla 2:12', 'Stänkelsmåla 1:3']);
    expect(Object.values(sidor).filter((v) => v === 'utanfor')).toHaveLength(15);
    expect(m.etiketter.features.every((f: any) => !/granne/i.test(String(f.properties.text)))).toBe(true);
  });
  it('stycken nära trakten är starka, resten svaga — och båda finns i den verkliga datan', () => {
    const styrkor = new Set(m.linjer.features.map((f: any) => f.properties.styrka));
    expect(styrkor).toEqual(new Set(['full', 'svag']));
  });
  it('områden av samma fastighet blir en: 17 fastigheter ur 19 polygoner; det outretta området heter så', () => {
    expect(m.fastigheter).toHaveLength(17);
    expect(m.fastigheter.filter((f) => f.namn === OUTRETT_NAMN)).toHaveLength(1);
    expect(m.fastigheter.find((f) => f.namn === 'Stänkelsmåla 1:5')!.ytor).toHaveLength(2);
  });
  it('hålet i Gammalsmåla 2:12 blir en egen ringlinje och räknas inte som dess mark', () => {
    const g = m.fastigheter.find((f) => f.namn === 'Gammalsmåla 2:12')!;
    expect(g.ytor[0].length).toBeGreaterThan(1);
    const ringar = m.linjer.features.filter((f: any) => f.properties.namn === 'Gammalsmåla 2:12');
    expect(ringar.length).toBeGreaterThanOrEqual(g.ytor[0].length);   // varje ring ger minst ett stycke
  });
  it('beteckningen följer EN rak sträcka längs rågången närmast trakten — aldrig runt ett hörn (MapLibre lägger ingen text runt ett skarpt hörn)', () => {
    // Trakt nära A:s östra kant (x = 200): A:s beteckning ska ligga längs den kanten (x ≈ 186), B:s längs sin västra (x ≈ 214).
    const nara = byggRagang(varld(A, B, traktdel([ruta(120, 60, 196, 140)])))!;
    const rad = (text: string) => nara.etiketter.features.find((f: any) => f.properties.text === text)!.geometry.coordinates.map(xy);
    for (const [x, y] of rad('Kompersmåla 3:12')) expect(Math.abs(x - 186), `A ${x},${y}`).toBeLessThan(1);
    for (const [x, y] of rad('Ryd 1:4')) expect(Math.abs(x - 214), `B ${x},${y}`).toBeLessThan(1);
    for (const f of nara.etiketter.features) {
      const c = (f.geometry.coordinates as number[][]).map(xy);
      for (let i = 1; i + 1 < c.length; i++) {
        const a1 = Math.atan2(c[i][1] - c[i - 1][1], c[i][0] - c[i - 1][0]), a2 = Math.atan2(c[i + 1][1] - c[i][1], c[i + 1][0] - c[i][0]);
        let d = Math.abs(a2 - a1) * (180 / Math.PI); if (d > 180) d = 360 - d;
        expect(d, 'hörn på beteckningslinjen').toBeLessThanOrEqual(ETIKETT_MAX_KNICK_GRADER);
      }
      const len = c.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - c[i][0], p[1] - c[i][1]), 0);
      expect(len, 'beteckningslinjen ska vara så lång att texten får plats').toBeGreaterThanOrEqual(40);
    }
  });
  it('alla beteckningslinjer ligger inne i sin fastighet', () => {
    for (const e of m.etiketter.features) {
      const namn = String(e.properties.text);
      const f = m.fastigheter.find((x) => x.namn === namn)!;
      for (const c of e.geometry.coordinates) expect(f.ytor.some((p) => punktIPolygon(c[0], c[1], p)), `${namn}`).toBe(true);
    }
  });
});
