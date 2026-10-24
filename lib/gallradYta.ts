// Den gallrade ytan — var maskinen faktiskt har gallrat, ur stammarnas positioner. Rena funktioner, inga anrop.
//
// Martin 2026-10-22: Vidas traktgräns stämmer inte alltid. Sandåsen gallring 2025 har 28 % av stammarna utanför
// gränsen (en bit som Vida glömt rita in), och ibland är gränsen för stor (en del lämnades, eller gränsen var fel).
// Uppföljningen per hektar ska räknas på marken som gallrades — utan att någon måste rita. Vidas gräns ändras aldrig.
//
// REGLERNA (alla avstånd från en avverkad stams position, som är maskinens position när stammen fälldes):
//  INNANFÖR gränsen räknas allt som gallrat — stickvägar och stickvägsträd också. Det enda som dras bort är en
//    sammanhängande bit där ingen stam fällts inom EJ_GALLRAT_M och som är minst MIN_BIT_HA stor ("inte gallrat").
//    En smal kant längs gränsen eller en glänta mitt i trakten är det inte: en skördare når ~10 m och stickvägarna
//    ligger ~20 m isär, så marken mellan två stråk har alltid en stam inom 20 m.
//  UTANFÖR gränsen räknas marken inom NAR_M från en stam (skördarens räckvidd). Sammanhängande bitar bedöms på formen:
//    få stammar eller liten yta = enstaka träd (barkborre, vägkant); lång och smal (ett enda stråk) = väg in genom ett
//    annat bestånd; annars = gallring utanför gränsen. Bara gallring räknas in i ytan och uttaget per hektar.
//    Väg in och enstaka träd hör till traktens volym, men inte till per hektar.
//  Ett svar från en människa går alltid före appens bedömning (`svar`), och appens bedömning syns alltid.

import type { Punkt } from './avverkadAreal';
import { punktIPolygon } from './skotat';

/** Rastrets ruta i meter. */
export const RUTA_M = 2;
/** Skördarens räckvidd: marken inom så här långt från en fälld stam räknas som körd. */
export const NAR_M = 10;
/** Innanför gränsen: ingen stam inom så här långt = inte gallrat (räckvidd + halva stickvägsavståndet). */
export const EJ_GALLRAT_M = 20;
/** Bitar mindre än så räknas inte (kantremsor, gläntor). */
export const MIN_BIT_HA = 0.1;
/** Utanför: färre stammar eller mindre yta än så = enstaka träd. */
export const ENSTAKA_MAX_STAMMAR = 30;
export const ENSTAKA_MAX_HA = 0.2;
/** Utanför: smalare än så i snitt = ett enda stråk = väg in (ett stråk med 10 m åt varje håll är ~20–25 m brett). */
export const VAG_MAX_BREDD_M = 30;

const JORDRADIE_M = 6371008.8;
const MAX_RUTOR = 3_000_000;

export type StamPos = { id: number | string; lat: number; lng: number; dbhMm: number | null };

export type UtanforKlass = 'gallring' | 'vag' | 'enstaka';
export type UtanforSvar = UtanforKlass | 'inte_hit';
export type EjGallratSvar = 'grans_fel' | 'lamnat' | 'senare';

export const UTANFOR_ORD: Record<UtanforSvar, string> = {
  gallring: 'Gallring vi kört',
  vag: 'Väg in',
  enstaka: 'Enstaka träd',
  inte_hit: 'Hör inte hit',
};
export const EJ_GALLRAT_ORD: Record<EjGallratSvar, string> = {
  grans_fel: 'Gränsen var fel',
  lamnat: 'Lämnat medvetet',
  senare: 'Körs senare',
};

export type UtanforBit = {
  typ: 'utanfor';
  nr: number;
  nyckel: string;
  ha: number;
  stammar: number;
  /** Appens bedömning ur formen. */
  klass: UtanforKlass;
  /** Svar från en människa, om det finns. */
  svar: UtanforSvar | null;
  /** Det som gäller: svaret, annars klassen. */
  galler: UtanforSvar;
  /** Bitens mitt, för en etikett på kartan. */
  mitt: { x: number; y: number };
};

