// ANTAL SORTIMENT på en trakt — EN definition, delad av ackordpriset
// (lib/faktura/hamtaUnderlag), ekonomins per-objekt-jämförelse
// (lib/ekonomi/objektJamforelse), Redigeringens auto-värde
// (lib/ekonomi/ackordgrund) och granskningen i faktureringsvyn.
//
// VARFÖR DEN FINNS (utredning mot prod 2026-10-25)
//
// Tillägget är "sex sortiment ingår, 2 kr/m³fub per sortiment därutöver"
// (acord_sortiment_tillagg: grundantal 6, kr_per_extra 2, från 2025-06-03).
// Appen räknade i stället distinkta GRUPPER ur dim_sortiment_grupp — en
// tabell ingen trigger fyller, där 44 av 304 sortiment saknar rad helt och
// 24 har tom grupp. Resultatet: varje klar ackordstrakt landade på exakt 4,
// alltid under grundantalet 6, så tillägget har ALDRIG slagit till på en
// enda trakt sedan juni 2025. Ca 22 400 kr på de elva klara trakterna.
//
// REGELN (Martin 2026-10-25, hans egen räkning på Bågskyttebanan: tall-
// timmer, grantimmer, tallkubb, grankubb, barrmassa, hemved och energi = 7)
//
//   1. Bara sortiment som har VOLYM. Ett sortiment i prislistan som inte
//      kapats är inte ett sortiment på trakten.
//   2. AVKAP räknas inte. Det är spill, inget man apterar mot — på
//      Bågskyttebanan 1,2 och 1,0 m³ mot 980 m³ timmer.
//   3. Stammar UTAN sortiment ("Unclassified") räknas inte.
//   4. Hemved och energived räknas MED. De är sortiment man sorterar ut.
//   5. Identiteten är KUNDKODEN, inte sortiment-id:t. Två skördare på
//      samma trakt ger samma sortiment med var sitt id (dim_sortiment har
//      maskin_id) — räknat per id blev Bågskyttebanan 9 i stället för 7.
//      Samma kundkod = samma sortiment: energived gran och energived
//      övrigt löv delar 539-1 och är ETT.
//   6. KVALITETSKLASS är inte ett eget sortiment (Martin 2026-10-25):
//      "Timmer: Hästveda 195 kv1" och "kv2" är ett sortiment i två
//      klasser — 1 376 m³ mot 4,3 m³ på Brokamåla. De saknar kundkod, så
//      sammanslagningen måste ske på namnet.
//
// ÖPPET, MEDVETET INTE SAMMANSLAGET: LÄNGDKLASS. "Talltimmer: Vislanda"
// (011-VVI) och "Talltimmer: Vislanda kort" (011-VVI-4), "Timmer: Vislanda
// 195" (012-VVI) och "Timmer: Stödlängd" (012-VVI-4) ser ut som samma
// sortiment i två längder, men Martin har inte sagt det. De räknas som två
// tills han gör det. Det slår igenom på EN trakt i dag: Stänkelsmåla, 10
// sortiment i stället för 8 (4 995 kr i stället för 2 497). Båda varianterna
// står i granskningens lista, så det syns.
//
// Funktionen är REN (rader in, räkning ut) och returnerar BÅDA listorna —
// det som räknas och det som inte gör det. Granskningen ska kunna visa
// varför talet blev som det blev utan att räkna om något själv: ett
// sortiment som borde ha räknats syns bara om man ser vad som sorterades
// bort.

/** En rad ur fakt_sortiment berikad med namn och kundkod ur
 *  vy_sortiment_klass (ALDRIG dim_sortiment_grupp — se filens huvud). */
export type SortimentRad = {
  sortiment_id: string;
  namn: string | null;
  kundkod: string | null;
  volym_m3sub: number | null;
};

export type RaknatSortiment = {
  /** Kundkod när den finns, annars det normaliserade namnet. */
  nyckel: string;
  /** Namnet på den största delen — det är det Martin känner igen. */
  namn: string;
  volym: number;
  /** Alla namn som slagits ihop till det här sortimentet, största först.
   *  Fler än ett = kvalitetsklasser eller samma kundkod. */
  delar: string[];
  /** sortiment_id:n raden är byggd av — nyckeln när granskningen slår upp
   *  trädslag per sortiment. Två maskiner ger samma sortiment två id:n. */
  ids: string[];
};

