// STRÅK — hyttspåren som ett fåtal lugna linjer i stället för en linje per körning (Martin 2026-10-28: "nu spretar dom som fan").
// BARA RITNINGEN. Sparad data, avverkad areal och allt som räknas använder rådata (lib/hyttspar) som förut — samma regel som lib/sparJamning.
//
// Indata = de redan utjämnade linjerna (hyttsparRitadeLinjer) för ALLA dagar på objektet och en roll. Utdata = stråkens mittlinjer.
//   1. Linjerna ritas i ett rutnät (1 m ruta; större ruta på stora områden så rutnätet aldrig blir för stort).
//   2. Lätt oskärpa (gauss). SKOTAREN 2,5 m: körningar på samma väg (några meter isär) blir EN väg.
//      SKÖRDAREN 1,0 m: bara körningar som verkligen ligger ovanpå varandra slås ihop. Större oskärpa slår ihop grannstråken
//      och hittar på ett rutnät av fyrkanter som inte finns (provat på Skälviken 2026-10-28).
//   3. Tröskel 0,12/σ (en ensam körning blir kvar — ett stråk som bara körts en gång är också ett stråk), små fläckar bort.
//   4. Skelett (Zhang–Suen) → mittlinjen, en pixel bred.
//   5. Grafen: korsningar (intilliggande korsningspixlar = EN korsning), kanter mellan dem. Korta piggar (< PIGG_M) och små öglor (< OGLA_M) bort.
//   6. Varje kant: Douglas-Peucker 0,75 m + Chaikin två varv → mjuka linjer. Tillbaka till [lng, lat].
// Beräknas EN gång när spåren lästs (inte per bildruta). Skälviken (≈ 6 000 punkter, båda rollerna): se strak.test.ts för tiden.
// Går något fel, eller blir resultatet tomt, ritas indata som förut — ett spår försvinner aldrig.

export type Koord = [number, number];   // [lng, lat]
export type StrakRoll = 'skordare' | 'skotare';

export const STRAK_SIGMA_M: Readonly<Record<StrakRoll, number>> = { skordare: 1.0, skotare: 2.5 };
export const STRAK_TROSKEL = 0.12;        // × 1/σ (rutor)
export const STRAK_MAX_RUTOR = 4_000_000; // rutnätets storlek; större område → större ruta
export const PIGG_M = 6;                  // gren från en korsning till en ände kortare än så = brus
export const OGLA_M = 25;                 // ögla (kant som börjar och slutar i samma korsning) kortare än så = brus
export const MIN_FLACK_RUTOR = 30;        // sammanhängande fläck mindre än så = brus
export const STRAK_TOLERANS_M = 0.75;

const M_PER_GRAD = 111320;

type XY = [number, number];

/** Stråken för en roll. Ren funktion. */
export function byggStrak(linjer: Koord[][], roll: StrakRoll): Koord[][] {
  const giltiga = linjer.filter((l) => Array.isArray(l) && l.length >= 2);
  if (giltiga.length === 0) return [];
  try {
    const ut = byggStrakIntern(giltiga, roll);
    return ut.length > 0 ? ut : giltiga;
  } catch {
    return giltiga;
  }
}