export type EjGallratBit = {
  typ: 'ej_gallrat';
  nr: number;
  nyckel: string;
  ha: number;
  svar: EjGallratSvar | null;
  mitt: { x: number; y: number };
};

/** Rutornas klass för kartan. */
export const RUTA = { ingen: 0, gallrat: 1, utanforGallring: 2, utanforAnnat: 3, ejGallrat: 4 } as const;

export type GallradYta = {
  /** Vidas gräns i hektar, ur rastret (samma rutor som resten, så talen går att räkna ihop). */
  vidaHa: number;
  gallradHa: number;
  gallradM2: number;
  utanfor: UtanforBit[];
  ejGallrat: EjGallratBit[];
  /** Stammar som räknas i uttaget per hektar (innanför + gallring utanför). */
  raknade: Set<StamPos['id']>;
  /** Kartan: rutnätet med en klass per ruta (RUTA), bredd × höjd, rad 0 = norr. */
  karta: {
    bredd: number; hojd: number; rutor: Uint8Array; ringar: { x: number; y: number }[][];
    /** Rutans sida i meter (RUTA_M, större på mycket stora trakter). */
    rutaM: number;
    /** Kartans hörn i grader [minLng, minLat, maxLng, maxLat] — flygfotot hämtas för exakt den rutan. */
    lnglat: [number, number, number, number];
    /** De avverkade stammarna i rutnätets koordinater; `raknas` = räknas per hektar. */
    stammar: { x: number; y: number; raknas: boolean }[];
  };
  /** Är en punkt ([lng, lat]) i den gallrade ytan? För stickvägarna. */
  innehaller: (lng: number, lat: number) => boolean;
  /** Projektion till rutnätets koordinater (i rutor, y nedåt) — för spår som ska klippas. */
  tillRuta: (lng: number, lat: number) => { x: number; y: number };
};

export type GallradYtaIndata = {
  ringar: Punkt[][];
  stammar: StamPos[];
  svarUtanfor?: Record<string, UtanforSvar>;
  svarEjGallrat?: Record<string, EjGallratSvar>;
  /** Leta efter mark innanför gränsen som inte gallrats. Bara när stammarnas positioner täcker uttaget:
   *  detalj_stam har luckor (hela dagar kan saknas), och en lucka får aldrig se ut som ogallrad mark. */
  hittaEjGallrat?: boolean;
};

/** Komponenter (8-grannar) av rutor där `med(i)` är sann. Returnerar en lista med ruta-index per komponent. */
function komponenter(bredd: number, hojd: number, med: (i: number) => boolean): number[][] {
  const sett = new Uint8Array(bredd * hojd);
  const ut: number[][] = [];
  const ko: number[] = [];
  for (let start = 0; start < bredd * hojd; start++) {
    if (sett[start] || !med(start)) continue;
    const komp: number[] = [];
    sett[start] = 1;
    ko.length = 0;
    ko.push(start);
    while (ko.length) {
      const i = ko.pop()!;
      komp.push(i);
      const x = i % bredd;
      const y = (i - x) / bredd;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= hojd) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= bredd || (dx === 0 && dy === 0)) continue;
          const j = ny * bredd + nx;
          if (!sett[j] && med(j)) { sett[j] = 1; ko.push(j); }
        }
      }
    }
    ut.push(komp);
  }
  return ut;
}

/** Medelbredd för en bit: yta / längd, där längden är bitens utsträckning längs sin längsta axel (huvudaxel). */
export function medelbreddM(rutor: { x: number; y: number }[], rutaM: number): number {
  const n = rutor.length;
  if (n < 2) return rutaM;
  let mx = 0, my = 0;
  for (const p of rutor) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of rutor) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - (sxx * syy - sxy * sxy)));
  // En jämnt fylld remsa med längden L har variansen L²/12 längs sin axel.
  const langd = Math.sqrt(12 * l1) * rutaM;
  return (n * rutaM * rutaM) / Math.max(langd, rutaM);
}

function klassa(ha: number, stammar: number, breddM: number): UtanforKlass {
  if (stammar < ENSTAKA_MAX_STAMMAR || ha < ENSTAKA_MAX_HA) return 'enstaka';
  if (breddM < VAG_MAX_BREDD_M) return 'vag';
  return 'gallring';
}

