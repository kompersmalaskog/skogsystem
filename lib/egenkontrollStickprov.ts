// Egenkontrollens månadsstickprov — ren logik (ingen Supabase, ingen React). Databasen drar (RPC egenkontroll_stickprov, migrationerna
// egenkontroll_stickprov_1…5b); det här är det appen behöver för att VISA dragningen, för att välja kortets objekt, och för att kunna
// RÄKNA OM dragningen utan databasen — det som gör att urvalet går att visa för Vida.
//
// OMRÄKNINGEN (algoritm_version 2), steg för steg. Indata är bara raden: fro + den frusna kandidatlistan (kandidater).
//   1. kandidater = raderna i `kandidater`, sorterade på id (text, stigande, "C"-ordning).
//   2. fro-ordning = kandidaterna sorterade på md5(fro + ':' + id) (hex-text, stigande; lika = id).
//   3. ankare = den FÖRSTA i fro-ordningen som har minst en annan kandidat inom troskel_km fågelväg (båda med koordinat).
//   4. har ingen kandidat en granne: den första i fro-ordningen, dragen ensam. ankare_forsok = antalet kandidater.
//   5. grannar = de närmaste kandidaterna inom troskel_km från ankaret, högst max_antal - 1; avstånd först, id som tiebreak.
//   ankare_forsok = hur många ankare som prövades i fro-ordning (hittat på plats k = k).
// Fågelväg = haversine, R = 6371 km (samma som fagelKm i lib/objektVal). Slumpen är bara `fro`; grannarna följer av geografin.
// Version 1 (md5(fro) mod antal, utan krav på granne) finns inte i prod och räknas inte om här.

import { fagelKm, kmText } from '@/lib/objektVal';

export type StickprovForklaring = 'full' | 'tunn_manad' | 'for_langt' | 'ankare_utan_plats' | 'inga_objekt';

export type StickprovKandidat = {
  id: string;
  namn: string | null;
  typ: string | null;
  lat: number | null;
  lng: number | null;
  avslutat: string;
};

export type StickprovValt = {
  objekt_id: string;
  namn: string | null;
  /** 1 = ankaret. */
  ordning: number;
  km_fran_ankare: number;
};

export type Stickprov = {
  manad: string;
  kalla_manad: string;
  dragen_vid: string;
  fro: string;
  algoritm_version: number;
  troskel_km: number;
  max_antal: number;
  kandidater: StickprovKandidat[];
  ankare_index: number | null;
  ankare_objekt_id: string | null;
  ankare_forsok: number | null;
  valda: StickprovValt[];
  spridning_km: number | null;
  forklaring: StickprovForklaring;
};

const harPlats = (k: { lat: number | null; lng: number | null }): k is { lat: number; lng: number } =>
  typeof k.lat === 'number' && typeof k.lng === 'number' && Number.isFinite(k.lat) && Number.isFinite(k.lng) && !(k.lat === 0 && k.lng === 0);

const kStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type OmraknadDragning = {
  ankareId: string;
  ankareIndex: number;
  ankareForsok: number;
  valda: { objekt_id: string; ordning: number; km_fran_ankare: number }[];
  spridningKm: number | null;
  forklaring: StickprovForklaring;
};