function byggStrakIntern(linjer: Koord[][], roll: StrakRoll): Koord[][] {
  // Lokal plan projektion runt medelpunkten.
  let sx = 0, sy = 0, n = 0;
  for (const l of linjer) for (const [lng, lat] of l) { sx += lng; sy += lat; n++; }
  const lng0 = sx / n, lat0 = sy / n;
  const kx = M_PER_GRAD * Math.cos((lat0 * Math.PI) / 180), ky = M_PER_GRAD;
  const tillXY = ([lng, lat]: Koord): XY => [(lng - lng0) * kx, (lat - lat0) * ky];
  const tillLL = ([x, y]: XY): Koord => [lng0 + x / kx, lat0 + y / ky];
  const xy = linjer.map((l) => l.map(tillXY));

  const sigmaM = STRAK_SIGMA_M[roll];
  const marg = sigmaM * 4 + 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of xy) for (const [x, y] of l) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  minX -= marg; minY -= marg; maxX += marg; maxY += marg;
  let ruta = 1;
  const yta = (maxX - minX) * (maxY - minY);
  if (yta / (ruta * ruta) > STRAK_MAX_RUTOR) ruta = Math.sqrt(yta / STRAK_MAX_RUTOR);
  const W = Math.ceil((maxX - minX) / ruta) + 1, H = Math.ceil((maxY - minY) / ruta) + 1;

  // 1. Rita linjerna (en körning lägger 1 per ruta; samma ruta i samma körning räknas inte två gånger i ett steg).
  const tat = new Float32Array(W * H);
  for (const l of xy) {
    for (let i = 1; i < l.length; i++) {
      const [ax, ay] = l[i - 1], [bx, by] = l[i];
      const steg = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (ruta * 0.5)));
      let forra = -1;
      for (let s = i === 1 ? 0 : 1; s <= steg; s++) {
        const t = s / steg;
        const c = Math.round((ax + (bx - ax) * t - minX) / ruta), r = Math.round((ay + (by - ay) * t - minY) / ruta);
        const idx = r * W + c;
        if (idx !== forra && c >= 0 && c < W && r >= 0 && r < H) { tat[idx] += 1; forra = idx; }
      }
    }
  }

  // 2. Gauss (separerbar).
  const sigma = sigmaM / ruta;
  const blur = gauss(tat, W, H, sigma);

  // 3. Tröskel + små fläckar bort.
  const troskel = STRAK_TROSKEL / Math.max(sigma, 0.5);
  const bin = new Uint8Array(W * H);
  for (let i = 0; i < bin.length; i++) bin[i] = blur[i] > troskel ? 1 : 0;
  taBortSmaFlackar(bin, W, H, MIN_FLACK_RUTOR / (ruta * ruta));

  // 4. Skelett.
  zhangSuen(bin, W, H);

  // 5. Graf → kanter, piggar och öglor bort.
  const kvar = kanterUrSkelett(bin, W, H).filter((k) => {
    const langd = polyLangd(k.pix) * ruta;
    if (k.typ === 'pigg' && langd < PIGG_M) return false;
    if (k.typ === 'ogla' && langd < OGLA_M) return false;
    return true;   // korta kanter MELLAN korsningar behålls — annars blir linjen streckad
  });
  const kanter = kedja(kvar).filter((k) => polyLangd(k.pix) * ruta >= ruta * 2);

  // 6. Mjuka linjer.
  return kanter.map((k) => {
    const pts: XY[] = k.pix.map(([c, r]) => [minX + c * ruta, minY + r * ruta]);
    const enkel = douglasPeucker(pts, STRAK_TOLERANS_M);
    return chaikin(chaikin(enkel)).map(tillLL);
  }).filter((l) => l.length >= 2);
}

function gauss(src: Float32Array, W: number, H: number, sigma: number): Float32Array {
  const rad = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(rad * 2 + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + rad] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(W * H), ut = new Float32Array(W * H);
  for (let r = 0; r < H; r++) {
    const o = r * W;
    for (let c = 0; c < W; c++) {
      if (src[o + c] === 0) continue;   // gles: sprid bara från rutor med värde
      const v = src[o + c];
      for (let i = -rad; i <= rad; i++) { const cc = c + i; if (cc >= 0 && cc < W) tmp[o + cc] += v * k[i + rad]; }
    }
  }
  for (let r = 0; r < H; r++) {
    const o = r * W;
    for (let c = 0; c < W; c++) {
      const v = tmp[o + c];
      if (v === 0) continue;
      for (let i = -rad; i <= rad; i++) { const rr = r + i; if (rr >= 0 && rr < H) ut[rr * W + c] += v * k[i + rad]; }
    }
  }
  return ut;
}

function taBortSmaFlackar(bin: Uint8Array, W: number, H: number, min: number) {
  const sett = new Uint8Array(W * H);
  const ko = new Int32Array(W * H);
  for (let s = 0; s < bin.length; s++) {
    if (!bin[s] || sett[s]) continue;
    let h = 0, t = 0; ko[t++] = s; sett[s] = 1;
    while (h < t) {
      const p = ko[h++]; const c = p % W, r = (p - c) / W;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue;
        const q = rr * W + cc; if (bin[q] && !sett[q]) { sett[q] = 1; ko[t++] = q; }
      }
    }
    if (t < min) for (let i = 0; i < t; i++) bin[ko[i]] = 0;
  }
}

