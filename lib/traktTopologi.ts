// Traktdelar som SITTER IHOP: en gemensam gräns är EN uppsättning hörn som delas av båda delarna (Martin 2026-11-25, Brokamåla: tre delar, dubbla linjer efter "Justera gräns").
//
// Modell: en global hörntabell (`horn`, id → [lng, lat]) och en ring per del som är en lista hörn-id (öppen ring, ingen dubblett-slutpunkt). Ett hörn som två delar
// delar har SAMMA id i båda ringarna — då finns det inget "följ efter" att räkna ut: flyttar man hörnet flyttas båda, lägger man till ett hörn på en gemensam kant
// hamnar det i båda ringarna, tar man bort det försvinner det ur båda. Allt är rena funktioner som returnerar en ny topologi (ångra = en ögonblicksbild).
//
// byggTopologi gör kopplingen EN gång när delarna läggs in: hörn i olika delar som ligger inom `tolM` från varandra blir ett hörn, och ett hörn som ligger på en annan
// dels kant (inom `tolM`) läggs in i den delen — Vidas delar delar kant men har sällan identiska hörn (Brokamåla: 0 hörn på samma plats, men hörn 0,04–0,6 m från grannens kant).
// Två hörn i SAMMA ring slås aldrig ihop. Delar som är `last` (redan justerade för hand) behåller sina hörn exakt och förenklas aldrig.
// Testas i lib/traktTopologi.test.ts (Brokamålas riktiga delar ur prod).

import type { Punkt } from './ringEdit';

export interface TopDel { id: string; ring: number[]; last?: boolean }
export interface Topologi { horn: Record<number, Punkt>; delar: TopDel[]; nasta: number }
export interface IndataDel { id: string; ring: Punkt[]; last?: boolean }

/** Hörn och kanter inom så här många meter räknas som samma. */
export const TOPOLOGI_TOL_M = 1;

type Meter = [number, number];
function meterSystem(punkter: Punkt[]) {
  const lat0 = punkter.length ? punkter[0][1] : 0, lng0 = punkter.length ? punkter[0][0] : 0;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111000;
  return {
    till: (p: Punkt): Meter => [(p[0] - lng0) * kx, (p[1] - lat0) * ky],
    fran: (m: Meter): Punkt => [lng0 + m[0] / kx, lat0 + m[1] / ky],
  };
}
function oppna(ring: Punkt[]): Punkt[] {
  if (ring.length >= 2) { const a = ring[0], b = ring[ring.length - 1]; if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1); }
  return ring.slice();
}
const kopia = (t: Topologi): Topologi => ({ horn: { ...t.horn }, delar: t.delar.map((d) => ({ ...d, ring: d.ring.slice() })), nasta: t.nasta });