/** Räknar om dragningen ur fro + kandidaterna. `md5` injiceras (Node: crypto.createHash('md5')) — appen själv behöver den aldrig. null = inga kandidater. */
export function raknaOmDragning(
  fro: string,
  kandidater: readonly StickprovKandidat[],
  md5: (s: string) => string,
  troskelKm = 15,
  maxAntal = 3,
): OmraknadDragning | null {
  if (kandidater.length === 0) return null;
  const sorterade = [...kandidater].sort((a, b) => kStr(a.id, b.id));
  const ordnade = sorterade
    .map((k) => ({ k, h: md5(`${fro}:${k.id}`) }))
    .sort((a, b) => kStr(a.h, b.h) || kStr(a.k.id, b.k.id))
    .map((x) => x.k);

  const harGranne = (o: StickprovKandidat) =>
    harPlats(o) && sorterade.some((g) => g.id !== o.id && harPlats(g) && fagelKm(o.lat as number, o.lng as number, g.lat as number, g.lng as number) <= troskelKm);

  let forsok = 0;
  let ankare: StickprovKandidat | null = null;
  for (let i = 0; i < ordnade.length; i++) {
    if (harGranne(ordnade[i])) { ankare = ordnade[i]; forsok = i + 1; break; }
  }
  if (!ankare) { ankare = ordnade[0]; forsok = ordnade.length; }

  const grannar = harPlats(ankare)
    ? sorterade
        .filter((g) => g.id !== ankare!.id && harPlats(g))
        .map((g) => ({ id: g.id, km: fagelKm(ankare!.lat as number, ankare!.lng as number, g.lat as number, g.lng as number) }))
        .filter((g) => g.km <= troskelKm)
        .sort((a, b) => a.km - b.km || kStr(a.id, b.id))
        .slice(0, maxAntal - 1)
    : [];

  const valda = [
    { objekt_id: ankare.id, ordning: 1, km_fran_ankare: 0 },
    ...grannar.map((g, i) => ({ objekt_id: g.id, ordning: i + 2, km_fran_ankare: Math.round(g.km * 100) / 100 })),
  ];

  const valdaK = valda.map((v) => sorterade.find((k) => k.id === v.objekt_id)!).filter(harPlats);
  let spr: number | null = null;
  for (let i = 0; i < valdaK.length; i++) for (let j = i + 1; j < valdaK.length; j++) {
    const d = fagelKm(valdaK[i].lat as number, valdaK[i].lng as number, valdaK[j].lat as number, valdaK[j].lng as number);
    if (spr == null || d > spr) spr = d;
  }

  const forklaring: StickprovForklaring =
    valda.length >= maxAntal ? 'full'
    : !harPlats(ankare) ? 'ankare_utan_plats'
    : valda.length < Math.min(maxAntal, sorterade.length) ? 'for_langt'
    : 'tunn_manad';

  return {
    ankareId: ankare.id,
    ankareIndex: sorterade.findIndex((k) => k.id === ankare!.id),
    ankareForsok: forsok,
    valda,
    spridningKm: spr == null ? null : Math.round(spr * 10) / 10,
    forklaring,
  };
}

/** Stämmer den sparade dragningen med omräkningen? Granskningen: samma ankare, samma valda i samma ordning, samma antal prövade. */
export function stammerDragningen(s: Stickprov, md5: (s: string) => string): boolean {
  const r = raknaOmDragning(s.fro, s.kandidater, md5, s.troskel_km, s.max_antal);
  if (!r) return s.valda.length === 0 && s.ankare_objekt_id == null;
  const sparade = [...s.valda].sort((a, b) => a.ordning - b.ordning).map((v) => v.objekt_id);
  return r.ankareId === s.ankare_objekt_id
    && r.ankareForsok === s.ankare_forsok
    && r.valda.length === sparade.length
    && r.valda.every((v, i) => v.objekt_id === sparade[i]);
}

// ── Texter ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** "3 objekt · 14,8 km mellan de som ligger längst isär" (fågelväg). Ett objekt: bara "1 objekt". Inget dragna: tom. */
export function klusterRad(s: Pick<Stickprov, 'valda' | 'spridning_km'>): string {
  const n = s.valda.length;
  if (n === 0) return '';
  const delar = [`${n} objekt`];
  if (n > 1 && s.spridning_km != null) delar.push(`${kmText(s.spridning_km)} mellan de som ligger längst isär`);
  return delar.join(' · ');
}

/** Varför det inte blev tre. null när det blev tre — då finns inget att förklara. */
export function forklaringText(s: Pick<Stickprov, 'forklaring' | 'kandidater' | 'troskel_km'>): string | null {
  switch (s.forklaring) {
    case 'full': return null;
    case 'tunn_manad': return `Förra månaden avslutades bara ${s.kandidater.length} objekt.`;
    case 'for_langt': return `Resten av förra månadens objekt ligger mer än ${s.troskel_km} km från de dragna.`;
    case 'ankare_utan_plats': return 'Objektet saknar plats på kartan, så närheten gick inte att räkna.';
    case 'inga_objekt': return 'Inga objekt avslutades förra månaden.';
  }
}

const MANADER_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "Dragen 1 nov · förra månaden hade 6 objekt". Dragningstiden i svensk tid. */
export function dragenText(s: Pick<Stickprov, 'dragen_vid' | 'kandidater'>): string {
  const d = new Date(s.dragen_vid);
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'numeric' }).formatToParts(d);
  const dag = f.find((p) => p.type === 'day')?.value ?? '?';
  const man = Number(f.find((p) => p.type === 'month')?.value ?? '0');
  const n = s.kandidater.length;
  return `Dragen ${dag} ${MANADER_KORT[man - 1] ?? ''} · förra månaden hade ${n} objekt`;
}

