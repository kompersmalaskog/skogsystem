// HYTTSPÅRENS RITNING UTJÄMNAD — bara ritningen. Sparad data (hyttspar.points) och allt som räknar på spåren (avverkad areal, skotarens stråkunderlag)
// använder RÅDATA som förut; det enda som går genom den här filen är linjerna som ritas på kartan.
//
// Varför: skördarens spår är hackiga. Maskinen kör sakta (1–3 m steg) eller står still medan den avverkar, och GPS-bruset (1–2 m) är lika stort som
// stegen → en brusig hög av hörn som ser ut som en trasig tråd, i stället för en stickväg. Mätt på dagens riktiga spår (Trestensdal, R64428): mediansteg
// 2,1 m, 81 % av stegen under 4 m, 33 s mellan punkterna. Bågskyttebanan (Stefan) har spikar: ett steg 14 m ut och 14 m tillbaka där grannarna ligger 0,4 m isär.
//
// Stegen, i den här ordningen (spikarna först — grannarna ligger bara nära varandra INNAN glesningen):
//   1. tabortSpikar   enskild punkt med steg > 8 m dit OCH tillbaka där grannarna ligger nära varandra (< 4 m, eller < halva steget) → bort
//   2. glesaPunkter   hoppa över punkter närmare än 4 m från SENAST RITADE punkt
//   3. tatSteg        fyll i punkter så att inget steg är > 4 m (sparade punkter är RDP-gallrade → glesa längs raka vägar)
//   4. glidandeMedel  över 5 punkter = ±8 m längs vägen → brusig tråd blir jämn
//   5. hittaSvangar   riktiga svängar (> 20° över en bas som är längre än bruset), mätt på det UTJÄMNADE spåret så bruset inte räknas som sväng.
//                     (Medelvärdet tar bort lite vinkel, så LÅSNINGEN slår till först kring 25–30°; svängar på 20–25° bevaras ändå av Douglas-Peucker 1,5 m
//                     så länge benen är ≳ 9 m. Mätt: 25° → 22° kvar, 30° → 27°, 45° → 41°, 10–15° rätas ut.)
//   6. douglasPeucker 1,5 m tolerans per stycke mellan svängarna → raka stickvägar blir raka, svängarna är alltid kvar som hörn
// Första och sista punkten flyttas aldrig (linjen börjar och slutar där maskinen faktiskt var, även live).

import { hyttsparTillLinjer, type HyttPunkt } from './hyttspar';

export type Koord = [number, number];   // [lng, lat] som GeoJSON
type XY = [number, number];             // meter i en lokal plan projektion

export const SPAR_MIN_STEG_M = 4;       // 1. hoppa över punkter närmare än så från senast ritade
export const SPAR_SPIK_STEG_M = 8;      // 2. steg dit och tillbaka över så här…
export const SPAR_SPIK_GRANNE_M = 4;    //    …där grannarna ligger närmare än så från varandra
export const SPAR_MEDEL_FONSTER = 5;    // 3. glidande medelvärde över så här många punkter (3–5)
export const SPAR_TOLERANS_M = 1.5;     // 3. Douglas-Peucker
export const SPAR_SVANG_GRADER = 20;    //    svängar över så här behålls
/** Sväng-basen: vinkeln mäts mot punkter som ligger minst så här långt bort på båda sidor. Måste vara längre än GPS-bruset (1–2 m) och stegen (2–4 m),
 *  annars "bevaras" bruset i stället för svängarna (mätt: medianvinkeln på 8 m bas är redan 31–49° på dagens spår). */
export const SPAR_SVANG_BAS_M = 14;

export interface JamningsVal {
  minStegM?: number; spikStegM?: number; spikGranneM?: number; medelFonster?: number; toleransM?: number; svangGrader?: number; svangBasM?: number;
}

const M_PER_GRAD = 111320;
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Lokal plan projektion (meter) runt linjens medelbredd — samma ekvirektangulära approximation som resten av appen, exakt nog för ett objekt (några km). */
function projektion(linje: Koord[]) {
  const lat0 = linje.reduce((s, c) => s + c[1], 0) / linje.length;
  const k = Math.cos((lat0 * Math.PI) / 180) * M_PER_GRAD;
  const x0 = linje[0][0] * k, y0 = linje[0][1] * M_PER_GRAD;
  return {
    till: (c: Koord): XY => [c[0] * k - x0, c[1] * M_PER_GRAD - y0],
    fran: (p: XY): Koord => [(p[0] + x0) / k, (p[1] + y0) / M_PER_GRAD],
  };
}