/** Läser in delar (öppna eller slutna ringar, [lng, lat]) och kopplar ihop gemensamma hörn och kanter. */
export function byggTopologi(delar: IndataDel[], tolM: number = TOPOLOGI_TOL_M): Topologi {
  const rin = delar.map((d) => ({ id: d.id, last: !!d.last, ring: oppna(d.ring) }));
  const alla = rin.flatMap((d) => d.ring);
  const sys = meterSystem(alla);
  // 1) Ett hörn per (del, index); slå ihop hörn i OLIKA delar som ligger inom tolM (närmaste först, aldrig två hörn i samma del i samma grupp).
  type H = { del: number; i: number; m: Meter; p: Punkt; last: boolean };
  const hs: H[] = [];
  rin.forEach((d, di) => d.ring.forEach((p, i) => hs.push({ del: di, i, m: sys.till(p), p, last: d.last })));
  const foralder = hs.map((_, i) => i);
  const rot = (i: number): number => { while (foralder[i] !== i) { foralder[i] = foralder[foralder[i]]; i = foralder[i]; } return i; };
  const delarIGrupp = new Map<number, Set<number>>();
  hs.forEach((h, i) => delarIGrupp.set(i, new Set([h.del])));
  const par: { a: number; b: number; d: number }[] = [];
  for (let a = 0; a < hs.length; a++) for (let b = a + 1; b < hs.length; b++) {
    if (hs[a].del === hs[b].del) continue;
    const d = Math.hypot(hs[a].m[0] - hs[b].m[0], hs[a].m[1] - hs[b].m[1]);
    if (d <= tolM) par.push({ a, b, d });
  }
  par.sort((x, y) => x.d - y.d);
  for (const { a, b } of par) {
    const ra = rot(a), rb = rot(b);
    if (ra === rb) continue;
    const da = delarIGrupp.get(ra)!, db = delarIGrupp.get(rb)!;
    let krock = false; for (const x of da) if (db.has(x)) { krock = true; break; }
    if (krock) continue;   // skulle ge samma del två gånger i ett hörn
    foralder[rb] = ra; for (const x of db) da.add(x);
  }
  const horn: Record<number, Punkt> = {};
  const idAvRot = new Map<number, number>();
  let nasta = 1;
  const ringId: number[][] = rin.map(() => []);
  hs.forEach((h, i) => {
    const r = rot(i);
    let id = idAvRot.get(r);
    if (id == null) {
      id = nasta++; idAvRot.set(r, id);
      // Gruppens plats: den redan justerade delens hörn exakt (ingen data förloras), annars medelvärdet.
      const medl = hs.filter((_, j) => rot(j) === r);
      const last = medl.find((x) => x.last);
      if (last) horn[id] = [last.p[0], last.p[1]];
      else if (medl.length === 1) horn[id] = [medl[0].p[0], medl[0].p[1]];
      else { const mx = medl.reduce((s, x) => s + x.m[0], 0) / medl.length, my = medl.reduce((s, x) => s + x.m[1], 0) / medl.length; horn[id] = sys.fran([mx, my]); }
    }
    ringId[h.del][h.i] = id;
  });
  let t: Topologi = { horn, delar: rin.map((d, di) => ({ id: d.id, ring: ringId[di], ...(d.last ? { last: true } : {}) })), nasta };
  // 2) Hörn som ligger på en annan dels kant läggs in i den delen.
  t = kopplaHornPaKanter(t, tolM, sys);
  return t;
}

function kopplaHornPaKanter(t: Topologi, tolM: number, sys: ReturnType<typeof meterSystem>): Topologi {
  const ut = kopia(t);
  const m = (id: number) => sys.till(ut.horn[id]);
  // För varje del: samla (kantindex → [{t, hornId}]) och lägg in i stigande t.
  ut.delar.forEach((del, di) => {
    const n = del.ring.length;
    const ins = new Map<number, { t: number; id: number }[]>();
    const finns = new Set(del.ring);
    for (const idStr of Object.keys(ut.horn)) {
      const id = Number(idStr);
      if (finns.has(id)) continue;
      // Bara hörn som någon ANNAN del har (ett hörn tillhör alltid minst en del).
      const p = m(id);
      let bast: { k: number; t: number; d: number } | null = null;
      for (let k = 0; k < n; k++) {
        const a = m(del.ring[k]), b = m(del.ring[(k + 1) % n]);
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        if (l2 === 0) continue;
        const tt = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
        if (tt <= 0 || tt >= 1) continue;   // bara strikt inne på kanten (ändarna är redan hörn)
        const d = Math.hypot(p[0] - (a[0] + tt * dx), p[1] - (a[1] + tt * dy));
        if (d <= tolM && (!bast || d < bast.d)) bast = { k, t: tt, d };
      }
      if (bast) { const lista = ins.get(bast.k) || []; lista.push({ t: bast.t, id }); ins.set(bast.k, lista); }
    }
    if (ins.size === 0) return;
    const ny: number[] = [];
    for (let k = 0; k < n; k++) {
      ny.push(del.ring[k]);
      const lista = ins.get(k);
      if (lista) lista.sort((x, y) => x.t - y.t).forEach((x) => ny.push(x.id));
    }
    ut.delar[di] = { ...del, ring: ny };
  });
  return ut;
}