/** "väntat 71 dagar" / "väntat 1 dag" / "avslutat idag". Kalenderdagar i lokal tid (som dagarSedan i format.ts). */
export function vantatText(iso: string, nu: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'okänt hur länge';
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const dagar = Math.round((b.getTime() - a.getTime()) / 86400000);
  if (dagar <= 0) return 'avslutat idag';
  return `väntat ${dagar} ${dagar === 1 ? 'dag' : 'dagar'}`;
}

// ── Sidans tre kategorier ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type RundStatus = 'ej_startad' | 'pagaende' | 'klar';

/** Det listan behöver av en rad (VantandeRad ur lib/egenkontroll uppfyller det). */
export type ListRad = {
  objekt_id: string;
  avslutat: string;
  rundstatus: RundStatus;
  lat: number | null;
  lng: number | null;
  typ: string | null;
};

export type Kategorier<T extends ListRad> = {
  /** De dragna, i dragningens ordning (ankaret först). Ett dragen objekt ligger ALDRIG även under Påbörjade/Klara — varje objekt på ett ställe. */
  manad: T[];
  /** Dragna som inte är klara. */
  kvar: number;
  /** Pågående rundor på objekt som inte ingår i dragningen. */
  paborjade: T[];
  /** Klara rundor på objekt som inte ingår i dragningen. */
  klara: T[];
  /** Ingen runda ännu, inte dragna: "Starta på ett annat objekt". Längst väntat först. */
  annat: T[];
};

const KONTROLLERBARA = new Set(['gallring', 'slutavverkning']);
/** Bara gallring och slutavverkning har en runda att starta (generateEgenkontroll). */
export const arKontrollerbar = (typ: string | null | undefined) => KONTROLLERBARA.has((typ ?? '').toLowerCase());

export function kategorisera<T extends ListRad>(rader: readonly T[], stickprov: Pick<Stickprov, 'valda'> | null): Kategorier<T> {
  const perId = new Map(rader.map((r) => [r.objekt_id, r] as const));
  const dragna = new Set<string>();
  const manad: T[] = [];
  for (const v of [...(stickprov?.valda ?? [])].sort((a, b) => a.ordning - b.ordning)) {
    const r = perId.get(v.objekt_id);
    if (r) { manad.push(r); dragna.add(r.objekt_id); }
  }
  const aldst = (a: T, b: T) => (a.avslutat < b.avslutat ? -1 : a.avslutat > b.avslutat ? 1 : 0);
  const ovriga = rader.filter((r) => !dragna.has(r.objekt_id));
  return {
    manad,
    kvar: manad.filter((r) => r.rundstatus !== 'klar').length,
    paborjade: ovriga.filter((r) => r.rundstatus === 'pagaende').sort(aldst),
    klara: ovriga.filter((r) => r.rundstatus === 'klar').sort((a, b) => aldst(b, a)),
    annat: ovriga.filter((r) => r.rundstatus === 'ej_startad' && arKontrollerbar(r.typ)).sort(aldst),
  };
}

/**
 * Kortet överst är ett BESLUT: vad ska jag göra nu?
 *   1. en påbörjad DRAGEN runda — färdigställ innan du börjar nytt
 *   2. annars en dragen runda som inte är startad
 *   (i båda: närmast om avståndet är känt, annars den som väntat längst)
 *   3. annars (ingen dragning, eller allt dragit är klart): objektet utan klar runda som väntat längst — påbörjade först, sedan oStartade
 * null = inget att göra.
 */
export function beslutskort<T extends ListRad>(k: Kategorier<T>, avstand: (id: string) => number | null = () => null): T | null {
  const valj = (lista: T[]): T | null => {
    if (lista.length === 0) return null;
    const medAvstand = lista.map((r) => ({ r, km: avstand(r.objekt_id) }));
    if (medAvstand.every((x) => x.km != null)) return [...medAvstand].sort((a, b) => a.km! - b.km! || (a.r.avslutat < b.r.avslutat ? -1 : 1))[0].r;
    return [...lista].sort((a, b) => (a.avslutat < b.avslutat ? -1 : a.avslutat > b.avslutat ? 1 : 0))[0];
  };
  const dragnaPaborjade = k.manad.filter((r) => r.rundstatus === 'pagaende');
  if (dragnaPaborjade.length) return valj(dragnaPaborjade);
  const dragnaEjStartade = k.manad.filter((r) => r.rundstatus === 'ej_startad');
  if (dragnaEjStartade.length) return valj(dragnaEjStartade);
  const aldst = (lista: T[]) => [...lista].sort((a, b) => (a.avslutat < b.avslutat ? -1 : a.avslutat > b.avslutat ? 1 : 0))[0] ?? null;
  return aldst(k.paborjade) ?? aldst(k.annat);
}
