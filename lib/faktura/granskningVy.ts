// GRANSKNINGEN på en trakt: varför blev antalet sortiment så här, och varför
// blev priset så här. All text och alla tal här; arken ritar bara.
//
// VARFÖR DEN FINNS (Martin 2026-10-25: "skriver ut vilka sortiment det är som
// räknas och att man kan få upp prislistan jämte sig så man kan göra en snabb
// check"). Sortimentstillägget är den enda delen av ackordpriset som bygger på
// ett ANTAL appen räknar fram själv — resten kommer ur prislistan eller ur
// mätta tal. Ett antal som ingen kan se går inte att lita på, och det syntes:
// tillägget har aldrig slagit till sedan juni 2025 eftersom räkningen läste en
// trasig tabell (se lib/ekonomi/sortimentAntal).
//
// TVÅ REGLER:
//   1. Summan är summan av det som visas. Prislistans rader går att räkna ihop
//      med miniräknare och landar på kr/m³fub, precis som maskinkorten.
//   2. Ingenting räknas om här. Talen kommer ur underlaget (lib/faktura/
//      hamtaUnderlag) och ur prisraden; vyn formaterar dem.
//
// SORTIMENTENS NAMN ÄR MASKINENS EGNA, lätt städade ("Massa: BmavFall_V3" →
// "Massa BmavFall"). Det är AVSIKTLIGT och skiljer sig från Gallring och
// markägarrapporten, som aldrig visar maskinkoder: där läser en markägare,
// här stämmer Martin av mot Vidas avräkning, som använder exakt de här
// namnen. Gruppordet under namnet ("Massaved", "Timmer") kommer ur
// virkesGrupp — samma härledning som markägarrapporten.

import { virkesGrupp } from '@/lib/markagarrapport/pris';
import type { Granskningsunderlag } from '@/lib/faktura/hamtaUnderlag';
import type { TradslagPerSortiment, TradslagsAndel } from '@/lib/faktura/lasTradslag';
import type { Tillaggspost } from '@/lib/ekonomi/prisPerM3';

const ORD = ['noll', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta',
  'nio', 'tio', 'elva', 'tolv'];
const ORDNING = ['', 'första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte',
  'sjunde', 'åttonde', 'nionde', 'tionde', 'elfte', 'tolfte'];