export function beraknaGallradYta(ind: GallradYtaIndata): GallradYta | null {
  const ringarIn = ind.ringar.filter((r) => r.length >= 3);
  if (ringarIn.length === 0) return null;
  const stammar = ind.stammar.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  const alla: Punkt[] = [...ringarIn.flat(), ...stammar.map((s) => [s.lng, s.lat] as Punkt)];
  const rad = Math.PI / 180;
  const lat0 = ringarIn.flat().reduce((s, p) => s + p[1], 0) / ringarIn.flat().length;
  const kx = JORDRADIE_M * Math.cos(lat0 * rad) * rad;
  const ky = JORDRADIE_M * rad;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [lng, lat] of alla) {
    const x = lng * kx, y = lat * ky;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const marg = EJ_GALLRAT_M + RUTA_M * 2;
  minX -= marg; minY -= marg; maxX += marg; maxY += marg;
  let ruta = RUTA_M;
  ruta = Math.max(ruta, Math.sqrt(((maxX - minX) * (maxY - minY)) / MAX_RUTOR));
  const bredd = Math.max(1, Math.ceil((maxX - minX) / ruta));
  const hojd = Math.max(1, Math.ceil((maxY - minY) / ruta));
  // Rutnätet: x österut, y SÖDERUT (rad 0 = norr), så kartan ritas rätt.
  const tillRuta = (lng: number, lat: number) => ({ x: (lng * kx - minX) / ruta, y: (maxY - lat * ky) / ruta });

  const ringar = ringarIn.map((r) => r.map(([lng, lat]) => tillRuta(lng, lat)));
  const ringarArr = ringar.map((r) => r.map((p) => [p.x, p.y]));
  const n = bredd * hojd;

  // Innanför Vidas gräns (rutans mitt).
  const inne = new Uint8Array(n);
  for (let y = 0; y < hojd; y++) {
    for (let x = 0; x < bredd; x++) {
      const pt: [number, number] = [x + 0.5, y + 0.5];
      if (ringarArr.some((r) => punktIPolygon(pt, r))) inne[y * bredd + x] = 1;
    }
  }

  // Avstånd till närmaste stam, i två steg: inom NAR_M och inom EJ_GALLRAT_M. Stämpla en skiva per stam.
  const nara = new Uint8Array(n);
  const inom20 = new Uint8Array(n);
  const stamRuta: number[] = [];
  const r1 = NAR_M / ruta, r2 = EJ_GALLRAT_M / ruta;
  for (const s of stammar) {
    const p = tillRuta(s.lng, s.lat);
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    stamRuta.push(cy * bredd + cx);
    const egenInne = cx >= 0 && cy >= 0 && cx < bredd && cy < hojd && inne[cy * bredd + cx] === 1;
    const R = Math.ceil(r2);
    for (let dy = -R; dy <= R; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= hojd) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= bredd) continue;
        const ddx = x + 0.5 - p.x, ddy = y + 0.5 - p.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > r2 * r2) continue;
        const i = y * bredd + x;
        inom20[i] = 1;
        // Räckvidden utanför gränsen räknas bara från stammar som själva står utanför — en stam precis innanför
        // kanten ska inte göra en remsa utanför till "gallrat".
        if (d2 <= r1 * r1 && !egenInne) nara[i] = 1;
      }
    }
  }

  const haPerRuta = (ruta * ruta) / 10000;
  const minRutor = Math.ceil(MIN_BIT_HA / haPerRuta);
  const rutor = new Uint8Array(n);

  // Innanför: allt är gallrat, utom stora bitar utan stam inom 20 m.
  const ejKomp = ind.hittaEjGallrat === false ? []
    : komponenter(bredd, hojd, (i) => inne[i] === 1 && inom20[i] === 0).filter((k) => k.length >= minRutor);
  const ejSet = new Uint8Array(n);
  for (const k of ejKomp) for (const i of k) ejSet[i] = 1;

  const mitt = (k: number[]) => {
    let sx = 0, sy = 0;
    for (const i of k) { sx += (i % bredd) + 0.5; sy += Math.floor(i / bredd) + 0.5; }
    return { x: sx / k.length, y: sy / k.length };
  };
  const tillLatLng = (p: { x: number; y: number }) => ({ lng: (p.x * ruta + minX) / kx, lat: (maxY - p.y * ruta) / ky });

  // Utanför: marken inom räckvidd från en stam.
  const utKomp = komponenter(bredd, hojd, (i) => inne[i] === 0 && nara[i] === 1);
  const rutaTillKomp = new Int32Array(n).fill(-1);
  utKomp.forEach((k, ki) => { for (const i of k) rutaTillKomp[i] = ki; });
  const stammarPerKomp = utKomp.map(() => [] as StamPos[]);
  const raknade = new Set<StamPos['id']>();
  stammar.forEach((s, si) => {
    const i = stamRuta[si];
    const ki = i >= 0 && i < n ? rutaTillKomp[i] : -1;
    if (ki >= 0) stammarPerKomp[ki].push(s);
    else if (i >= 0 && i < n && inne[i]) raknade.add(s.id);
  });

  const utanfor: UtanforBit[] = [];
  let gallradRutor = 0;
  for (let i = 0; i < n; i++) if (inne[i] && !ejSet[i]) { rutor[i] = RUTA.gallrat; gallradRutor++; }
  for (let i = 0; i < n; i++) if (ejSet[i]) rutor[i] = RUTA.ejGallrat;

  utKomp.forEach((k, ki) => {
    const st = stammarPerKomp[ki];
    if (st.length === 0) return; // marken runt en stam innanför gränsen som når ut över kanten — inget eget
    const ha = k.length * haPerRuta;
    const breddM = medelbreddM(k.map((i) => ({ x: i % bredd, y: Math.floor(i / bredd) })), ruta);
    const klass = klassa(ha, st.length, breddM);
    const nyckel = `u:${st.map((s) => String(s.id)).sort()[0]}`;
    const svar = ind.svarUtanfor?.[nyckel] ?? null;
    const galler: UtanforSvar = svar ?? klass;
    if (galler === 'gallring') {
      for (const s of st) raknade.add(s.id);
      for (const i of k) { rutor[i] = RUTA.utanforGallring; gallradRutor++; }
    } else {
      for (const i of k) rutor[i] = RUTA.utanforAnnat;
    }
    utanfor.push({ typ: 'utanfor', nr: 0, nyckel, ha, stammar: st.length, klass, svar, galler, mitt: mitt(k) });
  });

  const ejGallrat: EjGallratBit[] = ejKomp.map((k) => {
    const m = mitt(k);
    const ll = tillLatLng(m);
    const nyckel = `e:${Math.round(ll.lat / 0.0002)}:${Math.round(ll.lng / 0.0004)}`;
    return { typ: 'ej_gallrat' as const, nr: 0, nyckel, ha: k.length * haPerRuta, svar: ind.svarEjGallrat?.[nyckel] ?? null, mitt: m };
  });

  // Störst först, och numrerade i den ordningen (numret står på kartan).
  utanfor.sort((a, b) => b.ha - a.ha);
  ejGallrat.sort((a, b) => b.ha - a.ha);
  let nr = 1;
  for (const b of utanfor) b.nr = nr++;
  for (const b of ejGallrat) b.nr = nr++;

  let vidaRutor = 0;
  for (let i = 0; i < n; i++) if (inne[i]) vidaRutor++;

  return {
    vidaHa: vidaRutor * haPerRuta,
    gallradHa: gallradRutor * haPerRuta,
    gallradM2: gallradRutor * ruta * ruta,
    utanfor,
    ejGallrat,
    raknade,
    karta: {
      bredd, hojd, rutor, ringar, rutaM: ruta,
      lnglat: [minX / kx, (maxY - hojd * ruta) / ky, (minX + bredd * ruta) / kx, maxY / ky],
      stammar: stammar.map((s) => ({ ...tillRuta(s.lng, s.lat), raknas: raknade.has(s.id) })),
    },
    innehaller: (lng, lat) => {
      const p = tillRuta(lng, lat);
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= bredd || y >= hojd) return false;
      const c = rutor[y * bredd + x];
      return c === RUTA.gallrat || c === RUTA.utanforGallring;
    },
    tillRuta,
  };
}