/** Zhang–Suen-förtunning, på plats. */
export function zhangSuen(b: Uint8Array, W: number, H: number) {
  const bort: number[] = [];
  let andrat = true;
  while (andrat) {
    andrat = false;
    for (let pass = 0; pass < 2; pass++) {
      bort.length = 0;
      for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) {
        const i = r * W + c; if (!b[i]) continue;
        const p2 = b[i - W], p3 = b[i - W + 1], p4 = b[i + 1], p5 = b[i + W + 1], p6 = b[i + W], p7 = b[i + W - 1], p8 = b[i - 1], p9 = b[i - W - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A = (+(!p2 && p3)) + (+(!p3 && p4)) + (+(!p4 && p5)) + (+(!p5 && p6)) + (+(!p6 && p7)) + (+(!p7 && p8)) + (+(!p8 && p9)) + (+(!p9 && p2));
        if (A !== 1) continue;
        if (pass === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) bort.push(i);
      }
      if (bort.length) { andrat = true; for (const i of bort) b[i] = 0; }
    }
  }
}

type Kant = { pix: XY[]; typ: 'pigg' | 'ogla' | 'vanlig'; a: number; b: number };

const GRANNAR: XY[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Kanterna i skelettet. Korsningspixlar som ligger intill varandra räknas som EN korsning (8-grannskap ger annars små trianglar). */
export function kanterUrSkelett(b: Uint8Array, W: number, H: number): Kant[] {
  const grad = (i: number) => { const c = i % W, r = (i - c) / W; let g = 0; for (const [dc, dr] of GRANNAR) { const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < W && rr < H && b[rr * W + cc]) g++; } return g; };
  const grannar = (i: number) => { const c = i % W, r = (i - c) / W; const ut: number[] = []; for (const [dc, dr] of GRANNAR) { const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < W && rr < H && b[rr * W + cc]) ut.push(rr * W + cc); } return ut; };
  // Noder: grad != 2. Korsningskluster (grad ≥ 3, intilliggande) får samma nod-id.
  const nod = new Int32Array(W * H).fill(-1);
  let nodId = 0;
  const arAnde: number[] = [];
  for (let i = 0; i < b.length; i++) {
    if (!b[i] || nod[i] >= 0) continue;
    const g = grad(i);
    if (g === 2) continue;
    if (g <= 1) { nod[i] = nodId; arAnde[nodId] = 1; nodId++; continue; }
    // kluster av korsningspixlar
    const ko = [i]; nod[i] = nodId;
    while (ko.length) { const p = ko.pop()!; for (const q of grannar(p)) if (nod[q] < 0 && grad(q) >= 3) { nod[q] = nodId; ko.push(q); } }
    arAnde[nodId] = 0; nodId++;
  }
  const xyAv = (i: number): XY => { const c = i % W; return [c, (i - c) / W]; };
  const besokt = new Uint8Array(W * H);   // gradtvå-pixlar som redan ingår i en kant
  const kanter: Kant[] = [];
  const sparadeKorta = new Set<string>();
  for (let i = 0; i < b.length; i++) {
    if (!b[i] || nod[i] < 0) continue;
    for (const start of grannar(i)) {
      if (nod[start] >= 0) {
        // två noder direkt intill varandra (olika kluster): en kort kant
        if (nod[start] !== nod[i]) { const key = [Math.min(i, start), Math.max(i, start)].join(','); if (!sparadeKorta.has(key)) { sparadeKorta.add(key); kanter.push({ pix: [xyAv(i), xyAv(start)], typ: arAnde[nod[i]] || arAnde[nod[start]] ? 'pigg' : 'vanlig', a: nod[i], b: nod[start] }); } }
        continue;
      }
      if (besokt[start]) continue;
      const vag = [i, start]; besokt[start] = 1;
      let forra = i, nu = start, slut = -1;
      for (;;) {
        const nasta = grannar(nu).filter((q) => q !== forra && !(nod[q] < 0 && besokt[q]));
        const tillNod = nasta.find((q) => nod[q] >= 0 && q !== i) ?? nasta.find((q) => nod[q] >= 0);
        if (tillNod !== undefined) { vag.push(tillNod); slut = tillNod; break; }
        const fri = nasta.find((q) => nod[q] < 0 && !besokt[q]);
        if (fri === undefined) break;
        besokt[fri] = 1; vag.push(fri); forra = nu; nu = fri;
      }
      const a = nod[i], bb = slut >= 0 ? nod[slut] : -1;
      const typ: Kant['typ'] = bb === a ? 'ogla' : (arAnde[a] || (bb >= 0 && arAnde[bb])) && !(arAnde[a] && bb >= 0 && arAnde[bb]) ? 'pigg' : 'vanlig';
      kanter.push({ pix: vag.map(xyAv), typ, a, b: bb });
    }
  }
  // Rena slingor (bara grad 2, ingen nod): en kant var.
  for (let i = 0; i < b.length; i++) {
    if (!b[i] || nod[i] >= 0 || besokt[i]) continue;
    const vag = [i]; besokt[i] = 1; let nu = i;
    for (;;) { const fri = grannar(nu).find((q) => !besokt[q] && nod[q] < 0); if (fri === undefined) break; besokt[fri] = 1; vag.push(fri); nu = fri; }
    vag.push(i);
    kanter.push({ pix: vag.map(xyAv), typ: 'ogla', a: -1, b: -1 });
  }
  return kanter;
}