/** Delarnas ringar som koordinater (öppna, [lng, lat]). */
export function ringar(t: Topologi): { id: string; ring: Punkt[]; last?: boolean }[] {
  return t.delar.map((d) => ({ id: d.id, ring: d.ring.map((h) => [t.horn[h][0], t.horn[h][1]] as Punkt), ...(d.last ? { last: true } : {}) }));
}

/** Alla unika hörn (ett gemensamt hörn EN gång). */
export function unikaHorn(t: Topologi): { id: number; pt: Punkt }[] {
  const anvanda = new Set<number>();
  for (const d of t.delar) for (const h of d.ring) anvanda.add(h);
  return [...anvanda].sort((a, b) => a - b).map((id) => ({ id, pt: t.horn[id] }));
}

/** Hur många delar som delar ett hörn. */
export function delarMedHorn(t: Topologi, hornId: number): number {
  return t.delar.filter((d) => d.ring.includes(hornId)).length;
}

/** Alla unika kanter (en gemensam kant EN gång) med mittpunkt. Id = "a-b" med minsta hörn-id först. */
export function unikaKanter(t: Topologi): { id: string; a: number; b: number; pt: Punkt }[] {
  const sedda = new Set<string>();
  const ut: { id: string; a: number; b: number; pt: Punkt }[] = [];
  for (const d of t.delar) {
    const n = d.ring.length;
    for (let k = 0; k < n; k++) {
      const a = d.ring[k], b = d.ring[(k + 1) % n];
      const id = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (sedda.has(id)) continue;
      sedda.add(id);
      const pa = t.horn[a], pb = t.horn[b];
      ut.push({ id, a: Math.min(a, b), b: Math.max(a, b), pt: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2] });
    }
  }
  return ut;
}

/** Flytta ett hörn — i alla delar som har det. */
export function flyttaHorn(t: Topologi, hornId: number, pt: Punkt): Topologi {
  if (!t.horn[hornId]) return t;
  return { ...t, horn: { ...t.horn, [hornId]: [pt[0], pt[1]] } };
}

/** Lägg till ett hörn på kanten `kantId` (vid kantens mitt, eller `pt`) — i varje del som har kanten. Returnerar nya hörnets id. */
export function laggTillHorn(t: Topologi, kantId: string, pt?: Punkt): { t: Topologi; id: number } | null {
  const kant = unikaKanter(t).find((k) => k.id === kantId);
  if (!kant) return null;
  const id = t.nasta;
  const ny = kopia(t);
  ny.nasta = id + 1;
  ny.horn[id] = pt ? [pt[0], pt[1]] : [kant.pt[0], kant.pt[1]];
  ny.delar = ny.delar.map((d) => {
    const n = d.ring.length;
    for (let k = 0; k < n; k++) {
      const a = d.ring[k], b = d.ring[(k + 1) % n];
      if (a === kant.a && b === kant.b) { const r = d.ring.slice(); r.splice(k + 1, 0, id); return { ...d, ring: r }; }
      if (a === kant.b && b === kant.a) { const r = d.ring.slice(); r.splice(k + 1, 0, id); return { ...d, ring: r }; }
    }
    return d;
  });
  return { t: ny, id };
}

/** Ta bort ett hörn ur alla delar som har det. En yta behöver minst tre hörn: har någon del bara tre vägras borttagningen (oförändrad topologi). */
export function taBortHorn(t: Topologi, hornId: number): Topologi {
  const berorda = t.delar.filter((d) => d.ring.includes(hornId));
  if (berorda.length === 0 || berorda.some((d) => d.ring.length <= 3)) return t;
  const ny = kopia(t);
  ny.delar = ny.delar.map((d) => (d.ring.includes(hornId) ? { ...d, ring: d.ring.filter((h) => h !== hornId) } : d));
  delete ny.horn[hornId];
  return ny;
}