/** 1. Enskilda spikar: punkt i där steget in OCH ut är > spikStegM men grannarna i±1 ligger NÄRA varandra (maskinen gick inte dit — GPS:en hoppade).
 *  "Nära" = under granneM (maskinen står still, t.ex. 0,4 m isär) ELLER under hälften av det kortaste steget (maskinen rör sig: grannarna är då ett
 *  vanligt dubbelsteg ~6 m isär, men spiken ligger 14 m ut). */
export function tabortSpikar(p: XY[], spikStegM: number = SPAR_SPIK_STEG_M, granneM: number = SPAR_SPIK_GRANNE_M): XY[] {
  if (p.length < 3) return p.slice();
  const ut: XY[] = [p[0]];
  let forraBorttagen = false;
  for (let i = 1; i < p.length - 1; i++) {
    const a = dist(p[i - 1], p[i]), b = dist(p[i], p[i + 1]), g = dist(p[i - 1], p[i + 1]);
    const spik = !forraBorttagen && a > spikStegM && b > spikStegM && (g < granneM || g < Math.min(a, b) / 2);
    forraBorttagen = spik;   // bara EN i följd — två spikar bredvid varandra är ingen enskild spik
    if (!spik) ut.push(p[i]);
  }
  ut.push(p[p.length - 1]);
  return ut;
}

/** 2. Hoppa över punkter närmare än minStegM från SENAST BEHÅLLNA (ritade) punkt. Sista punkten behålls alltid så linjen når maskinen. */
export function glesaPunkter(p: XY[], minStegM: number = SPAR_MIN_STEG_M): XY[] {
  if (p.length < 2) return p.slice();
  const ut: XY[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) if (dist(ut[ut.length - 1], p[i]) >= minStegM) ut.push(p[i]);
  const sista = p[p.length - 1];
  if (ut[ut.length - 1] !== sista) ut.push(sista);
  return ut;
}

/** 3. Index på riktiga svängar: vinkeln mellan vägen IN (mot en punkt ≥ basM bakåt) och vägen UT (mot en punkt ≥ basM framåt) är ≥ grader.
 *  Saknas en punkt så långt bort på någon sida (maskinen står i princip still) är det ingen sväng utan brus. Kluster av kandidater → den skarpaste. */
export function hittaSvangar(p: XY[], grader: number = SPAR_SVANG_GRADER, basM: number = SPAR_SVANG_BAS_M): number[] {
  const kandidater: { i: number; vinkel: number }[] = [];
  for (let i = 1; i < p.length - 1; i++) {
    let j = i - 1; while (j > 0 && dist(p[j], p[i]) < basM) j--;
    let k = i + 1; while (k < p.length - 1 && dist(p[k], p[i]) < basM) k++;
    if (dist(p[j], p[i]) < basM || dist(p[k], p[i]) < basM) continue;
    const a1 = Math.atan2(p[i][1] - p[j][1], p[i][0] - p[j][0]);
    const a2 = Math.atan2(p[k][1] - p[i][1], p[k][0] - p[i][0]);
    let v = Math.abs(a2 - a1) * 180 / Math.PI; if (v > 180) v = 360 - v;
    if (v >= grader) kandidater.push({ i, vinkel: v });
  }
  // icke-maximum-undertryckning: kandidater närmare än basM/2 från varandra är EN sväng — behåll den skarpaste
  const ut: number[] = [];
  let grupp: { i: number; vinkel: number }[] = [];
  const stang = () => { if (grupp.length) { ut.push(grupp.reduce((b, c) => (c.vinkel > b.vinkel ? c : b)).i); grupp = []; } };
  for (const c of kandidater) {
    if (grupp.length && dist(p[grupp[grupp.length - 1].i], p[c.i]) >= basM / 2) stang();
    grupp.push(c);
  }
  stang();
  return ut;
}

/** 3. Fyll i punkter så att inget steg är längre än maxStegM (rak interpolation). De sparade punkterna är redan RDP-gallrade (3 m) — längs en rak väg
 *  ligger de flera tiotal meter isär. Ett medelvärde över 5 PUNKTER skulle då spänna hundratals meter och skära av varje hörn (mätt: ~10 m på Trestensdal).
 *  Med ≤ 4 m mellan punkterna blir fönstret om 5 punkter ett AVSTÅNDSfönster (±8 m längs vägen), oavsett hur gles originaldatan är. */
export function tatSteg(p: XY[], maxStegM: number = SPAR_MIN_STEG_M): XY[] {
  if (p.length < 2 || !(maxStegM > 0)) return p.slice();
  const ut: XY[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const d = dist(p[i - 1], p[i]);
    const n = Math.ceil(d / maxStegM);
    for (let k = 1; k < n; k++) { const t = k / n; ut.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]); }
    ut.push(p[i]);
  }
  return ut;
}

