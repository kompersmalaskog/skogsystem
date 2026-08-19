// Egenkontroll - generering av planpunkter (PR 1).
//
// Egenkontrollen ar en faltbesiktning EFTER avslutad avverkning. Planeraren gar
// trakten och kontrollerar att det blev som planerat. Checklistan genereras ur
// objektets planering_markeringar: planen AR standarden.
//
// TVA BARANDE PRINCIPER
//
// 1. EN RUNDA PER OBJEKT. Dubbla pagaende rundor forstor dokumentet - halva
//    svaren hamnar i den ena, halva i den andra. Databasen har ett partiellt
//    unikt index (egenkontroll (objekt_id) where status = 'pagaende') och koden
//    nedan fangar unique_violation och returnerar den befintliga rundan. Darfor
//    ar det tatt aven nar tva anrop kommer samtidigt.
//
// 2. SNAPSHOT AR POANGEN. Rubrik, antal och geometri kopieras in i punkten vid
//    genereringen och lever sedan sitt eget liv. Raderas markeringen i
//    planeringsvyn satts markering_id till null (ON DELETE SET NULL) men
//    punkten star kvar med sin text och sin geometri. Kontrollen ska kunna
//    besvaras aven om planen andras under tiden.
//
// Rader skapas EN gang har. Darefter bara UPDATE, aldrig upsert - samma monster
// som updateMarkerDataInDb i app/planering/page.tsx. En UPDATE mot ett borttaget
// id traffar 0 rader och kan omojligt aterskapa nagot.

import type { SupabaseClient } from '@supabase/supabase-js';

// Den delade klienten hamtas LAT (dynamisk import nedan), inte har uppe.
// ./supabase bygger webblasarklienten redan vid import och kraver da
// NEXT_PUBLIC_SUPABASE_*. Skickar anroparen in en egen klient - ett skript,
// ett test, en API-route - ska den har filen inte tvinga fram de variablerna.

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export type EgenkontrollStatus = 'pagaende' | 'klar';
export type ObjektTyp = 'gallring' | 'slutavverkning';

/** Grupperna visas i den har ordningen i faltet. */
export const GRUPPER = [
  'Naturvård',
  'Kulturlämning',
  'Mark och vatten',
  'Väg och avlägg',
] as const;
export type Grupp = (typeof GRUPPER)[number];

/**
 * Maskinuppgifter frusna vid genereringen. null betyder "vi vet inte" - se
 * byggMaskinSnapshot for varfor det skiljer sig fran false.
 */
export type MaskinSnapshot = {
  skordare_band: boolean | null;
  skordare_band_par: string | null;
  skotare_band: boolean | null;
  skotare_band_par: string | null;
  skotare_lastreder_breddat: boolean | null;
  skotare_extra_vagn: boolean | null;
  barighet: string | null;
  terrang: string | null;
  skordare_maskin: string | null;
  skotare_maskin: string | null;
};

export type Egenkontroll = {
  id: string;
  objekt_id: string;
  objekt_typ: ObjektTyp;
  status: EgenkontrollStatus;
  utford_av: string | null;
  startad: string;
  klar: string | null;
  kommentar: string | null;
  vader: unknown | null;
  maskiner: MaskinSnapshot | null;
  skapad: string;
};

export type GenereraResultat = {
  egenkontroll: Egenkontroll;
  /** false = en pagaende runda fanns redan och returnerades oforandrad. */
  nyskapad: boolean;
  /** Antal punkter som skapades nu. 0 nar en befintlig runda returnerades. */
  antalPunkter: number;
};

export type GenereraOptions = {
  /**
   * Klient att kora mot. Utelamnad -> den delade webblasarklienten, och da
   * kravs en inloggad session (se rattighetsnoten nedan). Skript och tester
   * skickar in en egen klient.
   */
  klient?: SupabaseClient;
  /** Skrivs till egenkontroll.utford_av. Utelamnad -> sessionens e-post. */
  utfordAv?: string | null;
};