/** Tal i ord upp till tolv, siffra därefter. Versal när meningen börjar. */
export function ord(n: number, versal = false): string {
  const t = n >= 0 && n < ORD.length ? ORD[n] : String(n);
  return versal ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

const kr2 = (n: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const heltal = (n: number) => Math.round(n).toLocaleString('sv-SE');
const m3 = (n: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli',
  'augusti', 'september', 'oktober', 'november', 'december'];

/** "2025-06-03" → "3 juni 2025". Ogiltigt datum returneras som det är. */
export function datumIOrd(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MANADER[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Maskinens namn, lätt städat: versionssuffix bort och kolon till mellanslag.
 * Ingen omdöpning — se filens huvud.
 */
export function snyggtNamn(namn: string): string {
  return namn
    .replace(/[_\s]V\d+\b/gi, '')
    .replace(/\s*:\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ══════════════════════════ Sortimenten ══════════════════════════ */

export type SortimentRadVy = {
  namn: string;
  /** Gruppordet under namnet ("Massaved"), eller skälet för det som inte räknas. */
  under: string;
  volym: number;
  /**
   * Trädslagen i sortimentet, störst först: "Gran 62 % · Tall 38 %".
   * null = trädslagen är inte lästa (eller gick inte att läsa) — aldrig ett
   * påhittat "Okänt", och aldrig en tom sträng som ser ut som inget virke.
   */
  tradslag: string | null;
};

export type SortimentVy = {
  /** Skärmens enda stora tal — bara siffran; "sortiment" står som enhet under. */
  svar: string;
  /** Vad antalet betyder för priset, i ord. */
  mening: string;
  /** Vad tillägget blir i kronor på den här trakten. null utan ackordspris. */
  pengar: string | null;
  /** Prislistans villkor. null när ingen sats gäller uppslagsdagen. */
  prislistaRad: string | null;
  /** Står bara när någon satt antalet själv. */
  manuelltRad: string | null;
  raknade: SortimentRadVy[];
  ejRaknade: SortimentRadVy[];
};

export type SortimentIndata = {
  g: Granskningsunderlag['sortiment'];
  volym: number;
  /** Sortimentstillägget i kr/m³fub ur prisraden. null = inget ackordspris. */
  sortKr: number | null;
  /**
   * Volym per trädslag och sortiment_id (lib/faktura/lasTradslag). null =
   * inte läst än eller läsningen föll; raderna står då utan trädslag.
   */
  tradslag?: TradslagPerSortiment | null;
};

/**
 * Trädslagen i ETT sortiment, i ord. Andelarna räknas på den volym som HAR
 * trädslag, inte på sortimentets hela volym: stockar utan stam har inget
 * trädslag i datan, och att räkna dem som en nämnare hade gjort alla andelar
 * för låga utan att säga varför. Saknas en bit SÄGS det i stället.
 */
export function tradslagText(
  andelar: TradslagsAndel[] | undefined, sortimentsvolym: number,
): string | null {
  if (!andelar || andelar.length === 0) return null;
  const kand = andelar.reduce((s, a) => s + a.volym, 0);
  if (kand <= 0) return null;
  const delar = heltalTill100(andelar.map(a => a.volym))
    .map((p, i) => `${andelar[i].namn} ${p} %`)
    .filter((_, i) => andelar[i].volym > 0);
  // Under 95 % av sortimentet har känt trädslag → säg det, annars ser en
  // ofullständig uppdelning ut som hela sanningen.
  const tackt = sortimentsvolym > 0 ? kand / sortimentsvolym : 1;
  return tackt < 0.95
    ? `${delar.join(' · ')} · av ${m3(kand)} m³ med känt trädslag`
    : delar.join(' · ');
}

/**
 * Hela procent som summerar till 100 (största resten). Ett sortiment som är
 * 99,6 % gran ska stå som 100 %, inte 99 % + en rad som saknas.
 */
export function heltalTill100(varden: number[]): number[] {
  const summa = varden.reduce((s, v) => s + v, 0);
  if (summa <= 0) return varden.map(() => 0);
  const exakt = varden.map(v => (v / summa) * 100);
  const ned = exakt.map(Math.floor);
  let kvar = 100 - ned.reduce((s, v) => s + v, 0);
  const ordning = exakt
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { i } of ordning) {
    if (kvar <= 0) break;
    ned[i] += 1;
    kvar -= 1;
  }
  return ned;
}

const SKAL: Record<string, string> = {
  avkap: 'Avkap är spill, inget du apterar mot',
  utan_sortiment: 'Maskinen skrev inget sortiment på dem',
};

/** virkesGrupp ger "Massa" och "Energi"; i tal heter de massaved och energived. */
function gruppord(namn: string): string {
  const g = virkesGrupp(namn);
  return g === 'Massa' ? 'Massaved' : g === 'Energi' ? 'Energived' : g;
}

export function byggSortimentVy({ g, volym, sortKr, tradslag }: SortimentIndata): SortimentVy {
  /** Slår ihop trädslagen för alla sortiment_id som raden är byggd av. */
  const artPerRad = (ids: string[]): TradslagsAndel[] | undefined => {
    if (!tradslag) return undefined;
    const per = new Map<string, number>();
    for (const id of ids) {
      for (const a of tradslag[id] ?? []) per.set(a.namn, (per.get(a.namn) ?? 0) + a.volym);
    }
    return per.size
      ? Array.from(per, ([namn, v]) => ({ namn, volym: v })).sort((a, b) => b.volym - a.volym)
      : undefined;
  };

  const antal = g.anvant;
  const grund = g.grundantal;
  const perExtra = g.krPerExtra;

  let mening: string;
  if (grund == null || perExtra == null) {
    mening = 'Ingen sortimentssats gäller den här avräkningsdagen, så antalet '
      + 'påverkar inte priset.';
  } else if (antal > grund) {
    const extra = antal - grund;
    const kr = kr2(extra * perExtra);
    mening = extra === 1
      ? `${ord(grund, true)} ingår i priset. Det ${ORDNING[antal] ?? `${antal}:e`} ger `
        + `${kr2(perExtra)} kronor extra på varje kubik.`
      : `${ord(grund, true)} ingår i priset. De ${ord(extra)} därutöver ger `
        + `${kr} kronor extra på varje kubik.`;
  } else if (antal === grund) {
    mening = `${ord(grund, true)} ingår i priset. Trakten har precis ${ord(grund)}, `
      + 'så det blir inget tillägg.';
  } else {
    mening = `${ord(grund, true)} ingår i priset. Trakten har ${ord(antal)}, `
      + 'så det blir inget tillägg.';
  }

  const pengar = sortKr == null ? null
    : sortKr === 0 ? 'Tillägget är 0 kr på den här trakten.'
    : `${heltal(sortKr * volym)} kr på trakten · tillägget går till skotaren`;

  const prislistaRad = grund == null || perExtra == null ? null
    : [`${ord(grund, true)} ingår`, `${kr2(perExtra)} kr per extra`,
       datumIOrd(g.giltigFran) ? `gäller från ${datumIOrd(g.giltigFran)}` : null]
      .filter(Boolean).join(' · ');

  const manuelltRad = g.manuellt
    ? `Antalet är satt för hand till ${antal}. Appen räknar ${g.rakning.antal}.`
    : null;

  return {
    svar: String(antal),
    mening,
    pengar,
    prislistaRad,
    manuelltRad,
    raknade: g.rakning.raknade.map(s => ({
      namn: snyggtNamn(s.namn),
      under: s.delar.length > 1
        // Två namn som räknas som ett är den enda delen av räkningen som inte
        // syns av sig själv — den SKA stå, annars ser listan ut att sakna en rad.
        ? `${gruppord(s.namn)} · räknas ihop med ${s.delar.slice(1).map(snyggtNamn).join(' och ')}`
        : gruppord(s.namn),
      volym: s.volym,
      tradslag: tradslagText(artPerRad(s.ids), s.volym),
    })),
    ejRaknade: g.rakning.ejRaknade.map(s => ({
      namn: snyggtNamn(s.namn),
      under: SKAL[s.skal] ?? 'Räknas inte',
      volym: s.volym,
      tradslag: null,
    })),
  };
}

/* ══════════════════════════ Prislistan ══════════════════════════ */

export type PrisradVy = {
  etikett: string;
  under: string;
  belopp: number;
  /** true = visas med tecken (+/−). Grundpriset visas utan. */
  tecken: boolean;
};

export type PrisVy = {
  /** Summan per m³fub. null när priset inte gick att slå upp. */
  total: number | null;
  mening: string;
  prisdatumRad: string;
  rader: PrisradVy[];
  skordare: number | null;
  skotare: number | null;
  /** Vem som får vad, i ord. */
  fordelningMening: string;
};

export type PrisIndata = {
  prislista: { medelstam: number; klass: number; total: number; skordare: number; skotare: number } | null;
  tillaggsposter: Tillaggspost[] | null;
  /** Avståndstillägget i kr/m³fub (delar_avstand på skotarraden). */
  avstandKr: number | null;
  volym: number;
  prisdatum: string;
  sortiment: Granskningsunderlag['sortiment'];
};

const MOTTAGARE: Record<Tillaggspost['mottagare'], string> = {
  skordare: 'Hela till skördaren',
  skotare: 'Hela till skotaren',
  delas: 'Delas lika',
};

export function byggPrisVy(i: PrisIndata): PrisVy {
  const rader: PrisradVy[] = [];
  const p = i.prislista;

  if (p) {
    rader.push({
      etikett: `Grundpris, klass ${kr2(p.klass)}`,
      under: `Medelstam ${kr2(p.medelstam)} m³fub per stam`,
      belopp: p.total, tecken: false,
    });
  }

  for (const post of (i.tillaggsposter ?? []).filter(x => x.belopp !== 0)) {
    rader.push({
      etikett: post.etikett === 'Storlek' ? 'Traktstorlek'
        : post.etikett === 'Sortiment' ? `Sortiment, ${i.sortiment.anvant} st`
        : post.etikett,
      under: post.etikett === 'Storlek'
        ? `${m3(i.volym)} m³fub · ${MOTTAGARE.delas.toLowerCase()}`
        : post.etikett === 'Sortiment' && i.sortiment.grundantal != null
          ? `${i.sortiment.grundantal} ingår · ${kr2(i.sortiment.krPerExtra ?? 0)} kr per extra`
          : MOTTAGARE[post.mottagare],
      belopp: post.belopp, tecken: true,
    });
  }

  if (i.avstandKr) {
    rader.push({
      etikett: 'Skotningsavstånd',
      under: 'Räknat ur skotarens körsträcka · hela till skotaren',
      belopp: i.avstandKr, tecken: true,
    });
  }

  const total = p ? rader.reduce((s, r) => s + r.belopp, 0) : null;
  const grund = p ? kr2(p.total) : null;
  const antalTillagg = rader.length - (p ? 1 : 0);

  return {
    total,
    rader,
    mening: p == null
      ? 'Ingen ackordsprislista gäller den här avräkningsdagen, så priset går inte att räkna fram.'
      : antalTillagg === 0
        ? `${grund} kronor är grundpriset. Inga tillägg på den här trakten.`
        : `${grund} kronor är grundpriset. ${ord(antalTillagg, true)} `
          + `${antalTillagg === 1 ? 'tillägg gör' : 'tillägg gör'} resten.`,
    prisdatumRad: `Prislistan som gällde ${datumIOrd(i.prisdatum) ?? i.prisdatum}`,
    skordare: p?.skordare ?? null,
    skotare: p?.skotare ?? null,
    fordelningMening: 'Sortimentet och avståndet går till skotaren, krönt till '
      + 'skördaren. Traktstorleken delas lika.',
  };
}

/* ══════════════════════════ Sätt antalet själv ══════════════════════════ */

export type RattaVy = {
  /** Sortimentstillägget nu och efter ändringen, kr/m³fub. */
  nuKr: number;
  nyKr: number;
  /** Att fakturera nu och efter. null när summan inte går att räkna. */
  nuSumma: number | null;
  nySumma: number | null;
  /** Vad ändringen betyder, i ord. Tom sträng när inget ändras. */
  mening: string;
  /** true när värdet skiljer sig från det som gäller nu. */
  andrat: boolean;
};

export type RattaIndata = {
  g: Granskningsunderlag['sortiment'];
  /** Det nya antalet användaren ställt in. */
  nyttAntal: number;
  /** Sortimentstillägget som gäller nu, kr/m³fub. */
  nuKr: number | null;
  /** Summan som ska faktureras nu. */
  nuSumma: number | null;
  /** Skotarens antal — tillägget går helt dit, så det är multiplikatorn. */
  skotarAntal: number | null;
  skotarPris: number | null;
};

/**
 * Vad ett ändrat antal gör med priset.
 *
 * Tillägget går HELT till skotaren (lib/ekonomi/prisPerM3), så skillnaden på
 * fakturan är exakt Δkr/m³fub × skotarens antal — ingen omräkning av resten
 * behövs, och ingen avrundning kommer emellan. Saknas skotarraden visas ingen
 * summa; ett påhittat tal vore värre än inget.
 */
export function byggRattaVy(i: RattaIndata): RattaVy {
  const grund = i.g.grundantal;
  const perExtra = i.g.krPerExtra;
  const nuKr = i.nuKr ?? 0;
  const nyKr = grund == null || perExtra == null
    ? nuKr
    : Math.max(0, i.nyttAntal - grund) * perExtra;

  const diffKr = Math.round((nyKr - nuKr) * 100) / 100;
  const kanSumma = i.nuSumma != null && i.skotarAntal != null;
  const nySumma = kanSumma ? i.nuSumma! + diffKr * i.skotarAntal! : null;
  const andrat = i.nyttAntal !== i.g.anvant;

  let mening = '';
  if (andrat && diffKr !== 0 && kanSumma) {
    const kronor = Math.abs(nySumma! - i.nuSumma!);
    const nyttSkotarpris = i.skotarPris != null ? i.skotarPris + diffKr : null;
    mening = `${heltal(kronor)} kr ${diffKr < 0 ? 'mindre' : 'mer'}.`
      + (nyttSkotarpris != null && i.skotarPris != null
        ? ` Skotarens pris går från ${kr2(i.skotarPris)} till ${kr2(nyttSkotarpris)} per m³fub.`
        : '');
  } else if (andrat && diffKr === 0) {
    mening = 'Priset ändras inte — båda antalen ligger inom det som ingår.';
  }

  return { nuKr, nyKr, nuSumma: i.nuSumma, nySumma, mening, andrat };
}