/** 4. Glidande medelvärde över `fonster` punkter (3–5), symmetriskt: fönstret krymper mot ändpunkterna, som aldrig flyttas, och mot LÅSTA punkter
 *  (svängarna) som inte heller flyttas och som medelvärdet aldrig korsar — så ett hörn förblir ett hörn i stället för att rundas av. */
export function glidandeMedel(p: XY[], fonster: number = SPAR_MEDEL_FONSTER, las: ReadonlySet<number> = new Set()): XY[] {
  const h = Math.max(0, Math.floor(fonster / 2));
  const grans = [0, ...[...las].filter((i) => i > 0 && i < p.length - 1).sort((a, b) => a - b), p.length - 1];
  const ut = p.map((x) => [x[0], x[1]] as XY);
  for (let g = 0; g < grans.length - 1; g++) {
    const b0 = grans[g], b1 = grans[g + 1];
    for (let i = b0 + 1; i < b1; i++) {
      const hi = Math.min(h, i - b0, b1 - i);
      let sx = 0, sy = 0;
      for (let k = i - hi; k <= i + hi; k++) { sx += p[k][0]; sy += p[k][1]; }
      const n = 2 * hi + 1;
      ut[i] = [sx / n, sy / n];
    }
  }
  return ut;
}

/** 5. Douglas-Peucker (iterativ) på en delsträcka; ändpunkterna behålls. */
export function douglasPeucker(p: XY[], toleransM: number = SPAR_TOLERANS_M): XY[] {
  if (p.length < 3) return p.slice();
  const behall = new Uint8Array(p.length);
  behall[0] = 1; behall[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1, maxI = -1;
    const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], len = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = len === 0 ? dist(p[i], p[a]) : Math.abs(dy * p[i][0] - dx * p[i][1] + p[b][0] * p[a][1] - p[b][1] * p[a][0]) / len;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > toleransM && maxI > 0) { behall[maxI] = 1; stack.push([a, maxI], [maxI, b]); }
  }
  return p.filter((_, i) => behall[i] === 1);
}

/** Första och sista punkten är ORDAGRANT originalets (projektionen fram och tillbaka ger flyttalsfel ~1e-15 grader) — linjen börjar och slutar där maskinen var. */
function medAndar(ut: Koord[], original: Koord[]): Koord[] {
  if (ut.length < 2) return ut;
  const f = original[0], l = original[original.length - 1];
  ut[0] = [f[0], f[1]]; ut[ut.length - 1] = [l[0], l[1]];
  return ut;
}

/** Hela kedjan på EN linje (ett segment ur hyttsparTillLinjer). Rör aldrig ändpunkterna. Mindre än 3 giltiga punkter → oförändrad. */
export function jamnaSpar(linje: Koord[], val: JamningsVal = {}): Koord[] {
  const giltig = linje.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (giltig.length < 3) return giltig.map((c) => [c[0], c[1]] as Koord);
  const pr = projektion(giltig);
  let p: XY[] = giltig.map(pr.till);
  p = tabortSpikar(p, val.spikStegM, val.spikGranneM);
  p = glesaPunkter(p, val.minStegM);
  if (p.length < 3) return medAndar(p.map(pr.fran), giltig);
  p = tatSteg(p, val.minStegM);
  // svängarna hittas på ett UTJÄMNAT spår (annars räknas GPS-bruset som svängar); sedan körs medelvärdet om från de tätade punkterna med svängarna
  // som lås, så hörnen inte rundas av. Svängarna blir också gränser för Douglas-Peucker → alltid kvar som hörn.
  const svangar = hittaSvangar(glidandeMedel(p, val.medelFonster), val.svangGrader, val.svangBasM);
  p = glidandeMedel(p, val.medelFonster, new Set(svangar));
  const grans = [0, ...svangar, p.length - 1];
  const ut: XY[] = [];
  for (let g = 0; g < grans.length - 1; g++) {
    const del = douglasPeucker(p.slice(grans[g], grans[g + 1] + 1), val.toleransM);
    ut.push(...(g === 0 ? del : del.slice(1)));
  }
  return medAndar(ut.map(pr.fran), giltig);
}

/** Linjerna som RITAS för en hyttspårs-rad: samma rumsliga segmentering som förut (hyttsparTillLinjer), sedan utjämnad. Använd ALDRIG för beräkningar. */
export function hyttsparRitadeLinjer(points: HyttPunkt[]): Koord[][] {
  return hyttsparTillLinjer(points).map((l) => jamnaSpar(l as Koord[]));
}