// ---------------------------------------------------------------------------
// Vilka markeringar blir punkter
// ---------------------------------------------------------------------------
//
// Vitlistor, aldrig en "hoppa over"-lista. En ny markeringstyp i planeringsvyn
// ska hamna UTANFOR kontrollen tills nagon medvetet lagger till den har - inte
// slinka in for att den rakade sakna en rad i en undantagslista.
//
// Notera att wet finns i BADA listorna med olika rubrik. Fem wet-symboler och
// sex wet-zoner betyder samma sak i falt; planeraren har bara ritat dem olika.
// Att kontrollera den ena och inte den andra vore godtyckligt.

type PunktMall = { rubrik: string; grupp: Grupp };

/** data->>'type' pa markeringar med typ='symbol'. */
const SYMBOL_PUNKTER: Record<string, PunktMall> = {
  eternitytree: { rubrik: 'Evighetsträd', grupp: 'Naturvård' },
  highstump: { rubrik: 'Högstubbar', grupp: 'Naturvård' },
  naturecorner: { rubrik: 'Naturvårdsyta', grupp: 'Naturvård' },
  culturemonument: { rubrik: 'Kulturlämning', grupp: 'Kulturlämning' },
  bridge: { rubrik: 'Överfart', grupp: 'Väg och avlägg' },
  corduroy: { rubrik: 'Kavelbro', grupp: 'Väg och avlägg' },
  landing: { rubrik: 'Avlägg', grupp: 'Väg och avlägg' },
  wet: { rubrik: 'Blöt fläck', grupp: 'Mark och vatten' },
};

/** data->>'lineType' pa markeringar med typ='linje'. */
const LINJE_PUNKTER: Record<string, PunktMall> = {
  nature: { rubrik: 'Naturvårdsyta', grupp: 'Naturvård' },
  mainRoad: { rubrik: 'Basväg', grupp: 'Väg och avlägg' },
};

/** data->>'zoneType' pa markeringar med typ='zon'. */
const ZON_PUNKTER: Record<string, PunktMall> = {
  protected: { rubrik: 'Skyddad zon', grupp: 'Naturvård' },
  fornlamning: { rubrik: 'Fornlämning', grupp: 'Kulturlämning' },
  culture: { rubrik: 'Kulturmiljö', grupp: 'Kulturlämning' },
  wet: { rubrik: 'Blöt zon', grupp: 'Mark och vatten' },
};

// ---------------------------------------------------------------------------
// Hjalpare
// ---------------------------------------------------------------------------

type MarkeringRad = {
  id: string;
  marker_id: string;
  typ: string;
  data: Record<string, unknown> | null;
};

/**
 * Tomt = null, tom strang eller '0'. Anvands bara pa band_par: dar ar '0' och
 * '' lika lite en uppgift som null.
 */
function tomtTillNull(varde: unknown): string | null {
  if (varde === null || varde === undefined) return null;
  const text = String(varde).trim();
  if (text === '' || text === '0') return null;
  return text;
}