/** Slår ihop kanter som möts i en nod där bara två kanter möts → långa linjer som går att jämna ut i ett stycke (inga hörn vid skarvarna). */
function kedja(kanter: Kant[]): Kant[] {
  const vid = new Map<number, number[]>();
  kanter.forEach((k, i) => { for (const n of [k.a, k.b]) if (n >= 0) { const l = vid.get(n) ?? []; l.push(i); vid.set(n, l); } });
  const anvand = new Uint8Array(kanter.length);
  const ut: Kant[] = [];
  const forlang = (pix: XY[], fran: number, forbjuden: number): void => {
    let nod = fran, sist = forbjuden;
    for (let varv = 0; varv < kanter.length; varv++) {
      const l = (vid.get(nod) ?? []).filter((j) => j !== sist);
      if ((vid.get(nod) ?? []).length !== 2 || l.length !== 1 || anvand[l[0]]) return;
      const j = l[0]; anvand[j] = 1;
      const k = kanter[j];
      const fram = k.a === nod ? k.pix : [...k.pix].reverse();
      pix.push(...fram.slice(1));
      nod = k.a === nod ? k.b : k.a; sist = j;
      if (nod < 0) return;
    }
  };
  kanter.forEach((k, i) => {
    if (anvand[i]) return;
    anvand[i] = 1;
    const pix = [...k.pix];
    if (k.b >= 0) forlang(pix, k.b, i);
    if (k.a >= 0) { const bak: XY[] = [...pix].reverse(); forlang(bak, k.a, i); pix.splice(0, pix.length, ...bak.reverse()); }
    ut.push({ ...k, pix });
  });
  return ut;
}

function polyLangd(p: XY[]): number { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }

function douglasPeucker(p: XY[], tol: number): XY[] {
  if (p.length < 3) return p;
  const behall = new Uint8Array(p.length); behall[0] = 1; behall[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = p[a], [bx, by] = p[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let max = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = L > 0 ? Math.abs(dx * (p[i][1] - ay) - dy * (p[i][0] - ax)) / L : Math.hypot(p[i][0] - ax, p[i][1] - ay);
      if (d > max) { max = d; mi = i; }
    }
    if (max > tol) { behall[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => behall[i]);
}

/** Chaikin: rundar hörnen, ändpunkterna står kvar. */
function chaikin(p: XY[]): XY[] {
  if (p.length < 3) return p;
  const ut: XY[] = [p[0]];
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, ay] = p[i], [bx, by] = p[i + 1];
    ut.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
  }
  ut.push(p[p.length - 1]);
  return ut;
}

/** Total längd i meter (för tester och PR-texten). */
export function langdM(linjer: Koord[][]): number {
  let s = 0;
  for (const l of linjer) for (let i = 1; i < l.length; i++) {
    const lat = ((l[i][1] + l[i - 1][1]) / 2) * Math.PI / 180;
    s += Math.hypot((l[i][0] - l[i - 1][0]) * M_PER_GRAD * Math.cos(lat), (l[i][1] - l[i - 1][1]) * M_PER_GRAD);
  }
  return s;
}

/** Kartans features för en roll: alla dagars ritade linjer → stråk. `alder` = den nyaste dagen som ingår (stråken bleknar inte bort medan någon dag är färsk). */
export function strakFeatures(rader: { linjer: Koord[][]; alder: number }[], roll: StrakRoll): any[] {
  if (rader.length === 0) return [];
  const alder = Math.min(...rader.map((r) => r.alder));
  return byggStrak(rader.flatMap((r) => r.linjer), roll)
    .map((coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { alder } }));
}
