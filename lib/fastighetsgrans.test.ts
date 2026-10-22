import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AGARE_MAX_OTACKT, ETIKETT_INSKJUT_M, ETIKETT_MAX_KNICK_GRADER, FASTIGHET_FALL_M, NARA_TRAKTEN_M, OUTRETT_NAMN, PINNE_MAX_AVSTAND_M,
  avstandTillRagang, bedomAgare, byggRagang, etikettText, fastigheterUr, fastighetNamn, fastighetsFall, gransRubrik, gransVidTryck,
  provpunkter, punktIPolygon, traktdelarUr, FASTIGHET_KORT_MENING,
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

describe('vilken fastighet ligger trakten på?', () => {
  const fs_ = fastigheterUr(varld(A, B, C));
  const ar = (t: any) => bedomAgare(traktdelarUr(varld(t)), fs_);

  it('trakten helt inom en fastighet → egen, och det är rätt fastighet', () => {
    const a = ar(TRAKT_I_A);
    expect(a.status).toBe('egen');
    expect(fs_[a.index!].namn).toBe('Kompersmåla 3:12');
    expect(a.skal).toBe('entydig');
  });
  it('trakten på två fastigheter (hälften var) → osäker: ingen nedtoning', () => {
    const a = ar(traktdel([ruta(150, 40, 250, 160)]));
    expect(a.status).toBe('osaker');
    expect(a.index).toBeNull();
    expect(a.skal).toBe('flera_fastigheter');
  });
  it('en smal kant i grannen (traktgränsen ligger några meter över rågången) är fortfarande entydigt', () => {
    const a = ar(traktdel([ruta(40, 40, 204, 160)]));   // ≈ 2 % i B
    expect(a.status).toBe('egen');
    expect(fs_[a.index!].namn).toBe('Kompersmåla 3:12');
  });
  it('mer än 10 % i grannen är inte längre entydigt', () => {
    const a = ar(traktdel([ruta(40, 40, 240, 160)]));   // 20 % i B
    expect(a.status).toBe('osaker');
  });
  it('12 % i grannen räcker för "osäker" även när egna fastigheten har 88 % — gränsen är 10 %, inte "mest i en"', () => {
    const a = ar(traktdel([ruta(40, 40, 224, 160)]));   // 160 m i A, 24 m i B → 87 % / 13 %
    expect(a.andelar.filter((x) => x > 0).sort().reverse().map((x) => Math.round(x * 100))).toEqual([87, 13]);
    expect(a.status).toBe('osaker');
    expect(a.skal).toBe('flera_fastigheter');
  });
  it('spridd över många små grannar är osäkert även när ingen enskild granne når 10 %: egna fastigheten måste ha minst 85 %', () => {
    // 58 % i A och sju remsor à 6 % — varje remsa ligger klart under 10 %, men A har bara 58 %.
    const remsa = (i: number) => fast('GRANNE', `${i}:1`, ruta(58 + i * 6, -50, 64 + i * 6, 150));
    const fl = fastigheterUr(varld(fast('KOMPERSMÅLA', '3:12', ruta(-50, -50, 58, 150)), ...[0, 1, 2, 3, 4, 5, 6].map(remsa)));
    const a = bedomAgare(traktdelarUr(varld(traktdel([ruta(0, 0, 100, 100)]))), fl);
    const [egen, ...grannar] = a.andelar;
    expect(egen).toBeGreaterThan(0.5); expect(egen).toBeLessThan(0.7);
    expect(grannar.every((x) => x < 0.09), `grannarna ${grannar.map((x) => x.toFixed(2))}`).toBe(true);
    expect(a.status).toBe('osaker');
    expect(a.skal).toBe('flera_fastigheter');
  });
  it('en trakt som delvis ligger utanför det Vida levererat → osäker (utanfor_data)', () => {
    const a = ar(traktdel([ruta(100, 100, 100 + 120, 100 + 300)]));   // sticker ut norrut över C:s kant (400) ... men C täcker; flytta längre
    expect(['egen', 'osaker']).toContain(a.status);
    const ut = bedomAgare(traktdelarUr(varld(traktdel([ruta(40, -200, 160, 160)]))), fs_);   // 55 % söder om allt
    expect(ut.status).toBe('osaker');
    expect(ut.skal).toBe('utanfor_data');
    expect(ut.otackt).toBeGreaterThan(AGARE_MAX_OTACKT);
  });
  it('saknas traktgräns eller fastigheter är svaret osäker, aldrig ett antagande', () => {
    expect(bedomAgare([], fs_).skal).toBe('ingen_traktgrans');
    expect(bedomAgare(traktdelarUr(varld(TRAKT_I_A)), []).skal).toBe('inga_fastigheter');
  });
  it('flera traktdelar: alla i samma fastighet → egen; en del i grannen (stor) → osäker', () => {
    expect(ar(traktdel([ruta(20, 20, 60, 60), ruta(100, 100, 180, 180)])).status).toBe('egen');
    expect(ar(traktdel([ruta(20, 20, 100, 100), ruta(220, 20, 300, 100)])).status).toBe('osaker');   // lika stora delar i A och B
    const dominerar = ar(traktdel([ruta(20, 20, 60, 60), ruta(220, 20, 380, 180)]));                  // 94 % i B → B är fastigheten
    expect(fs_[dominerar.index!].namn).toBe('Ryd 1:4');
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

describe('rågångens modell', () => {
  const m = byggRagang(varld(A, B, C, TRAKT_I_A))!;
  const osaker = byggRagang(varld(A, B, C, traktdel([ruta(150, 40, 250, 160)])))!;

  it('sida: egen fastighet = egen, de andra = granne; vet vi inte vilken är trakten är ALLA okända (ingen nedtoning)', () => {
    const sidor = Object.fromEntries(m.ytor.features.map((f: any) => [f.properties.namn, f.properties.sida]));
    expect(sidor).toEqual({ 'Kompersmåla 3:12': 'egen', 'Ryd 1:4': 'granne', 'Ryd 1:5': 'granne' });
    expect(new Set(osaker.ytor.features.map((f: any) => f.properties.sida))).toEqual(new Set(['okand']));
    expect(new Set(osaker.linjer.features.map((f: any) => f.properties.sida))).toEqual(new Set(['okand']));
  });
  it('rågångens linjer är varje polygons ring, med fastighetens namn', () => {
    expect(m.linjer.features).toHaveLength(3);
    expect(m.linjer.features.every((f: any) => f.geometry.type === 'LineString' && f.properties.namn)).toBe(true);
  });
  it('etikettens text: grannen heter "Granne · …", den egna och okända bara beteckningen', () => {
    expect(etikettText('Ryd 1:4', 'granne')).toBe('Granne · Ryd 1:4');
    expect(etikettText('Kompersmåla 3:12', 'egen')).toBe('Kompersmåla 3:12');
    expect(etikettText('Ryd 1:4', 'okand')).toBe('Ryd 1:4');
    const texter = m.etiketter.features.map((f: any) => f.properties.text).sort();
    expect(texter).toEqual(['Granne · Ryd 1:4', 'Granne · Ryd 1:5', 'Kompersmåla 3:12']);
    expect(osaker.etiketter.features.every((f: any) => !String(f.properties.text).startsWith('Granne'))).toBe(true);
  });
  it('en kort kant närmast trakten (20 m) väljs bort för en lång (200 m): texten måste få plats — och gränsen är 40 m, inte konstanten', () => {
    const remsa = fast('SMALA', '1:1', ruta(0, 0, 200, 20));            // 200 × 20 m: östra kanten är 20 m, södra och norra är 200 m
    const m = byggRagang(varld(remsa, traktdel([ruta(208, 8, 212, 12)])))!;
    const c = (m.etiketter.features[0].geometry.coordinates as number[][]).map(xy);
    const langd = c.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - c[i][0], p[1] - c[i][1]), 0);
    expect(langd, 'beteckningslinjens längd').toBeGreaterThanOrEqual(40);   // bokstavligt 40: ETIKETT_MIN_SPAN_M får inte bli sitt eget facit
    expect(Math.max(...c.map((p) => p[0])) - Math.min(...c.map((p) => p[0])), 'ligger längs den långa kanten').toBeGreaterThan(100);
  });
  it('varje beteckning ligger på sin EGEN sida: alla punkter inne i den egna fastigheten, inskjutna från gränsen', () => {
    const poly = (namn: string) => fastigheterUr(varld(A, B, C)).find((f) => f.namn === namn)!.ytor[0];
    for (const e of m.etiketter.features) {
      const namn = String(e.properties.text).replace('Granne · ', '');
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
  it('gränspinnar: i hörnen, ingen dubbel pinne där två fastigheter delar hörn, och aldrig längre än PINNE_MAX_AVSTAND_M mellan', () => {
    const p = m.pinnar.features.map((f: any) => xy(f.geometry.coordinates));
    const nara = (x: number, y: number) => p.filter(([px, py]) => Math.hypot(px - x, py - y) < 8).length;
    expect(nara(0, 0)).toBe(1);        // A:s hörn
    expect(nara(200, 0)).toBe(1);      // A och B delar hörnet: EN pinne
    expect(nara(200, 200)).toBe(1);    // A, B och C delar det
    expect(nara(400, 400)).toBe(0);    // ...C:s yttre hörn (400,400) finns, men (400,400) är utanför ytorna: ingen pinne där
    // sidan 0..200 har inga hörn mitt på men fyllnad så ingen lucka överstiger max
    const langsKanten = p.filter(([px, py]) => Math.abs(py) < 1 && px > 0 && px < 400).map(([px]) => px).sort((a, b) => a - b);
    const med = [0, ...langsKanten, 400];
    for (let i = 1; i < med.length; i++) expect(med[i] - med[i - 1]).toBeLessThanOrEqual(PINNE_MAX_AVSTAND_M + 1);
  });
  it('pinnar och beteckningar ritas bara nära trakten — en fastighet 5 km bort får ingen', () => {
    const lang = fast('LÅNGT', '9:9', ruta(5000, 5000, 5200, 5200));
    const mm = byggRagang(varld(A, lang, TRAKT_I_A))!;
    expect(mm.pinnar.features.every((f: any) => { const [x, y] = xy(f.geometry.coordinates); return x < NARA_TRAKTEN_M + 200 && y < NARA_TRAKTEN_M + 200; })).toBe(true);
    expect(mm.etiketter.features.map((f: any) => f.properties.text)).toEqual(['Kompersmåla 3:12']);
    expect(mm.linjer.features).toHaveLength(2);   // men själva rågången ritas överallt
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
  it('avståndet räknas åt båda hållen (från grannens sida också)', () => {
    expect(fastighetsFall(pos(215, 100), m)).toEqual({ avstandM: 15 });
    expect(avstandTillRagang(pos(100, 100), m)).toBeNull();
  });
});

describe('tryck på gränsen → "X mot Y"', () => {
  const m = byggRagang(varld(A, B, C, TRAKT_I_A))!;
  const tryck = (x: number, y: number) => { const [lng, lat] = ll(x, y); return { lng, lat }; };
  it('på delad gräns: den egna fastigheten först, sedan grannen', () => {
    const g = gransVidTryck(tryck(200, 100), m)!;
    expect(g.a).toBe('Kompersmåla 3:12');
    expect(g.b).toBe('Ryd 1:4');
    expect(gransRubrik(g)).toBe('Fastighetsgräns · Kompersmåla 3:12 mot Ryd 1:4');
  });
  it('ordningen är densamma oavsett från vilken sida man trycker', () => {
    expect(gransVidTryck(tryck(205, 100), m)!.a).toBe('Kompersmåla 3:12');
  });
  it('på en yttergräns där grannen inte finns i Vidas data: "mot granne"', () => {
    const g = gransVidTryck(tryck(0, 100), m)!;
    expect(g.a).toBe('Kompersmåla 3:12');
    expect(g.b).toBeNull();
    expect(gransRubrik(g)).toBe('Fastighetsgräns · Kompersmåla 3:12 mot granne');
  });
  it('mitt inne i en fastighet (långt från rågång) → inget kort', () => {
    expect(gransVidTryck(tryck(100, 100), m)).toBeNull();
    expect(gransVidTryck(tryck(100, 100), null)).toBeNull();
  });
  it('kortets mening säger att gränsen kan avvika och att man ska lita på pinnar och snitsel', () => {
    expect(FASTIGHET_KORT_MENING).toBe('Gränsen kan avvika några meter. Lita på gränspinnar och snitsel i fält.');
  });
});

describe('verklig data: Stänkelsmåla 2025 (prod 2026-10-22)', () => {
  const fc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/fastighetsgrans_stankelsmala.json'), 'utf8'));
  const m = byggRagang(fc)!;
  it('trakten ligger på två fastigheter (Gammalsmåla 2:12 och Stänkelsmåla 1:3) → appen säger osäker och tonar inte ner något', () => {
    expect(m.agare.status).toBe('osaker');
    expect(m.agare.skal).toBe('flera_fastigheter');
    const namn = m.fastigheter.map((f) => f.namn);
    const i212 = namn.indexOf('Gammalsmåla 2:12'), i13 = namn.indexOf('Stänkelsmåla 1:3');
    expect(m.agare.andelar[i212]).toBeGreaterThan(0.3);
    expect(m.agare.andelar[i13]).toBeGreaterThan(0.3);
    expect(new Set(m.ytor.features.map((f: any) => f.properties.sida))).toEqual(new Set(['okand']));
    expect(m.etiketter.features.every((f: any) => !String(f.properties.text).startsWith('Granne'))).toBe(true);
  });
  it('områden av samma fastighet blir en: 17 fastigheter ur 19 polygoner; det outretta området heter så', () => {
    expect(m.fastigheter).toHaveLength(17);
    expect(m.fastigheter.filter((f) => f.namn === OUTRETT_NAMN)).toHaveLength(1);
    expect(m.fastigheter.find((f) => f.namn === 'Stänkelsmåla 1:5')!.ytor).toHaveLength(2);
  });
  it('hålet i Gammalsmåla 2:12 blir en egen ringlinje och räknas inte som dess mark', () => {
    const g = m.fastigheter.find((f) => f.namn === 'Gammalsmåla 2:12')!;
    expect(g.ytor[0].length).toBeGreaterThan(1);
    expect(m.linjer.features.filter((f: any) => f.properties.namn === 'Gammalsmåla 2:12')).toHaveLength(g.ytor[0].length);
  });
  it('gränspinnar finns längs linjen men inte tätare än var 8:e meter', () => {
    expect(m.pinnar.features.length).toBeGreaterThan(50);
    const p = m.pinnar.features.map((f: any) => f.geometry.coordinates as [number, number]);
    const KXr = 111320 * Math.cos((56.588 * Math.PI) / 180);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(Math.hypot((p[i][0] - p[j][0]) * KXr, (p[i][1] - p[j][1]) * 111320)).toBeGreaterThanOrEqual(8);
  });
  it('beteckningen följer EN rak sträcka längs rågången närmast trakten — aldrig runt ett hörn (MapLibre lägger ingen text runt ett skarpt hörn)', () => {
    // Trakt nära A:s östra kant (x = 200): A:s beteckning ska ligga längs den kanten (x ≈ 186), B:s längs sin västra (x ≈ 214).
    const nara = byggRagang(varld(A, B, traktdel([ruta(120, 60, 196, 140)])))!;
    const rad = (text: string) => nara.etiketter.features.find((f: any) => f.properties.text === text)!.geometry.coordinates.map(xy);
    for (const [x, y] of rad('Kompersmåla 3:12')) expect(Math.abs(x - 186), `A ${x},${y}`).toBeLessThan(1);
    for (const [x, y] of rad('Granne · Ryd 1:4')) expect(Math.abs(x - 214), `B ${x},${y}`).toBeLessThan(1);
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