export function antalHorn(t: Topologi): number { return unikaHorn(t).length; }

// ── Förenkling med gemensamma hörn bevarade ──────────────────────────────────────────────────────────────────────────────

export interface Forenkling { t: Topologi; fore: number; efter: number }

/**
 * Douglas–Peucker i meter, men över gränsernas BÅGAR i stället för över varje ring för sig: en båge är hörnen mellan två "knutar" (där vilka delar som delar hörnet
 * ändras, eller hörn i en redan justerad del). En gemensam båge förenklas EN gång och båda delarna får samma resultat — annars glider delarna isär. Knutar tas aldrig bort,
 * redan justerade delar (`last`) rörs inte, och ingen del går under `minHorn` hörn (de viktigaste behålls).
 */
export function forenkla(t: Topologi, toleransM: number = 2, minHorn: number = 4): Forenkling {
  const fore = antalHorn(t);
  const alla = unikaHorn(t).map((h) => h.pt);
  const sys = meterSystem(alla);
  const mp = (id: number) => sys.till(t.horn[id]);
  // Vilka delar har hörnet? (sorterat id-set som text)
  const med = new Map<number, string>();
  const delIdx = new Map<number, number[]>();
  t.delar.forEach((d, di) => d.ring.forEach((h) => { delIdx.set(h, [...(delIdx.get(h) || []), di]); }));
  delIdx.forEach((v, h) => med.set(h, v.join(',')));
  const lasta = new Set<number>();
  t.delar.forEach((d) => { if (d.last) d.ring.forEach((h) => lasta.add(h)); });

  const vikt = new Map<number, number>();           // hörn → viktighet (avvikelse när det valdes som delpunkt)
  const knut = new Set<number>();                   // knutar (och redan justerade hörn): tas aldrig bort, vad någon annan del än tycker
  const klara = new Set<string>();
  const avstand = (p: Meter, a: Meter, b: Meter) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
  };
  const dp = (ids: number[], lo: number, hi: number, tak: number) => {
    let k = -1, bd = -1;
    for (let q = lo + 1; q < hi; q++) { const d = avstand(mp(ids[q]), mp(ids[lo]), mp(ids[hi])); if (d > bd) { bd = d; k = q; } }
    if (k < 0) return;
    const v = Math.min(bd, tak);
    vikt.set(ids[k], v);
    dp(ids, lo, k, v); dp(ids, k, hi, v);
  };

  for (const d of t.delar) {
    const n = d.ring.length;
    if (n <= 3) { d.ring.forEach((h) => knut.add(h)); continue; }
    let knutar: number[] = [];   // index i ringen
    for (let i = 0; i < n; i++) {
      const h = d.ring[i], fr = d.ring[(i + n - 1) % n], ef = d.ring[(i + 1) % n];
      if (lasta.has(h) || med.get(h) !== med.get(fr) || med.get(h) !== med.get(ef)) knutar.push(i);
    }
    if (knutar.length < 2) {
      // Ingen (eller en) knut: dela vid minsta hörn-id och punkten längst från det — samma val i varje del som delar hörnen.
      let a = 0; for (let i = 1; i < n; i++) if (d.ring[i] < d.ring[a]) a = i;
      let b = -1, bd = -1; for (let i = 0; i < n; i++) { if (i === a) continue; const dd = Math.hypot(mp(d.ring[i])[0] - mp(d.ring[a])[0], mp(d.ring[i])[1] - mp(d.ring[a])[1]); if (dd > bd) { bd = dd; b = i; } }
      knutar = [...new Set([...knutar, a, b])].sort((x, y) => x - y);
    }
    for (const i of knutar) knut.add(d.ring[i]);
    for (let s = 0; s < knutar.length; s++) {
      const fran = knutar[s], till = knutar[(s + 1) % knutar.length];
      const ids: number[] = [];
      for (let i = fran; ; i = (i + 1) % n) { ids.push(d.ring[i]); if (i === till && ids.length > 1) break; if (ids.length > n + 1) break; }
      if (ids.length < 3) continue;
      // Kanonisk riktning: samma sekvens oavsett vilken del som går den.
      const kanon = ids[0] <= ids[ids.length - 1] ? ids : ids.slice().reverse();
      const nyckel = kanon.join(',');
      if (klara.has(nyckel)) continue;
      klara.add(nyckel);
      dp(kanon, 0, kanon.length - 1, Infinity);
    }
  }

  const behall = new Set<number>();
  for (const h of Object.keys(t.horn).map(Number)) { const v = vikt.get(h); if (knut.has(h) || v === undefined || v > toleransM) behall.add(h); }
  // Ingen del under minHorn: lägg tillbaka de viktigaste borttagna hörnen.
  for (const d of t.delar) {
    const mal = Math.min(minHorn, d.ring.length);
    const kvar = d.ring.filter((h) => behall.has(h));
    if (kvar.length >= mal) continue;
    const bort = d.ring.filter((h) => !behall.has(h)).sort((a, b) => ((vikt.get(b) ?? 0) - (vikt.get(a) ?? 0)) || a - b);
    for (const h of bort.slice(0, mal - kvar.length)) behall.add(h);
  }
  const ny = kopia(t);
  ny.delar = ny.delar.map((d) => ({ ...d, ring: d.ring.filter((h) => behall.has(h)) }));
  for (const h of Object.keys(ny.horn).map(Number)) if (!behall.has(h)) delete ny.horn[h];
  return { t: ny, fore, efter: antalHorn(ny) };
}