function taltEllerNull(varde: unknown): number | null {
  if (varde === null || varde === undefined || varde === '') return null;
  const n = Number(varde);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Fryser maskinuppgifterna.
 *
 * BANDREGELN: ar band falskt (eller okant) skrivs null for BADE band och
 * band_par, oavsett vad band_par innehaller. Vi kan idag inte skilja "korde
 * utan band" fran "ingen rorde faltet" - default ar false och tomt. Da ska
 * snapshotten saga att vi inte vet, inte pasta att maskinen gick utan band.
 * Det ar ett kant datafel som ska bevaras som okant, inte tolkas.
 *
 * Ar band sant skrivs bada varden som de star (tomt band_par -> null).
 */
function byggMaskinSnapshot(objekt: Record<string, unknown>): MaskinSnapshot {
  const bandPar = (band: unknown, par: unknown): [boolean | null, string | null] =>
    band === true ? [true, tomtTillNull(par)] : [null, null];

  const [skordareBand, skordareBandPar] = bandPar(
    objekt.skordare_band,
    objekt.skordare_band_par,
  );
  const [skotareBand, skotareBandPar] = bandPar(
    objekt.skotare_band,
    objekt.skotare_band_par,
  );

  return {
    skordare_band: skordareBand,
    skordare_band_par: skordareBandPar,
    skotare_band: skotareBand,
    skotare_band_par: skotareBandPar,
    // Ovriga falt frysas som de star - ingen tolkning.
    skotare_lastreder_breddat: (objekt.skotare_lastreder_breddat as boolean) ?? null,
    skotare_extra_vagn: (objekt.skotare_extra_vagn as boolean) ?? null,
    barighet: (objekt.barighet as string) ?? null,
    terrang: (objekt.terrang as string) ?? null,
    skordare_maskin: (objekt.skordare_maskin as string) ?? null,
    skotare_maskin: (objekt.skotare_maskin as string) ?? null,
  };
}

/** Klassar en markering. null = ska inte bli punkt. */
function klassa(rad: MarkeringRad): { punkt_typ: string; mall: PunktMall } | null {
  const data = rad.data ?? {};
  const slaUpp = (
    tabell: Record<string, PunktMall>,
    nyckel: unknown,
  ): { punkt_typ: string; mall: PunktMall } | null => {
    if (typeof nyckel !== 'string') return null;
    const mall = tabell[nyckel];
    return mall ? { punkt_typ: nyckel, mall } : null;
  };

  // typ satts av getMarkerTyp i planeringsvyn: symbol | linje | zon | pil.
  // Pilar har ingen egen gren och faller igenom till null.
  if (rad.typ === 'symbol') return slaUpp(SYMBOL_PUNKTER, data.type);
  if (rad.typ === 'linje') return slaUpp(LINJE_PUNKTER, data.lineType);
  if (rad.typ === 'zon') return slaUpp(ZON_PUNKTER, data.zoneType);
  return null;
}

/**
 * Geometrin som ska overleva att markeringen raderas.
 *
 * Symboler: x/y. Linjer och zoner: path.
 * ALDRIG risaPath (delstracka som ska risas - en annan sak an markeringens
 * utstrackning) och ALDRIG photoData. Planeringsfoton visas som referens i
 * rundan, men det byggs i PR 2 och de ska inte kopieras hit.
 */
function byggGeometri(rad: MarkeringRad): Record<string, unknown> | null {
  const data = rad.data ?? {};
  if (rad.typ === 'symbol') {
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return null;
    return { x: data.x, y: data.y };
  }
  if (Array.isArray(data.path)) return { path: data.path };
  return null;
}

/**
 * Bygger rubriken och numrerar kollisioner.
 *
 * Identiteten ar huvuddelen (typens ord + eventuellt nummer). Antalet ar en
 * dekoration som hangs pa efterat och ingar INTE i identiteten - annars hade
 * "Evighetsträd, 2 st" statt onumrerad bland sina numrerade syskon och sett ut
 * som nagot annat an ett evighetsträd i ordningen.
 *
 * Finns tva eller fler med samma huvuddel numreras de ALLA i ordning-foljd:
 *   Evighetsträd 1, 1 st / Evighetsträd 2, 1 st / Evighetsträd 3, 2 st
 * Ar huvuddelen ensam star den onumrerad: "Kavelbro".
 */
function satRubriker<T extends { huvuddel: string; antal: number | null }>(
  poster: T[],
): (T & { rubrik: string })[] {
  const antalPerHuvuddel = new Map<string, number>();
  for (const p of poster) {
    antalPerHuvuddel.set(p.huvuddel, (antalPerHuvuddel.get(p.huvuddel) ?? 0) + 1);
  }

  const raknare = new Map<string, number>();
  return poster.map((p) => {
    const suffix = p.antal !== null ? `, ${p.antal} st` : '';
    if ((antalPerHuvuddel.get(p.huvuddel) ?? 0) < 2) {
      return { ...p, rubrik: `${p.huvuddel}${suffix}` };
    }
    const n = (raknare.get(p.huvuddel) ?? 0) + 1;
    raknare.set(p.huvuddel, n);
    return { ...p, rubrik: `${p.huvuddel} ${n}${suffix}` };
  });
}

// ---------------------------------------------------------------------------
// Generering
// ---------------------------------------------------------------------------

/**
 * Skapar - eller returnerar - en pagaende egenkontroll for ett objekt och
 * fyller den med planpunkter ur objektets markeringar.
 *
 * RATTIGHETER: policyn pa egenkontroll-tabellerna ar FOR ALL TO authenticated.
 * Den delade klienten anvander den publika anon-NYCKELN, men ROLLEN kommer ur
 * sessionens JWT - en inloggad planerare far authenticated och slapps igenom.
 * Utan session blir rollen anon, och da returnerar SELECT tomt UTAN fel. Det
 * tomma svaret gar inte att skilja fran "ingen pagaende runda finns", vilket
 * skulle fa oss att forsoka skapa en dubblett. Darfor kravs sessionen explicit
 * nedan: tomt far aldrig betyda tva saker.
 */
export async function generateEgenkontroll(
  objektId: string,
  options: GenereraOptions = {},
): Promise<GenereraResultat> {
  const anvanderDeladKlient = !options.klient;
  const klient = options.klient ?? (await import('./supabase')).supabase;

  let utfordAv = options.utfordAv ?? null;

  if (anvanderDeladKlient) {
    const { data: sessionData } = await klient.auth.getUser();
    if (!sessionData?.user) {
      throw new Error(
        'Egenkontroll kräver inloggning: tabellerna släpper bara in rollen ' +
          'authenticated. Utan session blir läsningen tyst tom och en dubblett ' +
          'skulle kunna skapas.',
      );
    }
    if (utfordAv === null) utfordAv = sessionData.user.email ?? sessionData.user.id;
  }

  // --- 1. Objektet -------------------------------------------------------
  // Kolumnlistan maste vara EN strangliteral - slas den ihop med + kan
  // supabase-js inte harleda radtypen och allt nedan blir GenericStringError.
  const { data: objektRad, error: objektFel } = await klient
    .from('objekt')
    .select('id, namn, typ, skordare_band, skordare_band_par, skotare_band, skotare_band_par, skotare_lastreder_breddat, skotare_extra_vagn, barighet, terrang, skordare_maskin, skotare_maskin')
    .eq('id', objektId)
    .maybeSingle();

  if (objektFel) throw new Error(`Kunde inte läsa objektet: ${objektFel.message}`);
  if (!objektRad) throw new Error(`Objektet finns inte: ${objektId}`);
  const objekt = objektRad as unknown as Record<string, unknown>;

  // objekt_typ har en CHECK pa gallring/slutavverkning. Fanga det har med ett
  // begripligt fel i stallet for att lata databasen kasta 23514.
  const objektTyp = objekt.typ as ObjektTyp;
  if (objektTyp !== 'gallring' && objektTyp !== 'slutavverkning') {
    throw new Error(
      `Objektet har typ "${objekt.typ ?? '(saknas)'}" - egenkontroll stöder ` +
        'bara gallring och slutavverkning.',
    );
  }

  // --- 2. Finns redan en pagaende runda? ---------------------------------
  const befintlig = await hamtaPagaende(klient, objektId);
  if (befintlig) {
    return { egenkontroll: befintlig, nyskapad: false, antalPunkter: 0 };
  }

  // --- 3. Skapa rundan ---------------------------------------------------
  const { data: skapad, error: skapaFel } = await klient
    .from('egenkontroll')
    .insert({
      objekt_id: objektId,
      objekt_typ: objektTyp,
      status: 'pagaende',
      startad: new Date().toISOString(),
      utford_av: utfordAv,
      maskiner: byggMaskinSnapshot(objekt),
    })
    .select()
    .maybeSingle();

  if (skapaFel) {
    // 23505 = unique_violation. Enda unika villkoret som kan falla har ar det
    // partiella indexet egenkontroll_en_pagaende_per_objekt: nagon annan hann
    // skapa rundan mellan var SELECT och var INSERT. Det ar inget fel - det ar
    // precis det indexet ar till for. Las om och returnera deras runda.
    if (skapaFel.code === '23505') {
      const kapplopningsvinnare = await hamtaPagaende(klient, objektId);
      if (kapplopningsvinnare) {
        return { egenkontroll: kapplopningsvinnare, nyskapad: false, antalPunkter: 0 };
      }
    }
    throw new Error(`Kunde inte skapa egenkontrollen: ${skapaFel.message}`);
  }
  if (!skapad) throw new Error('Egenkontrollen skapades men kunde inte läsas tillbaka.');

  // --- 4. Punkterna ------------------------------------------------------
  try {
    const antalPunkter = await skapaPlanpunkter(klient, skapad.id, objektId);
    return { egenkontroll: skapad as Egenkontroll, nyskapad: true, antalPunkter };
  } catch (fel) {
    // Rundan finns men punkterna kom inte in. Lamnar vi den kvar blockerar den
    // tomma rundan varje nytt forsok (det partiella indexet slapper bara in en
    // pagaende per objekt) och planeraren far en tom checklista utan att veta
    // varfor. Stad bort den vi nyss skapade - punkter som hann in foljer med
    // via ON DELETE CASCADE - och lat felet ga vidare.
    await klient.from('egenkontroll').delete().eq('id', skapad.id);
    throw fel;
  }
}

async function hamtaPagaende(
  klient: SupabaseClient,
  objektId: string,
): Promise<Egenkontroll | null> {
  const { data, error } = await klient
    .from('egenkontroll')
    .select('*')
    .eq('objekt_id', objektId)
    .eq('status', 'pagaende')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte läsa befintlig egenkontroll: ${error.message}`);
  return (data as Egenkontroll) ?? null;
}

/** Laser markeringarna, klassar dem och skriver punkterna. Returnerar antalet. */
async function skapaPlanpunkter(
  klient: SupabaseClient,
  egenkontrollId: string,
  objektId: string,
): Promise<number> {
  // .order() kravs for stabil ordning - utan den ar radordningen inte garanterad
  // och ordning/numrering skulle kunna variera mellan tva korningar.
  const { data: markeringar, error } = await klient
    .from('planering_markeringar')
    .select('id, marker_id, typ, data')
    .eq('objekt_id', objektId)
    .order('marker_id', { ascending: true });

  if (error) throw new Error(`Kunde inte läsa markeringarna: ${error.message}`);

  const kandidater = ((markeringar ?? []) as MarkeringRad[]).flatMap((rad) => {
    const klassad = klassa(rad);
    if (!klassad) return []; // utanfor vitlistan - hoppas over tyst
    const nummer = taltEllerNull((rad.data ?? {}).nummer);
    return [
      {
        rad,
        punkt_typ: klassad.punkt_typ,
        grupp: klassad.mall.grupp,
        huvuddel: nummer !== null ? `${klassad.mall.rubrik} ${nummer}` : klassad.mall.rubrik,
        antal: taltEllerNull((rad.data ?? {}).antal),
      },
    ];
  });

  // Sortera fore numrering: ordning, gruppering och lopnumren maste falla ut
  // likadant varje gang. Grupp i faltordning, sedan typ, sedan marker_id.
  kandidater.sort((a, b) => {
    const gruppDiff = GRUPPER.indexOf(a.grupp) - GRUPPER.indexOf(b.grupp);
    if (gruppDiff !== 0) return gruppDiff;
    if (a.punkt_typ !== b.punkt_typ) return a.punkt_typ < b.punkt_typ ? -1 : 1;
    return a.rad.marker_id < b.rad.marker_id ? -1 : a.rad.marker_id > b.rad.marker_id ? 1 : 0;
  });

  const medRubrik = satRubriker(kandidater);
  if (medRubrik.length === 0) return 0;

  const rader = medRubrik.map((p, i) => ({
    egenkontroll_id: egenkontrollId,
    ordning: i + 1,
    del: 'plan',
    kalla: 'markering',
    grupp: p.grupp,
    markering_id: p.rad.id,
    markering_marker_id: p.rad.marker_id,
    punkt_typ: p.punkt_typ,
    rubrik: p.rubrik,
    antal_planerat: p.antal,
    geometri_snapshot: byggGeometri(p.rad),
    status: null, // obesvarad
  }));

  const { error: punktFel } = await klient.from('egenkontroll_punkt').insert(rader);
  if (punktFel) throw new Error(`Kunde inte skapa punkterna: ${punktFel.message}`);

  return rader.length;
}
