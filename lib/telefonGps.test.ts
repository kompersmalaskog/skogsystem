import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLACERING, TELEFON_GPS, cirkelPolygon, distMeter, filtreraFix, medelPosition, nyttFilter, osakerhetsText, samlaPosition, type FilterState, type TelefonMat } from './telefonGps';

// ── Simulering: en person går österut 1,4 m/s i en timme-minut under krontak ───────────────────────────────────────────
const LAT0 = 56.4, LNG0 = 14.7;
const M_PER_LNG = 111320 * Math.cos(LAT0 * Math.PI / 180);
const punkt = (xM: number, yM: number) => ({ lat: LAT0 + yM / 111320, lng: LNG0 + xM / M_PER_LNG });
function prng(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

/** Skapar rå fixar längs en rak gång; `brus` (m) är verkligt fel, `acc` det telefonen RAPPORTERAR (ofta optimistiskt i skog). */
function gang(o: { sek: number; brus?: number; acc?: number; fartMps?: number; hopp?: number; daliga?: number; seed?: number }): { mat: TelefonMat[]; sann: { lat: number; lng: number }[] } {
  const r = prng(o.seed ?? 7);
  const mat: TelefonMat[] = []; const sann: { lat: number; lng: number }[] = [];
  for (let t = 0; t < o.sek; t++) {
    const s = punkt((o.fartMps ?? 1.4) * t, 0);
    sann.push(s);
    let fel = { x: gauss(r) * (o.brus ?? 6), y: gauss(r) * (o.brus ?? 6) };
    let acc = o.acc ?? 8;
    const u = r();
    if (u < (o.hopp ?? 0)) { const a = r() * 2 * Math.PI, d = 60 + r() * 140; fel = { x: Math.cos(a) * d, y: Math.sin(a) * d }; acc = 10; }          // hopp: stort fel, optimistisk noggrannhet
    else if (u < (o.hopp ?? 0) + (o.daliga ?? 0)) { fel = { x: gauss(r) * 120, y: gauss(r) * 120 }; acc = 60 + r() * 100; }                        // dålig fix: rapporteras också som dålig
    const p = punkt((o.fartMps ?? 1.4) * t + fel.x, fel.y);
    mat.push({ lat: p.lat, lng: p.lng, acc, fart: o.fartMps ?? 1.4, tid: 1_000_000_000 + t * 1000 });
  }
  return { mat, sann };
}
function kor(mat: TelefonMat[]) {
  let st: FilterState | null = nyttFilter();
  const ut: { lat: number; lng: number; i: number }[] = []; const avvisade: Record<string, number> = {};
  mat.forEach((m, i) => { const r = filtreraFix(st, m); st = r.state; if (r.fix) ut.push({ lat: r.fix.lat, lng: r.fix.lng, i }); else avvisade[r.avvisad!] = (avvisade[r.avvisad!] ?? 0) + 1; });
  return { ut, avvisade };
}
const steg = (p: { lat: number; lng: number }[]) => p.slice(1).map((x, i) => distMeter(p[i], x));
const medel = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

describe('filtret: pricken ska inte hoppa', () => {
  it('under krontak (6 m verkligt brus, rapporterat 8 m): utjämnade steg är mycket mindre än råa, felet mot verkliga spåret krymper', () => {
    const { mat, sann } = gang({ sek: 180, brus: 6, acc: 8 });
    const rå = steg(mat);
    const { ut } = kor(mat);
    const f = steg(ut);
    const felRå = medel(mat.map((m, i) => distMeter(m, sann[i])));
    const felF = medel(ut.map((u) => distMeter(u, sann[u.i])));
    expect(medel(f)).toBeLessThan(medel(rå) * 0.6);   // pricken darrar långt mindre
    expect(felF).toBeLessThan(felRå);                  // och ligger närmare där man faktiskt gick
    expect(Math.max(...f)).toBeLessThan(Math.max(...rå));
  });

  it('hopp (5 % av fixarna 60–200 m fel men rapporterade som 10 m) ignoreras: inget enda steg i pricken över 15 m, medan rådatan hoppar hundratals meter', () => {
    const { mat, sann } = gang({ sek: 240, brus: 5, acc: 8, hopp: 0.05, seed: 11 });
    const rå = steg(mat);
    const { ut, avvisade } = kor(mat);
    expect(Math.max(...rå)).toBeGreaterThan(100);
    expect(Math.max(...steg(ut))).toBeLessThan(15);
    expect(avvisade.hopp ?? 0).toBeGreaterThanOrEqual(5);
    expect(medel(ut.map((u) => distMeter(u, sann[u.i])))).toBeLessThan(10);
  });

  it('osäkra fixar (telefonen rapporterar själv 60–160 m) ignoreras när vi har en bättre position', () => {
    const { mat } = gang({ sek: 200, brus: 5, acc: 8, daliga: 0.15, seed: 3 });
    const { ut, avvisade } = kor(mat);
    expect(avvisade.daligNoggrannhet ?? 0).toBeGreaterThanOrEqual(15);
    expect(Math.max(...steg(ut))).toBeLessThan(15);
  });

  it('första positionen är grov (300 m fel, noggrannhet 300) och visas som grov — den bättre fixen efteråt tar över direkt, utan att räknas som hopp', () => {
    const f1 = filtreraFix(nyttFilter(), { ...punkt(300, 0), acc: 300, tid: 1000 });
    expect(f1.fix).toMatchObject({ grov: true, noggrannhetM: 300 });
    const f2 = filtreraFix(f1.state, { ...punkt(0, 0), acc: 8, tid: 3000 });
    expect(f2.fix).not.toBeNull();
    expect(f2.fix!.grov).toBe(false);
    expect(distMeter(f2.fix!, punkt(0, 0))).toBeLessThan(15);   // flyttade sig nästan hela vägen till den bra fixen
  });

  it('rapporterad noggrannhet krymps INTE av utjämningen (felen hänger ihop i skogen): den bär telefonens egen uppgift', () => {
    const { mat } = gang({ sek: 40, brus: 3, acc: 12 });
    const st = { s: nyttFilter() as FilterState | null, sist: null as any };
    for (const m of mat) { const r = filtreraFix(st.s, m); st.s = r.state; if (r.fix) st.sist = r.fix; }
    expect(st.sist.noggrannhetM).toBe(12);
  });

  it('en äldre mätning än den vi redan har ignoreras ("gammal"); ogiltiga tal ignoreras', () => {
    const a = filtreraFix(nyttFilter(), { ...punkt(0, 0), acc: 8, tid: 10_000 });
    expect(filtreraFix(a.state, { ...punkt(1, 0), acc: 8, tid: 5_000 }).avvisad).toBe('gammal');
    expect(filtreraFix(a.state, { lat: NaN, lng: 1, acc: 8, tid: 11_000 }).avvisad).toBe('ogiltig');
  });
});

describe('filtret: bil, omförankring och frysning', () => {
  it('i bil (rapporterad fart 15 m/s) följer pricken med — varken hoppspärr eller utjämning, inget släpar efter', () => {
    const { mat, sann } = gang({ sek: 60, brus: 3, acc: 6, fartMps: 15, seed: 5 });
    const { ut, avvisade } = kor(mat);
    expect(ut.length).toBe(mat.length);
    expect(avvisade).toEqual({});
    expect(medel(ut.map((u) => distMeter(u, sann[u.i])))).toBeLessThan(6);   // ingen eftersläpning på 15 m/s
  });

  it('tre avvikare i rad som hänger ihop (vi har flyttat oss, eller förra positionen var fel) förankrar om pricken — den låser inte ute allt för gott', () => {
    let st: FilterState | null = nyttFilter();
    for (let t = 0; t < 20; t++) st = filtreraFix(st, { ...punkt(0, 0), acc: 6, fart: 0, tid: 1_000 + t * 1000 }).state;
    const nya = [0, 1, 2].map((i) => ({ ...punkt(400, 0), acc: 6, fart: 0, tid: 22_000 + i * 1000 }));
    const r1 = filtreraFix(st, nya[0]); expect(r1.avvisad).toBe('hopp');
    const r2 = filtreraFix(r1.state, nya[1]); expect(r2.avvisad).toBe('hopp');
    const r3 = filtreraFix(r2.state, nya[2]);
    expect(r3.fix).not.toBeNull();
    expect(distMeter(r3.fix!, punkt(400, 0))).toBeLessThan(1);
  });

  it('tre avvikare som INTE hänger ihop (spridda hopp) förankrar inte om', () => {
    let st: FilterState | null = nyttFilter();
    for (let t = 0; t < 20; t++) st = filtreraFix(st, { ...punkt(0, 0), acc: 6, fart: 0, tid: 1_000 + t * 1000 }).state;
    const a = filtreraFix(st, { ...punkt(300, 0), acc: 6, fart: 0, tid: 22_000 });
    const b = filtreraFix(a.state, { ...punkt(-400, 200), acc: 6, fart: 0, tid: 23_000 });
    const c = filtreraFix(b.state, { ...punkt(100, -500), acc: 6, fart: 0, tid: 24_000 });
    expect([a.avvisad, b.avvisad, c.avvisad]).toEqual(['hopp', 'hopp', 'hopp']);
  });

  it('har vi bara dåliga fixar i tät skog tas de sämre igen efter 20 s — pricken fryser inte för gott', () => {
    let st: FilterState | null = nyttFilter();
    st = filtreraFix(st, { ...punkt(0, 0), acc: 6, fart: 0, tid: 1_000 }).state;
    const tidigt = filtreraFix(st, { ...punkt(5, 0), acc: 70, fart: 0, tid: 5_000 });
    expect(tidigt.avvisad).toBe('daligNoggrannhet');
    const sent = filtreraFix(tidigt.state, { ...punkt(5, 0), acc: 70, fart: 0, tid: 1_000 + TELEFON_GPS.FRYST_MS + 1000 });
    expect(sent.fix).not.toBeNull();
    expect(sent.fix!.grov).toBe(true);
  });
});

describe('placering: medelvärde av bra fixar', () => {
  const s = (xM: number, acc: number, tid: number) => ({ ...punkt(xM, 0), noggrannhetM: acc, tid });
  it('viktat med noggrannhet: en bra fix väger mer än en osäker', () => {
    const m = medelPosition([s(0, 5, 1), s(10, 20, 2)])!;
    expect(distMeter(m, punkt(0, 0))).toBeLessThan(2.5);   // nära den bra (vikt 16× större)
    expect(m.antal).toBe(2);
    expect(m.noggrannhetM).toBe(13);   // snittet av 5 och 20 (felen hänger ihop — krymper inte)
    expect(medelPosition([])).toBeNull();
  });

  it('går DIREKT när tre bra fixar redan finns (ingen onödig väntan, ingen "Söker position…")', async () => {
    const nu = 100_000;
    const soker = vi.fn();
    const r = await samlaPosition({ prenumerera: () => () => {}, nu: () => nu, onSoker: soker, forhand: [s(0, 8, nu - 3000), s(1, 9, nu - 2000), s(-1, 7, nu - 1000)] });
    expect(r).toMatchObject({ bra: true, antal: 3 });
    expect(soker).not.toHaveBeenCalled();
  });

  it('en enda bra fix räcker INTE: placeringen väntar tills tre bra fixar finns (och tar då med de som redan fanns)', async () => {
    vi.useFakeTimers();
    try {
      let tid = 100_000; const nu = () => tid;
      let cb: (f: any) => void = () => {};
      const p = samlaPosition({ prenumerera: (c) => { cb = c; return () => {}; }, nu, forhand: [s(0, 8, tid - 1000)] });
      let klar = false; void p.then(() => { klar = true; });
      await vi.advanceTimersByTimeAsync(100);
      expect(klar).toBe(false);                                   // en fix räcker inte
      tid += 1000; cb({ ...punkt(1, 0), noggrannhetM: 9, giltig: true, tid });
      await vi.advanceTimersByTimeAsync(10);
      expect(klar).toBe(false);                                   // inte två heller
      tid += 1000; cb({ ...punkt(-1, 0), noggrannhetM: 7, giltig: true, tid });
      const r = await p;
      expect(r).toMatchObject({ bra: true, antal: 3 });          // den som fanns i förväg + de två nya
    } finally { vi.useRealTimers(); }
  });

  it('väntar in bra fixar: "Söker position…" meddelas EN gång, resultatet är medelvärdet av de tre första bra', async () => {
    vi.useFakeTimers();
    try {
      let tid = 100_000; const nu = () => tid;
      let cb: (f: any) => void = () => {};
      const soker = vi.fn();
      const p = samlaPosition({ prenumerera: (c) => { cb = c; return () => {}; }, nu, onSoker: soker });
      await vi.advanceTimersByTimeAsync(PLACERING.SOKER_EFTER_MS + 10); tid += PLACERING.SOKER_EFTER_MS + 10;
      expect(soker).toHaveBeenCalledTimes(1);
      for (const [x, acc] of [[0, 40], [2, 9], [-2, 8], [1, 7]] as const) { tid += 800; cb({ ...punkt(x, 0), noggrannhetM: acc, giltig: true, tid }); }
      const r = await p;
      expect(r).toMatchObject({ bra: true, antal: 3 });   // den grova fixen (40 m) räknas inte
      expect(distMeter(r!, punkt(0, 0))).toBeLessThan(2);
    } finally { vi.useRealTimers(); }
  });

  it('hinner inga bra fixar: efter 6 s medelvärdet av vad som kom (bra:false — anroparen säger det); inget alls → null', async () => {
    vi.useFakeTimers();
    try {
      let tid = 100_000; const nu = () => tid;
      let cb: (f: any) => void = () => {};
      const p = samlaPosition({ prenumerera: (c) => { cb = c; return () => {}; }, nu });
      tid += 1000; cb({ ...punkt(0, 0), noggrannhetM: 45, giltig: true, tid });
      tid += 1000; cb({ ...punkt(4, 0), noggrannhetM: 60, giltig: true, tid });
      await vi.advanceTimersByTimeAsync(PLACERING.MAX_MS + 10); tid += PLACERING.MAX_MS + 10;
      const r = await p;
      expect(r).toMatchObject({ bra: false, antal: 2 });
      const tom = samlaPosition({ prenumerera: () => () => {}, nu });
      await vi.advanceTimersByTimeAsync(PLACERING.MAX_MS + 10);
      expect(await tom).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});

describe('osäkerhetscirkeln', () => {
  it('cirkeln har verklig radie i meter (alla punkter ligger radien från mitten) och är sluten', () => {
    const c = cirkelPolygon(56.4, 14.7, 25);
    const ring = c.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) expect(distMeter({ lat: 56.4, lng: 14.7 }, { lat, lng })).toBeCloseTo(25, 0);
  });
  it('texten: "±12 m" för en bra fix, "osäker position ±85 m" för en grov, inget utan värde', () => {
    expect(osakerhetsText(12)).toBe('±12 m');
    expect(osakerhetsText(TELEFON_GPS.BRA_M)).toBe('±20 m');
    expect(osakerhetsText(85)).toBe('osäker position ±85 m');
    expect(osakerhetsText(null)).toBeNull();
  });
});

describe('sidans koppling (page.tsx kan inte monteras i test — källvakt)', () => {
  const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
  it('osäkerhetscirkeln ritas bara för telefonens GPS (uppmätt noggrannhet), i verkliga meter, orange och tydligare när positionen är grov', () => {
    expect(page).toContain("map.addLayer({ id: 'gps-osakerhet-fyll'");
    expect(page).toContain("gpsKallaTyp === 'geolocation' && gpsAccuracy != null");
    expect(page).toContain('cirkelPolygon(draw!.lat, draw!.lon, Math.min(gpsAccuracy!, 5000))');
    expect(page).toContain('gpsAccuracy! > TELEFON_GPS.BRA_M');
    expect(page).toContain("map.setPaintProperty('gps-dot', 'circle-color', grov ? FARG.orange : FARG.bla);");
    expect(page).toContain('}, [currentPosition, mapLibreReady, gpsFixFarsk, gpsAccuracy, gpsKallaTyp]);');
  });
  it('"Vid maskinen"/räknarna: telefonen tar medelvärde av bra fixar, maskindatorns serial-GPS tar EN position direkt som förut', () => {
    const ny = page.slice(page.indexOf('const placeraVidMaskinen = async'), page.indexOf('// ÅNGRA: tar bort markeringen'));
    expect(ny).toContain("if (gpsKallaTyp !== 'geolocation') { placeraSymbol(typ, kan.pos.lat, kan.pos.lon); return; }");
    expect(ny).toContain('await samlaTelefonPosition()');
    expect(ny).toContain('r.bra ? undefined : r.noggrannhetM');
    expect(page).toContain("onSoker: () => visaKvitto('Söker position…', 'ok'),");
  });
  it('larmkoordinatens "Använd min GPS-position" tar medelvärde på telefonen (och visar "Söker position…"), serial som förut', () => {
    expect(page).toContain("{larmSoker ? 'Söker position…' : 'Använd min GPS-position'}");
    expect(page).toContain("if (gpsKallaTyp === 'geolocation') {\n                      if (larmSoker) return;");
    expect(page).toContain('hamtaEnGpsFix(12000).then((fix) => {');   // serial-vägen kvar
  });
  it('spårningen (Spåra basväg m.fl.) går genom samma hub — och därmed samma filtrering; GPS-vakten (lib/gps-guard) finns kvar efter', () => {
    expect(page).toContain("import { gpsGuardAccepts");
    expect(page.split('startaGpsKalla(').length - 1).toBeGreaterThanOrEqual(3);   // spårning, passiv watcher, placering delar hubben
  });
});