/**
 * Hela "Justera gräns": lägger in delarna (redan justerade delar som `last`), kopplar ihop gemensamma hörn, förenklar och kopplar ihop en gång till — en förenklad kant kan ha kommit inom
 * toleransen från ett hörn i grannen, och det ska redan vara ett gemensamt hörn när delarna sparas (annars lägger redigeringen in det först senare och ringen ändras vid nästa öppning).
 * fore/efter = unika hörn före (efter första kopplingen) och efter förenklingen.
 */
export function justeraDelar(delar: IndataDel[], toleransM: number = 2, minHorn: number = 4, tolM: number = TOPOLOGI_TOL_M): Forenkling {
  const f = forenkla(byggTopologi(delar, tolM), toleransM, minHorn);
  const last = new Map(delar.map((d) => [d.id, !!d.last]));
  const t = byggTopologi(ringar(f.t).map((r) => ({ id: r.id, ring: r.ring, last: last.get(r.id) })), tolM);
  return { t, fore: f.fore, efter: antalHorn(t) };
}

// ── Ångra ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const TOP_ANGRA_MAX = 200;
export function skjutInSteg(steg: Topologi[], t: Topologi): Topologi[] {
  const ny = [...steg, kopia(t)];
  return ny.length > TOP_ANGRA_MAX ? ny.slice(ny.length - TOP_ANGRA_MAX) : ny;
}
export function angraSteg(steg: Topologi[]): { t: Topologi | null; steg: Topologi[] } {
  if (steg.length === 0) return { t: null, steg };
  return { t: kopia(steg[steg.length - 1]), steg: steg.slice(0, -1) };
}

/** Delarnas hörn är hela vägen "sitter ihop" när gemensamma hörn har samma plats — kontroll för tester och varningar: antal gemensamma hörn per par av delar. */
export function gemensammaHorn(t: Topologi): { a: string; b: string; antal: number }[] {
  const ut: { a: string; b: string; antal: number }[] = [];
  for (let i = 0; i < t.delar.length; i++) for (let j = i + 1; j < t.delar.length; j++) {
    const sb = new Set(t.delar[j].ring);
    const antal = t.delar[i].ring.filter((h) => sb.has(h)).length;
    if (antal > 0) ut.push({ a: t.delar[i].id, b: t.delar[j].id, antal });
  }
  return ut;
}