export type EjRaknatSkal = 'avkap' | 'utan_sortiment';

export type EjRaknatSortiment = {
  namn: string;
  volym: number;
  skal: EjRaknatSkal;
};

export type Sortimentsrakning = {
  antal: number;
  raknade: RaknatSortiment[];
  ejRaknade: EjRaknatSortiment[];
};

/** Maskinens namn bär versionssuffix (_V3), kvalitetsklass (kv1/kv2) och
 *  blandade skiljetecken. Normaliseringen används BARA när kundkod saknas. */
export function normaliseraSortimentnamn(namn: string): string {
  return namn
    .toLowerCase()
    .replace(/[_\s]v\d+\b/g, ' ')      // versionssuffix: _V3, " V3"
    .replace(/\bkv\s*\d+\b/g, ' ')     // kvalitetsklass: kv1, kv 2
    .replace(/[_\-:/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function arAvkap(namn: string): boolean {
  return /avkap/i.test(namn);
}

function arUtanSortiment(namn: string): boolean {
  const n = namn.trim().toLowerCase();
  return n === '' || n === 'unclassified' || n === 'utan sortiment';
}

/**
 * Räknar trakten sortiment enligt regeln i filens huvud.
 * Rader utan volym finns inte på trakten och hamnar i ingen av listorna.
 */
export function raknaSortiment(rader: SortimentRad[]): Sortimentsrakning {
  const raknade = new Map<string, RaknatSortiment>();
  const ejRaknade = new Map<string, EjRaknatSortiment>();

  for (const r of rader) {
    const volym = Number(r.volym_m3sub) || 0;
    if (volym <= 0) continue;                      // regel 1

    const namn = (r.namn ?? '').trim() || r.sortiment_id;

    // namn är redan sortiment_id när vy_sortiment_klass saknar rad, så ett
    // tomt namn kan bara betyda att BÅDA saknas — då finns inget att räkna.
    if (arUtanSortiment(namn)) {                                    // regel 3
      lagg(ejRaknade, 'utan_sortiment:' + normaliseraSortimentnamn(namn), namn, volym, 'utan_sortiment');
      continue;
    }
    if (arAvkap(namn)) {                                            // regel 2
      lagg(ejRaknade, 'avkap:' + normaliseraSortimentnamn(namn), namn, volym, 'avkap');
      continue;
    }

    // regel 5 och 6: kundkoden är identiteten, namnet är reserven
    const nyckel = (r.kundkod ?? '').trim() || normaliseraSortimentnamn(namn);
    const fanns = raknade.get(nyckel);
    if (fanns) {
      fanns.volym += volym;
      if (!fanns.delar.includes(namn)) fanns.delar.push(namn);
      if (!fanns.ids.includes(r.sortiment_id)) fanns.ids.push(r.sortiment_id);
    } else {
      raknade.set(nyckel, { nyckel, namn, volym, delar: [namn], ids: [r.sortiment_id] });
    }
  }

  // Visningsnamnet ska vara den största delen, inte den första vi råkade se.
  const volymPerNamn = new Map<string, number>();
  for (const r of rader) {
    const v = Number(r.volym_m3sub) || 0;
    if (v <= 0) continue;
    const n = (r.namn ?? '').trim() || r.sortiment_id;
    volymPerNamn.set(n, (volymPerNamn.get(n) ?? 0) + v);
  }
  for (const s of raknade.values()) {
    s.delar.sort((a, b) => (volymPerNamn.get(b) ?? 0) - (volymPerNamn.get(a) ?? 0));
    s.namn = s.delar[0];
  }

  const storstForst = (a: { volym: number }, b: { volym: number }) => b.volym - a.volym;
  return {
    antal: raknade.size,
    raknade: [...raknade.values()].sort(storstForst),
    ejRaknade: [...ejRaknade.values()].sort(storstForst),
  };
}

function lagg(
  karta: Map<string, EjRaknatSortiment>,
  nyckel: string,
  namn: string,
  volym: number,
  skal: EjRaknatSkal,
): void {
  const fanns = karta.get(nyckel);
  if (fanns) fanns.volym += volym;
  else karta.set(nyckel, { namn, volym, skal });
}
