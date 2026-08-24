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
import { kartOrigoFranBounds } from './kartkoordinater';
import { lottaProvytor, PROVYTA_RADIE_M, type LatLng } from './provytor';
import { hamtaVader, type Arbetsfonster, type VaderSnapshot } from './egenkontrollvader';

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
  vader: VaderSnapshot | null;
  maskiner: MaskinSnapshot | null;
  skapad: string;
};

export type GenereraResultat = {
  egenkontroll: Egenkontroll;
  /** false = en pagaende runda fanns redan och returnerades oforandrad. */
  nyskapad: boolean;
  /** Antal punkter som skapades nu. 0 nar en befintlig runda returnerades. */
  antalPunkter: number;
  /** Uppdelat pa del. Utforandepunkterna kommer alltid med pa en ny runda. */
  antalPlanpunkter: number;
  antalUtforandepunkter: number;
  antalMatningspunkter: number;
  /** 0 = kunde inte laggas ut (saknad areal, bounds eller traktgrans). */
  antalProvytor: number;
};

export type KlientOptions = {
  /**
   * Klient att kora mot. Utelamnad -> den delade webblasarklienten, och da
   * kravs en inloggad session (se rattighetsnoten vid kravSession). Skript
   * och tester skickar in en egen klient.
   */
  klient?: SupabaseClient;
};

export type GenereraOptions = KlientOptions & {
  /** Skrivs till egenkontroll.utford_av. Utelamnad -> sessionens e-post. */
  utfordAv?: string | null;
};

/**
 * Loser ut klienten och kraver en session nar den delade anvands.
 *
 * RATTIGHETER: policyn pa egenkontroll-tabellerna ar FOR ALL TO authenticated.
 * Den delade klienten anvander den publika anon-NYCKELN, men ROLLEN kommer ur
 * sessionens JWT - en inloggad planerare far authenticated och slapps igenom.
 * Utan session blir rollen anon, och da returnerar SELECT tomt UTAN fel. Ett
 * tomt svar gar da inte att skilja fran "det finns inget att visa": listan
 * skulle se tom ut i stallet for att saga att inloggningen slutat galla, och
 * genereringen skulle tro att ingen runda finns och forsoka skapa en dubblett.
 * Darfor kravs sessionen explicit har. Tomt far aldrig betyda tva saker.
 */
async function kravSession(
  options: KlientOptions,
): Promise<{ klient: SupabaseClient; epost: string | null }> {
  if (options.klient) return { klient: options.klient, epost: null };

  const klient = (await import('./supabase')).supabase;
  const { data } = await klient.auth.getUser();
  if (!data?.user) {
    throw new Error(
      'Du är inte inloggad längre. Logga in igen för att se egenkontrollerna.',
    );
  }
  return { klient, epost: data.user.email ?? data.user.id };
}

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
//
// ATT EN MARKERING BAR KOMMENTAR GOR DEN INTE TILL EN KONTROLLPUNKT. Nitton
// markeringar pa uteslutna typer har kommentar - warning, manualfelling,
// brashpile, pilar, steep, trail, ditch. De ar instruktioner till foraren FORE
// och UNDER avverkningen, inte nagot att kontrollera efterat. Deras text foljer
// darfor inte med, och det ar avsiktligt.

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
  // Vandplats for lastbilen: fysisk infrastruktur pa marken som kan vara
  // sonderkord eller ovaxt efterat - samma familj som landing, bridge och
  // corduroy. Lag utanfor listan i PR 1 av forbiseende, inte av beslut.
  turningpoint: { rubrik: 'Vändplats', grupp: 'Väg och avlägg' },
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
// Del 2: Utforandet
// ---------------------------------------------------------------------------
//
// Fasta punkter som ALLTID foljer med, oavsett hur planeringen ser ut. Pa ett
// tunt planerat objekt ar de hela egenkontrollen - darfor far de aldrig hanga
// pa att det finns markeringar.
//
// Katalogen bor HAR och inte i databasen: underraden ar en fast etikett, inte
// en uppgift om objektet. rubrik snapshottas som vanligt vid genereringen, sa
// en runda behaller sin text aven om katalogen skrivs om senare.

type UtforandeMall = {
  /** Skrivs till punkt_typ. Stabil nyckel - byt aldrig pa en befintlig. */
  slug: string;
  rubrik: string;
  underrad?: string;
};

const UTFORANDE_GEMENSAMMA: UtforandeMall[] = [
  { slug: 'risning_basvag', rubrik: 'Risning av basväg' },
  { slug: 'rishogar', rubrik: 'Rishögar', underrad: 'Placering och åtkomst' },
  { slug: 'korspar', rubrik: 'Körspår' },
  { slug: 'avlagg', rubrik: 'Avlägg' },
  { slug: 'upplagg_avverkning', rubrik: 'Upplägg av avverkningen' },
  { slug: 'stubbhojder', rubrik: 'Stubbhöjder' },
];

const UTFORANDE_GALLRING: UtforandeMall[] = [
  { slug: 'val_av_stammar', rubrik: 'Val av stammar' },
  { slug: 'tradslagsblandning_kvar', rubrik: 'Trädslagsblandning kvar' },
];

const UTFORANDE_SLUTAVVERKNING: UtforandeMall[] = [
  { slug: 'frotrad_eller_skarm', rubrik: 'Fröträd eller skärm' },
  { slug: 'kantzon_mot_vatten', rubrik: 'Kantzon mot vatten' },
  { slug: 'hyggesrester_mot_markberedning', rubrik: 'Hyggesrester mot markberedning' },
];

/** Utforandepunkterna for en avverkningstyp, i den ordning de ska gas. */
export function utforandeKatalog(objektTyp: ObjektTyp): UtforandeMall[] {
  return [
    ...UTFORANDE_GEMENSAMMA,
    ...(objektTyp === 'gallring' ? UTFORANDE_GALLRING : UTFORANDE_SLUTAVVERKNING),
  ];
}

/**
 * Underraden till en utforandepunkt, uppslagen pa punkt_typ.
 *
 * Fast etikett - darfor kod och inte en kolumn. Okand slug ger null i stallet
 * for att kasta: en runda som skapats med en aldre katalog ska fortfarande ga
 * att besvara, bara utan underrad.
 */
export function utforandeUnderrad(punktTyp: string | null): string | null {
  if (!punktTyp) return null;
  const alla = [
    ...UTFORANDE_GEMENSAMMA,
    ...UTFORANDE_GALLRING,
    ...UTFORANDE_SLUTAVVERKNING,
  ];
  return alla.find((m) => m.slug === punktTyp)?.underrad ?? null;
}

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

/** Trimmad text, eller null om det inte star nagot. Tom strang ar ingen uppgift. */
function tomtEllerNull(varde: unknown): string | null {
  if (typeof varde !== 'string') return null;
  const text = varde.trim();
  return text === '' ? null : text;
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
 * Rundan skapas bara nar detta anropas - aldrig av att en vy oppnas.
 * Rattigheter: se kravSession.
 */
export async function generateEgenkontroll(
  objektId: string,
  options: GenereraOptions = {},
): Promise<GenereraResultat> {
  const { klient, epost } = await kravSession(options);
  const utfordAv = options.utfordAv ?? epost;

  // --- 1. Objektet -------------------------------------------------------
  // Kolumnlistan maste vara EN strangliteral - slas den ihop med + kan
  // supabase-js inte harleda radtypen och allt nedan blir GenericStringError.
  const { data: objektRad, error: objektFel } = await klient
    .from('objekt')
    .select('id, namn, typ, areal, vo_nummer, kartbild_bounds, avslutad_timestamp, faktisk_slut, lat, lng, dim_objekt_id, skordare_band, skordare_band_par, skotare_band, skotare_band_par, skotare_lastreder_breddat, skotare_extra_vagn, barighet, terrang, skordare_maskin, skotare_maskin')
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
    return { egenkontroll: befintlig, nyskapad: false, antalPunkter: 0, antalPlanpunkter: 0, antalUtforandepunkter: 0, antalMatningspunkter: 0, antalProvytor: 0 };
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
        return { egenkontroll: kapplopningsvinnare, nyskapad: false, antalPunkter: 0, antalPlanpunkter: 0, antalUtforandepunkter: 0, antalMatningspunkter: 0, antalProvytor: 0 };
      }
    }
    throw new Error(`Kunde inte skapa egenkontrollen: ${skapaFel.message}`);
  }
  if (!skapad) throw new Error('Egenkontrollen skapades men kunde inte läsas tillbaka.');

  // --- 4. Punkterna ------------------------------------------------------
  let antal: { plan: number; utforande: number; matning: number; provytor: number };
  try {
    antal = await skapaPunkter(
      klient, skapad.id, objektId, objektTyp,
      objekt as {
        avslutad_timestamp?: string | null; faktisk_slut?: string | null;
        areal?: number | null; kartbild_bounds?: unknown; vo_nummer?: string | null;
      },
    );
  } catch (fel) {
    // Rundan finns men punkterna kom inte in. Lamnar vi den kvar blockerar den
    // tomma rundan varje nytt forsok (det partiella indexet slapper bara in en
    // pagaende per objekt) och planeraren far en tom checklista utan att veta
    // varfor. Stad bort den vi nyss skapade - punkter som hann in foljer med
    // via ON DELETE CASCADE - och lat felet ga vidare.
    await klient.from('egenkontroll').delete().eq('id', skapad.id);
    throw fel;
  }

  // --- 5. Vadret ---------------------------------------------------------
  // SIST, och medvetet sa. Rundan, punkterna och provytorna finns redan nar
  // vi borjar prata med en extern tjanst - ett langsamt eller trasigt API kan
  // darfor omojligt hindra att en runda startas i skogen. Hela steget ligger
  // dessutom i en egen try: ingenting harifran far na delete-grenen ovan.
  //
  // Snapshotten skrivs ALLTID nar anropet gick att gora, aven nar den bara
  // bar skalet till att vadret saknas. Se lib/egenkontrollvader.ts.
  let medVader: unknown = null;
  try {
    const vader = await hamtaVader(
      objekt.lat as number | null,
      objekt.lng as number | null,
      await hamtaArbetsfonster(klient, objekt.dim_objekt_id as string | null),
    );
    const { data } = await klient
      .from('egenkontroll')
      .update({ vader })
      .eq('id', skapad.id)
      .select()
      .maybeSingle();
    medVader = data;
  } catch {
    // Vadret ar det enda i den har funktionen som far misslyckas tyst.
    // Kolumnen forblir null, och vyn sager da att vadret inte sparades nar
    // rundan startades - vilket ar sant bade for en gammal runda och for en
    // skrivning som inte gick igenom.
  }

  return {
    egenkontroll: (medVader ?? skapad) as Egenkontroll,
    nyskapad: true,
    antalPunkter: antal.plan + antal.utforande + antal.matning,
    antalPlanpunkter: antal.plan,
    antalUtforandepunkter: antal.utforande,
    antalMatningspunkter: antal.matning,
    antalProvytor: antal.provytor,
  };
}

/**
 * Nar trakten skordades och skotades, enligt MASKINDATAN.
 *
 * Kraver dim_objekt_id - nyckeln mot fakta-tabellerna. Den ar satt pa tre
 * objekt totalt, sa de allra flesta rundor far tillbaka bara nullar i dag.
 * Det ar med avsikt: det finns ingen annan arlig kalla. faktisk_slut ar null
 * pa 12 av 13 objekt i listan, faktisk_start bar SKORDENS forsta dag, och
 * avslutad_timestamp ar ett knapptryck. Bara fakt_lass vet nar det skotades.
 *
 * Skord = fakt_produktion (skordaren), skotning = fakt_lass (skotaren). De
 * lases var for sig, aldrig joinade - se CLAUDE.md.
 */
async function hamtaArbetsfonster(
  klient: SupabaseClient,
  dimObjektId: string | null,
): Promise<Arbetsfonster> {
  const inget: Arbetsfonster = {
    skord_start: null, skord_slut: null, skot_start: null, skot_slut: null,
  };
  if (!dimObjektId) return inget;

  // .order() kravs - utan ORDER BY ar .limit(1) inte "forsta datumet" utan
  // "nagon rad". Samma fallgrop som paginering utan sortering.
  const kant = async (tabell: string, stigande: boolean): Promise<string | null> => {
    const { data, error } = await klient
      .from(tabell)
      .select('datum')
      .eq('objekt_id', dimObjektId)
      .order('datum', { ascending: stigande })
      .limit(1);
    if (error) throw new Error(`Kunde inte läsa ${tabell}: ${error.message}`);
    const rad = (data ?? [])[0] as { datum?: string } | undefined;
    return rad?.datum ?? null;
  };

  const [skordStart, skordSlut, skotStart, skotSlut] = await Promise.all([
    kant('fakt_produktion', true),
    kant('fakt_produktion', false),
    kant('fakt_lass', true),
    kant('fakt_lass', false),
  ]);

  return {
    skord_start: skordStart, skord_slut: skordSlut,
    skot_start: skotStart, skot_slut: skotSlut,
  };
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

/** Laser markeringarna, klassar dem och bygger planraderna. Skriver inget. */
async function byggPlanrader(klient: SupabaseClient, objektId: string) {
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

  return medRubrik.map((p) => ({
    del: 'plan',
    kalla: 'markering',
    grupp: p.grupp,
    markering_id: p.rad.id,
    markering_marker_id: p.rad.marker_id,
    punkt_typ: p.punkt_typ,
    rubrik: p.rubrik,
    antal_planerat: p.antal,
    geometri_snapshot: byggGeometri(p.rad),
    // Planerarens egen text om vad som ska kontrolleras. SNAPSHOTTAS, las
    // aldrig live - punkten ska overleva att markeringen raderas, precis som
    // rubriken. Tom strang ar ingen kommentar.
    plan_kommentar: tomtEllerNull((p.rad.data ?? {}).comment),
    status: null, // obesvarad
  }));
}

/**
 * Utforandepunkterna. Ligger ALLTID med - de hanger inte pa planeringen.
 *
 * grupp = null: skiljelinjen mot planpunkterna gar vid `del`, inte vid grupp.
 * En gruppsträng har hade latsats vara i samma serie som Naturvard och
 * Kulturlamning, vilket den inte ar.
 */
function byggUtforanderader(objektTyp: ObjektTyp) {
  return utforandeKatalog(objektTyp).map((mall) => ({
    del: 'utforande',
    kalla: 'fast',
    grupp: null,
    markering_id: null,
    markering_marker_id: null,
    punkt_typ: mall.slug,
    rubrik: mall.rubrik,
    antal_planerat: null,
    geometri_snapshot: null,
    plan_kommentar: null,
    status: null,
  }));
}

// ---------------------------------------------------------------------------
// Del 3: Matningar
// ---------------------------------------------------------------------------

/** Godkand tackningsgrad pa stubbehandling. Skrivs ut i vyn - inget att minnas. */
export const KRAVNIVA_STUBBEHANDLING = 85;

/** Behandlingssasong: maj till och med september. */
const STUBBE_MANAD_FRAN = 5;
const STUBBE_MANAD_TILL = 9;

/**
 * Ska objektet fa stubbehandlingspunkten?
 *
 * SASONGSVILLKORET AR BYGGT. Stubbehandling mot rotrota kravs under
 * behandlingssasong; avslutas trakten utanfor maj-september skapas punkten
 * inte alls.
 *
 * TRADSLAGSVILLKORET AR AVSIKTLIGT UTELAMNAT - INTE GLOMT. Kravet galler gran
 * och tall, men tradslag ligger i hpr_stammar och nas via dim_objekt_id, som ar
 * NULL pa SAMTLIGA objekt i egenkontroll-listan (verifierat 2026-08-21, 12 av
 * 12). Ett villkor som inte gar att utvardera far inte byggas som om det gick -
 * da hade punkten tyst uteblivit pa alla objekt. Lagg till det HAR nar
 * dim_objekt_id ar ifylld.
 */
export function harStubbehandling(objekt: {
  avslutad_timestamp?: string | null;
  faktisk_slut?: string | null;
}): boolean {
  const iso = objekt.avslutad_timestamp ?? objekt.faktisk_slut;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const manad = d.getMonth() + 1;
  return manad >= STUBBE_MANAD_FRAN && manad <= STUBBE_MANAD_TILL;
}

/** Matningspunkterna. I dag bara stubbehandling; provytor kommer senare. */
function byggMatningsrader(objekt: {
  avslutad_timestamp?: string | null;
  faktisk_slut?: string | null;
}) {
  if (!harStubbehandling(objekt)) return [];
  return [{
    del: 'matning',
    kalla: 'fast',
    grupp: null,
    markering_id: null,
    markering_marker_id: null,
    punkt_typ: 'stubbehandling',
    rubrik: 'Stubbehandling',
    antal_planerat: null,
    geometri_snapshot: null,
    plan_kommentar: null,
    status: null,
  }];
}

/**
 * Skriver bada delarna i EN insert med lopande ordning.
 *
 * Gemensam numrering kravs av unique (egenkontroll_id, ordning), och en enda
 * insert gor att en runda aldrig kan bli halvfylld - antingen far den alla
 * sina punkter eller ingen alls.
 */
async function skapaPunkter(
  klient: SupabaseClient,
  egenkontrollId: string,
  objektId: string,
  objektTyp: ObjektTyp,
  objekt: {
    avslutad_timestamp?: string | null; faktisk_slut?: string | null;
    areal?: number | null; kartbild_bounds?: unknown; vo_nummer?: string | null;
  },
): Promise<{ plan: number; utforande: number; matning: number; provytor: number }> {
  const planrader = await byggPlanrader(klient, objektId);
  const utforanderader = byggUtforanderader(objektTyp);
  const matningsrader = byggMatningsrader(objekt);

  const rader = [...planrader, ...utforanderader, ...matningsrader].map((r, i) => ({
    ...r,
    egenkontroll_id: egenkontrollId,
    ordning: i + 1,
  }));
  const provytor = await skapaProvytor(klient, egenkontrollId, objektId, objektTyp, objekt);
  if (rader.length === 0) return { plan: 0, utforande: 0, matning: 0, provytor };

  const { error } = await klient.from('egenkontroll_punkt').insert(rader);
  if (error) throw new Error(`Kunde inte skapa punkterna: ${error.message}`);

  return {
    plan: planrader.length,
    utforande: utforanderader.length,
    matning: matningsrader.length,
    provytor,
  };
}

// ---------------------------------------------------------------------------
// Lasning for vyerna
// ---------------------------------------------------------------------------

// Svarsalternativen per del. Speglar databasens CHECK status_hor_till_del.
//
// UTFORANDET ANVANDER ALDRIG 'avvikelse'. "Kan bli battre" ar inte ett brott
// mot nagot - ingen har gjort fel. Blandas de ihop far vi "Godkant" pa allt,
// och da ar verktyget dott. Avvikelse hor bara till Del 1, mot planen.
/** Tillatna svar pa en planpunkt. CHECK: del='plan' -> ok/avvikelse. */
export type PlanStatus = 'ok' | 'avvikelse';
/** Tillatna svar pa en utforandepunkt. CHECK: del='utforande'. */
export type UtforandeStatus = 'bra' | 'godkant' | 'battre';
export type PunktDel = 'plan' | 'utforande';
export type PunktStatus = PlanStatus | UtforandeStatus;

const TILLATNA_SVAR: Record<PunktDel, readonly string[]> = {
  plan: ['ok', 'avvikelse'],
  utforande: ['bra', 'godkant', 'battre'],
};

export type EgenkontrollPunkt = {
  id: string;
  egenkontroll_id: string;
  ordning: number;
  del: string;
  grupp: string | null;
  kalla: string;
  markering_id: string | null;
  markering_marker_id: string | null;
  punkt_typ: string | null;
  rubrik: string;
  antal_planerat: number | null;
  geometri_snapshot: Record<string, unknown> | null;
  /** Snapshot av planerarens comment pa markeringen. Skilj fran kommentar. */
  plan_kommentar: string | null;
  status: string | null;
  avvikelse_typ: string | null;
  kommentar: string | null;
  /** Fargsegmenteringens forslag. Lamnas NULL - se sparaStubbe. */
  varde_foreslaget: number | null;
  /** Sammanfattning av matningen, t.ex. medeltackningsgrad. Inte kallan. */
  varde_bekraftat: number | null;
  /** Positionen dar avvikelsen registrerades. Kvitto, aldrig inmatning. */
  lat: number | null;
  lng: number | null;
  besvarad: string | null;
};

export type RundStatus = 'ej_startad' | 'pagaende' | 'klar';

export type VantandeRad = {
  objekt_id: string;
  namn: string;
  /** Kant avslutsdatum (ISO). Objekt utan datum kommer aldrig hit - se hamtaVantande. */
  avslutat: string;
  rundstatus: RundStatus;
  egenkontroll_id: string | null;
  antalPunkter: number;
  antalBesvarade: number;
  antalAvvikelser: number;
  /** "kan bli battre" pa utforandepunkter - ingen avvikelse, men en anmarkning. */
  antalBattre: number;
  klarDatum: string | null;
};

export type VantandeOversikt = {
  /** Vantande forst (aldst overst), darefter klara. */
  rader: VantandeRad[];
  /** Antalet som faktiskt vantar - badgens och rubrikens siffra. */
  antalVantande: number;
  /**
   * Avslutade objekt UTAN kant avslutsdatum. De listas inte och raknas inte,
   * men antalet returneras sa att listan kan saga varfor de saknas i stallet
   * for att tyst utelamna dem.
   */
  antalUtanDatum: number;
};

/** Foredrar en pagaende runda, annars den senast startade. */
function valjRunda(rundor: Egenkontroll[]): Egenkontroll | null {
  const pagaende = rundor.find((r) => r.status === 'pagaende');
  if (pagaende) return pagaende;
  const sorterade = [...rundor].sort((a, b) => (a.startad < b.startad ? 1 : -1));
  return sorterade[0] ?? null;
}

/**
 * Objekt som vantar pa egenkontroll.
 *
 * Vantande = status 'avslutat' OCH kant avslutsdatum, utan en runda som ar
 * 'klar'. En pagaende runda raknas som vantande.
 *
 * Objekt UTAN avslutsdatum listas inte: avslutad_timestamp ar ett nytt falt
 * och de datumlosa ar historik fran innan rutinen fanns. En siffra som raknar
 * med dem blir brus i stallet for en utlosare. De nas fortfarande fran
 * objektet, och antalet returneras sa att listan kan saga att de finns.
 */
export async function hamtaVantande(
  options: KlientOptions = {},
): Promise<VantandeOversikt> {
  const { klient } = await kravSession(options);

  const { data: objektRader, error: objektFel } = await klient
    .from('objekt')
    .select('id, namn, avslutad_timestamp, faktisk_slut')
    .eq('status', 'avslutat')
    .order('id', { ascending: true });

  if (objektFel) throw new Error(`Kunde inte läsa objekten: ${objektFel.message}`);

  const alla = (objektRader ?? []) as unknown as {
    id: string;
    namn: string | null;
    avslutad_timestamp: string | null;
    faktisk_slut: string | null;
  }[];

  const medDatum = alla.flatMap((o) => {
    const avslutat = o.avslutad_timestamp ?? o.faktisk_slut;
    return avslutat ? [{ ...o, avslutat }] : [];
  });
  const antalUtanDatum = alla.length - medDatum.length;

  if (medDatum.length === 0) {
    return { rader: [], antalVantande: 0, antalUtanDatum };
  }

  const { data: rundRader, error: rundFel } = await klient
    .from('egenkontroll')
    .select('*')
    .in('objekt_id', medDatum.map((o) => o.id))
    .order('startad', { ascending: false });

  if (rundFel) throw new Error(`Kunde inte läsa egenkontrollerna: ${rundFel.message}`);
  const rundor = (rundRader ?? []) as unknown as Egenkontroll[];

  // Punktraknarna aggregeras i JS - PostgREST har ingen GROUP BY. Volymen ar
  // liten (en runda per objekt, tiotals punkter) sa det kostar ingenting.
  let punkter: { egenkontroll_id: string; status: string | null }[] = [];
  if (rundor.length > 0) {
    const { data: punktRader, error: punktFel } = await klient
      .from('egenkontroll_punkt')
      .select('egenkontroll_id, status')
      .in('egenkontroll_id', rundor.map((r) => r.id))
      .order('id', { ascending: true });
    if (punktFel) throw new Error(`Kunde inte läsa punkterna: ${punktFel.message}`);
    punkter = (punktRader ?? []) as unknown as typeof punkter;
  }

  const rader: VantandeRad[] = medDatum.map((o) => {
    const runda = valjRunda(rundor.filter((r) => r.objekt_id === o.id));
    const egna = runda ? punkter.filter((p) => p.egenkontroll_id === runda.id) : [];
    return {
      objekt_id: o.id,
      namn: o.namn ?? 'Objekt utan namn',
      avslutat: o.avslutat,
      rundstatus: !runda ? 'ej_startad' : runda.status === 'klar' ? 'klar' : 'pagaende',
      egenkontroll_id: runda?.id ?? null,
      antalPunkter: egna.length,
      antalBesvarade: egna.filter((p) => p.status !== null).length,
      antalAvvikelser: egna.filter((p) => p.status === 'avvikelse').length,
      antalBattre: egna.filter((p) => p.status === 'battre').length,
      klarDatum: runda?.klar ?? null,
    };
  });

  // Vantande forst, aldst overst (langst vantetid). Klara sist.
  rader.sort((a, b) => {
    const aKlar = a.rundstatus === 'klar' ? 1 : 0;
    const bKlar = b.rundstatus === 'klar' ? 1 : 0;
    if (aKlar !== bKlar) return aKlar - bKlar;
    return a.avslutat < b.avslutat ? -1 : a.avslutat > b.avslutat ? 1 : 0;
  });

  return {
    rader,
    antalVantande: rader.filter((r) => r.rundstatus !== 'klar').length,
    antalUtanDatum,
  };
}

/** Objektets kartuppgifter. bounds kravs for att placera MARKERINGAR, inte position. */
export type KartObjekt = {
  lat: number | null;
  lng: number | null;
  /** Nyckeln mot HPR-stammarna. Las bara - aldrig dim_objekt_id. */
  vo_nummer: string | null;
  kartbild_url: string | null;
  kartbild_bounds: unknown;
};

export type RundVy = {
  objektNamn: string;
  objektStatus: string | null;
  kartObjekt: KartObjekt;
  /** null = ingen runda startad an. */
  egenkontroll: Egenkontroll | null;
  punkter: EgenkontrollPunkt[];
};

/** Hamtar objektets runda med punkter. Skapar ALDRIG nagot. */
export async function hamtaRunda(
  objektId: string,
  options: KlientOptions = {},
): Promise<RundVy> {
  const { klient } = await kravSession(options);

  const { data: objekt, error: objektFel } = await klient
    .from('objekt')
    .select('id, namn, status, vo_nummer, lat, lng, kartbild_url, kartbild_bounds')
    .eq('id', objektId)
    .maybeSingle();

  if (objektFel) throw new Error(`Kunde inte läsa objektet: ${objektFel.message}`);
  if (!objekt) throw new Error(`Objektet finns inte: ${objektId}`);

  const { data: rundRader, error: rundFel } = await klient
    .from('egenkontroll')
    .select('*')
    .eq('objekt_id', objektId)
    .order('startad', { ascending: false });

  if (rundFel) throw new Error(`Kunde inte läsa egenkontrollen: ${rundFel.message}`);

  const runda = valjRunda((rundRader ?? []) as unknown as Egenkontroll[]);
  const o = objekt as unknown as Record<string, unknown>;
  const bas = {
    objektNamn: (o.namn as string) ?? 'Objekt utan namn',
    objektStatus: (o.status as string) ?? null,
    kartObjekt: {
      lat: (o.lat as number) ?? null,
      lng: (o.lng as number) ?? null,
      vo_nummer: (o.vo_nummer as string) ?? null,
      kartbild_url: (o.kartbild_url as string) ?? null,
      kartbild_bounds: o.kartbild_bounds ?? null,
    },
  };
  if (!runda) return { ...bas, egenkontroll: null, punkter: [] };

  // .order() kravs for stabil ordning - utan ORDER BY ar radordningen inte
  // garanterad och punkterna skulle kunna byta plats mellan laddningar.
  const { data: punktRader, error: punktFel } = await klient
    .from('egenkontroll_punkt')
    .select('*')
    .eq('egenkontroll_id', runda.id)
    .order('ordning', { ascending: true });

  if (punktFel) throw new Error(`Kunde inte läsa punkterna: ${punktFel.message}`);

  return {
    ...bas,
    egenkontroll: runda,
    punkter: (punktRader ?? []) as unknown as EgenkontrollPunkt[],
  };
}

/**
 * Svarar pa en planpunkt.
 *
 * UPDATE-only, aldrig upsert - samma monster som updateMarkerDataInDb. En
 * UPDATE mot ett borttaget id traffar 0 rader och kan omojligt aterskapa en
 * punkt som stadats bort.
 *
 * Svaret las TILLBAKA och jamfors med det som skickades. Att rakna rader
 * racker inte: RLS kan gora en update till en tyst nolltraff, och da ska
 * anroparen fa ett fel i stallet for en knapp som ser ut att ha svarat.
 */
export async function svaraPaPunkt(
  punktId: string,
  status: PunktStatus,
  del: PunktDel,
  options: KlientOptions = {},
): Promise<EgenkontrollPunkt> {
  // Fanga fel statusklass HAR i stallet for att lata databasen kasta 23514.
  // Anroparen sager vilken del svaret galler, och .eq('del', del) nedan gor
  // att en punkt inte kan fa fel klass ens om ett id skulle peka fel.
  if (!TILLATNA_SVAR[del].includes(status)) {
    throw new Error(`"${status}" är inget giltigt svar på en ${del}-punkt.`);
  }

  const { klient } = await kravSession(options);

  // En klar runda ar last. LASET ar databastriggern egenkontroll_punkt_last -
  // den avvisar skrivningen oavsett vad som star har. Kontrollen nedan finns
  // bara for att ge ett begripligt besked i stallet for ett ravt check_violation,
  // och far aldrig forvaxlas med sjalva laset.
  const { data: agare } = await klient
    .from('egenkontroll_punkt')
    .select('egenkontroll:egenkontroll_id (status)')
    .eq('id', punktId)
    .maybeSingle();
  const rundstatus = (agare as { egenkontroll?: { status?: string } } | null)?.egenkontroll?.status;
  if (rundstatus === 'klar') {
    throw new Error('Rundan är avslutad och går inte att ändra.');
  }

  const { data, error } = await klient
    .from('egenkontroll_punkt')
    // avvikelse_typ MASTE nollas nar svaret inte langre ar 'avvikelse' -
    // constraintet avvikelsetyp_kraver_avvikelse tillater typen bara ihop med
    // status='avvikelse', sa bytet avvikelse -> ok hade annars kastat 23514 pa
    // en punkt som redan bar en typ. Angra sig ska alltid ga.
    .update({
      status,
      avvikelse_typ: status === 'avvikelse' ? undefined : null,
      besvarad: new Date().toISOString(),
    })
    .eq('id', punktId)
    .eq('del', del)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte spara svaret: ${error.message}`);
  if (!data) {
    throw new Error('Svaret sparades inte — punkten hittades inte. Ladda om sidan.');
  }
  const sparad = data as unknown as EgenkontrollPunkt;
  if (sparad.status !== status) {
    throw new Error(
      `Svaret sparades inte som väntat (blev "${sparad.status ?? 'tomt'}"). Ladda om sidan.`,
    );
  }
  return sparad;
}

/**
 * Avslutar rundan: status='klar' + klar=now().
 *
 * LASET LIGGER I DATABASEN. Triggern egenkontroll_punkt_last avvisar INSERT
 * och UPDATE pa punkter vars runda ar 'klar'. Kontrollen har uppe finns for
 * att ge ett begripligt besked i stallet for ett ravt databasfel - den ar
 * inte laset och ska inte forvaxlas med det.
 *
 * Alla punkter maste vara besvarade. Antalet som aterstar rapporteras i felet
 * sa anroparen kan saga det rakt ut i stallet for "gick inte".
 *
 * .eq('status','pagaende') gor avslutet idempotent mot dubbeltryck: ett andra
 * anrop traffar 0 rader i stallet for att skriva om klar-tidsstampeln.
 */
export async function avslutaRunda(
  egenkontrollId: string,
  options: KlientOptions = {},
): Promise<Egenkontroll> {
  const { klient } = await kravSession(options);

  // .order() for stabil lasning; vi behover bara status men laser id ocksa
  // sa raknandet inte kan trassla ihop sig med en tom tabell.
  const { data: punktRader, error: punktFel } = await klient
    .from('egenkontroll_punkt')
    .select('id, status')
    .eq('egenkontroll_id', egenkontrollId)
    .order('ordning', { ascending: true });

  if (punktFel) throw new Error(`Kunde inte läsa punkterna: ${punktFel.message}`);

  const punkter = (punktRader ?? []) as unknown as { id: string; status: string | null }[];
  const kvarPunkter = punkter.filter((p) => p.status === null).length;

  // PROVYTORNA RAKNAS MED. En yta ska vara matt ELLER overhoppad-med-skal -
  // annars kan rundan bli klar med noll av sju ytor gjorda, och dokumentet
  // pastar en fullstandighet det inte har.
  const { data: ytor, error: ytFel } = await klient
    .from('egenkontroll_provyta')
    .select('id, matt, overhoppad')
    .eq('egenkontroll_id', egenkontrollId)
    .order('nummer', { ascending: true });
  if (ytFel) throw new Error(`Kunde inte läsa provytorna: ${ytFel.message}`);
  const kvarYtor = ((ytor ?? []) as unknown as { matt: string | null; overhoppad: boolean }[])
    .filter((y) => !y.overhoppad && y.matt == null).length;

  if (kvarPunkter > 0 || kvarYtor > 0) {
    // Sag vad som faktiskt aterstar, bada slagen var for sig - "8 kvar" utan
    // att saga vad som ar kvar hjalper ingen som star i skogen.
    const delar: string[] = [];
    if (kvarPunkter > 0) delar.push(`${kvarPunkter} ${kvarPunkter === 1 ? 'punkt' : 'punkter'}`);
    if (kvarYtor > 0) delar.push(`${kvarYtor} ${kvarYtor === 1 ? 'provyta' : 'provytor'}`);
    throw new Error(`${delar.join(' och ')} återstår. Gör klart dem innan du avslutar.`);
  }

  const { data, error } = await klient
    .from('egenkontroll')
    .update({ status: 'klar', klar: new Date().toISOString() })
    .eq('id', egenkontrollId)
    .eq('status', 'pagaende')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte avsluta rundan: ${error.message}`);
  if (!data) {
    // 0 rader: nagon annan hann avsluta, eller rundan var redan klar. Las om
    // och beratta vilket - "gick inte" duger inte som besked.
    const { data: nuvarande } = await klient
      .from('egenkontroll')
      .select('status')
      .eq('id', egenkontrollId)
      .maybeSingle();
    if ((nuvarande as { status?: string } | null)?.status === 'klar') {
      throw new Error('Rundan är redan avslutad. Ladda om sidan.');
    }
    throw new Error('Rundan kunde inte avslutas — den hittades inte. Ladda om sidan.');
  }

  const sparad = data as unknown as Egenkontroll;
  // Las tillbaka VARDET, inte antalet rader.
  if (sparad.status !== 'klar' || !sparad.klar) {
    throw new Error('Rundan sparades inte som avslutad. Ladda om sidan.');
  }
  return sparad;
}

// ---------------------------------------------------------------------------
// Avvikelsen: typ, foto, position, kommentar
// ---------------------------------------------------------------------------

/** CHECK egenkontroll_punkt_avvikelse_typ_check. Exakt fyra - fler blir lista. */
export const AVVIKELSE_TYPER = ['korspar', 'stubbhojd', 'hansyn_skadad', 'annat'] as const;
export type AvvikelseTyp = (typeof AVVIKELSE_TYPER)[number];

export const AVVIKELSE_ETIKETT: Record<AvvikelseTyp, string> = {
  korspar: 'Körspår',
  stubbhojd: 'Stubbhöjd',
  hansyn_skadad: 'Hänsyn skadad',
  annat: 'Annat',
};

export type EgenkontrollFoto = {
  id: string;
  egenkontroll_id: string;
  punkt_id: string | null;
  provyta_id: string | null;
  sokvag: string;
  /** Tackningsgrad for EN stubbe. Bilden ar beviset for sitt eget varde. */
  tackningsgrad: number | null;
  lat: number | null;
  lng: number | null;
  tagen: string | null;
  skapad: string;
};

export type AvvikelseUppgifter = {
  typ: AvvikelseTyp;
  kommentar?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/**
 * Svarar "avvikelse" med typ, kommentar och position i EN skrivning.
 *
 * SPARORDNING: fotot ska redan vara uppe nar detta anropas. Punkten skrivs
 * sist, nar sokvagen finns - annars kan en avvikelse bli liggande utan bild
 * och det ar just det som inte far hanta.
 *
 * Laser tillbaka VARDET, som svaraPaPunkt.
 */
export async function svaraMedAvvikelse(
  punktId: string,
  uppgifter: AvvikelseUppgifter,
  options: KlientOptions = {},
): Promise<EgenkontrollPunkt> {
  if (!AVVIKELSE_TYPER.includes(uppgifter.typ)) {
    throw new Error(`"${uppgifter.typ}" är ingen giltig avvikelsetyp.`);
  }
  const { klient } = await kravSession(options);
  await kravOppenRunda(klient, punktId);

  const { data, error } = await klient
    .from('egenkontroll_punkt')
    .update({
      status: 'avvikelse',
      avvikelse_typ: uppgifter.typ,
      kommentar: tomtEllerNull(uppgifter.kommentar),
      lat: uppgifter.lat ?? null,
      lng: uppgifter.lng ?? null,
      besvarad: new Date().toISOString(),
    })
    .eq('id', punktId)
    .eq('del', 'plan') // avvikelse hor bara till Del 1
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte spara avvikelsen: ${error.message}`);
  if (!data) throw new Error('Avvikelsen sparades inte — punkten hittades inte. Ladda om sidan.');

  const sparad = data as unknown as EgenkontrollPunkt;
  if (sparad.status !== 'avvikelse' || sparad.avvikelse_typ !== uppgifter.typ) {
    throw new Error('Avvikelsen sparades inte som väntat. Ladda om sidan.');
  }
  return sparad;
}

/**
 * Skriver fotoraden. Anropas SIST, nar bilden ligger i bucketen.
 *
 * En klar runda ar last i TRE lager - se kravOppenRunda. Kontrollen har ar
 * det oversta av dem och ger bara beskedet; laset ligger i databasen.
 */
export async function laggTillFoto(
  foto: {
    egenkontrollId: string;
    punktId: string;
    sokvag: string;
    lat?: number | null;
    lng?: number | null;
    tagen?: string | null;
  },
  options: KlientOptions = {},
): Promise<EgenkontrollFoto> {
  const { klient } = await kravSession(options);
  await kravOppenRunda(klient, foto.punktId);

  const { data, error } = await klient
    .from('egenkontroll_foto')
    .insert({
      egenkontroll_id: foto.egenkontrollId,
      punkt_id: foto.punktId,
      sokvag: foto.sokvag,
      lat: foto.lat ?? null,
      lng: foto.lng ?? null,
      tagen: foto.tagen ?? new Date().toISOString(),
    })
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Bilden sparades inte: ${error.message}`);
  if (!data) throw new Error('Bilden sparades inte — raden kunde inte läsas tillbaka.');
  return data as unknown as EgenkontrollFoto;
}

/**
 * Besiktarens egen anteckning pa punkten.
 *
 * Skrivs till kolumnen kommentar - ALDRIG plan_kommentar, som ar planerarens
 * text fran planeringen och ska overleva orord.
 */
export async function sparaPunktKommentar(
  punktId: string,
  kommentar: string | null,
  options: KlientOptions = {},
): Promise<EgenkontrollPunkt> {
  const { klient } = await kravSession(options);
  await kravOppenRunda(klient, punktId);

  const varde = tomtEllerNull(kommentar);
  const { data, error } = await klient
    .from('egenkontroll_punkt')
    .update({ kommentar: varde })
    .eq('id', punktId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte spara kommentaren: ${error.message}`);
  if (!data) throw new Error('Kommentaren sparades inte — punkten hittades inte.');
  const sparad = data as unknown as EgenkontrollPunkt;
  if (sparad.kommentar !== varde) {
    throw new Error('Kommentaren sparades inte som väntat. Ladda om sidan.');
  }
  return sparad;
}

/**
 * Markeringarna som KONTEXT pa kartan - grans, diken, pilar.
 *
 * Detta ar orientering, inte dokumentets innehall. Kontrollpunkternas geometri
 * kommer ALLTID ur geometri_snapshot; den har funktionen ar det underordnade
 * lagret under dem och far aldrig anvandas for att rita en kontrollpunkt.
 */
export async function hamtaKontextmarkeringar(
  objektId: string,
  options: KlientOptions = {},
): Promise<{ data: unknown }[]> {
  const { klient } = await kravSession(options);
  const { data, error } = await klient
    .from('planering_markeringar')
    .select('data')
    .eq('objekt_id', objektId)
    .order('marker_id', { ascending: true });

  if (error) throw new Error(`Kunde inte läsa markeringarna: ${error.message}`);
  return (data ?? []) as unknown as { data: unknown }[];
}

/** Foton for en runda, aldst forst. */
export async function hamtaFoton(
  egenkontrollId: string,
  options: KlientOptions = {},
): Promise<EgenkontrollFoto[]> {
  const { klient } = await kravSession(options);
  const { data, error } = await klient
    .from('egenkontroll_foto')
    .select('*')
    .eq('egenkontroll_id', egenkontrollId)
    .order('skapad', { ascending: true });

  if (error) throw new Error(`Kunde inte läsa bilderna: ${error.message}`);
  return (data ?? []) as unknown as EgenkontrollFoto[];
}

/**
 * Vagrar om punktens runda ar klar.
 *
 * EN KLAR RUNDA AR LAST I TRE LAGER. Denna funktion ar det oversta och det
 * svagaste - den finns for att anvandaren ska fa ett begripligt besked i
 * stallet for ett ravt check_violation. Den ar INTE laset:
 *
 *   1. klientsparr (har)              - begripligt besked
 *   2. trigger egenkontroll_punkt_last - laser punktraderna
 *      trigger egenkontroll_foto_last  - laser fotoraderna (aven DELETE)
 *   3. storage-policy pa egenkontroll-foto - laser sjalva FILERNA, for
 *      insert och delete
 *
 * SOKVAGEN AR LASBARANDE. Storage-policyn laser forsta mappnivan i filnamnet
 * som rundans id: (storage.foldername(name))[1] jamfors mot egenkontroll.status.
 * Sokvagen MASTE darfor forbli {egenkontroll_id}/{punkt_id}-{timestamp}.jpg.
 * En till synes kosmetisk andring av formatet oppnar laset TYST - filerna gar
 * da att byta ut pa en klar runda utan att nagot larmar. Byt aldrig format
 * utan att andra policyn i samma andetag.
 */
async function kravOppenRunda(klient: SupabaseClient, punktId: string): Promise<void> {
  const { data } = await klient
    .from('egenkontroll_punkt')
    .select('egenkontroll:egenkontroll_id (status)')
    .eq('id', punktId)
    .maybeSingle();
  const status = (data as { egenkontroll?: { status?: string } } | null)?.egenkontroll?.status;
  if (status === 'klar') {
    throw new Error('Rundan är avslutad och går inte att ändra.');
  }
}

// ---------------------------------------------------------------------------
// Stubbehandling
// ---------------------------------------------------------------------------

/** Avrundning till narmaste 5. Steget ar medvetet grovt - se StubbeSheet. */
export function tillNarmaste5(varde: number): number {
  return Math.round(varde / 5) * 5;
}

/** Domen. Texten sager samma sak som fargen - fargen bar aldrig ensam. */
export function stubbeDom(tackningsgrad: number): { status: 'ok' | 'battre'; text: string } {
  return tackningsgrad >= KRAVNIVA_STUBBEHANDLING
    ? { status: 'ok', text: 'Uppfyller kravnivån' }
    : { status: 'battre', text: 'Under kravnivån' };
}

export type StubbeResultat = {
  punkt: EgenkontrollPunkt;
  /** Medelvardet som skrevs till varde_bekraftat, avrundat till narmaste 5. */
  medel: number;
  antalStubbar: number;
};

/**
 * Sparar EN stubbe: fotorad med sitt eget varde, sedan punktens sammanfattning.
 *
 * SPARORDNING som i PR 5 - bilden ska redan ligga i bucketen nar detta anropas.
 * Fotoraden skrivs forst (den ar kallan), darefter raknas medelvardet om ur
 * SAMTLIGA stubbfoton pa punkten och skrivs till varde_bekraftat.
 *
 * varde_bekraftat ar en SAMMANFATTNING, inte kallan. varde_foreslaget lamnas
 * orort (NULL) - den ar reserverad for fargsegmenteringens forslag, och fylls
 * den med det manuella vardet forlorar vi mojligheten att jamfora forslag mot
 * bekraftelse.
 *
 * Medelvardet raknas om fran grunden varje gang i stallet for att raknas
 * inkrementellt: da kan punkten aldrig glida ifran sina foton.
 */
export async function sparaStubbe(
  args: {
    egenkontrollId: string;
    punktId: string;
    sokvag: string;
    tackningsgrad: number;
    lat?: number | null;
    lng?: number | null;
  },
  options: KlientOptions = {},
): Promise<StubbeResultat> {
  if (!Number.isFinite(args.tackningsgrad) || args.tackningsgrad < 0 || args.tackningsgrad > 100) {
    throw new Error('Täckningsgraden måste vara mellan 0 och 100 procent.');
  }
  const { klient } = await kravSession(options);
  await kravOppenRunda(klient, args.punktId);

  // 1. Fotoraden - bilden och dess varde pa samma rad.
  const { error: fotoFel } = await klient.from('egenkontroll_foto').insert({
    egenkontroll_id: args.egenkontrollId,
    punkt_id: args.punktId,
    sokvag: args.sokvag,
    tackningsgrad: args.tackningsgrad,
    lat: args.lat ?? null,
    lng: args.lng ?? null,
    tagen: new Date().toISOString(),
  });
  if (fotoFel) throw new Error(`Stubben sparades inte: ${fotoFel.message}`);

  // 2. Rakna om ur alla stubbfoton pa punkten.
  const { data: alla, error: lasFel } = await klient
    .from('egenkontroll_foto')
    .select('tackningsgrad')
    .eq('punkt_id', args.punktId)
    .not('tackningsgrad', 'is', null)
    .order('skapad', { ascending: true });
  if (lasFel) throw new Error(`Kunde inte räkna om medelvärdet: ${lasFel.message}`);

  const varden = ((alla ?? []) as unknown as { tackningsgrad: number }[]).map((r) =>
    Number(r.tackningsgrad),
  );
  if (varden.length === 0) throw new Error('Stubben sparades men kunde inte läsas tillbaka.');
  const medel = tillNarmaste5(varden.reduce((a, b) => a + b, 0) / varden.length);

  // 3. Punktens sammanfattning.
  const { data, error } = await klient
    .from('egenkontroll_punkt')
    .update({
      status: stubbeDom(medel).status,
      varde_bekraftat: medel,
      besvarad: new Date().toISOString(),
    })
    .eq('id', args.punktId)
    .eq('del', 'matning')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte spara mätningen: ${error.message}`);
  if (!data) throw new Error('Mätningen sparades inte — punkten hittades inte. Ladda om sidan.');

  const sparad = data as unknown as EgenkontrollPunkt;
  if (Number(sparad.varde_bekraftat) !== medel) {
    throw new Error('Mätningen sparades inte som väntat. Ladda om sidan.');
  }
  return { punkt: sparad, medel, antalStubbar: varden.length };
}

// ---------------------------------------------------------------------------
// Provytor
// ---------------------------------------------------------------------------

export type EgenkontrollProvyta = {
  id: string;
  egenkontroll_id: string;
  nummer: number;
  lat: number | null;
  lng: number | null;
  noggrannhet_m: number | null;
  radie_m: number | null;
  markt_i_falt: boolean;
  matt: string | null;
  kommentar: string | null;
  antal_frisk: number | null;
  antal_skadad: number | null;
  stickvagsbredd_m: number | null;
  stickvagsavstand_m: number | null;
  grundyta_m2_ha: number | null;
  overhoppad: boolean;
  skapad: string;
};

/**
 * Antal ytor efter areal: en per paborjade 5 ha, lagst 3, hogst 8.
 * 31,7 ha -> 7. 18,2 ha -> 4.
 */
export function antalProvytor(areal: number | null | undefined): number | null {
  if (areal == null || !Number.isFinite(areal) || areal <= 0) return null;
  return Math.max(3, Math.min(8, Math.ceil(areal / 5)));
}

/**
 * Lottar och skriver provytorna. Bara GALLRING - i ett gallrat bestand star
 * tradet kvar, och det ar det som ska bedomas.
 *
 * Returnerar antalet ytor. 0 betyder att de inte gick att lagga ut - saknad
 * areal, saknad kartbild_bounds (origot) eller saknad traktgrans. Vyn ska da
 * saga det rakt ut; en tom lista utan forklaring later som att allt ar matt.
 *
 * LOTTAS EN GANG. generateEgenkontroll returnerar en befintlig runda utan att
 * rora nagot, sa en andra korning kan inte lotta om. Det finns med avsikt
 * ingen funktion som lottar om.
 */
async function skapaProvytor(
  klient: SupabaseClient,
  egenkontrollId: string,
  objektId: string,
  objektTyp: ObjektTyp,
  objekt: { areal?: number | null; kartbild_bounds?: unknown; vo_nummer?: string | null },
): Promise<number> {
  if (objektTyp !== 'gallring') return 0;

  const antal = antalProvytor(objekt.areal);
  if (antal == null) return 0;

  const origo = kartOrigoFranBounds(objekt);
  if (!origo) return 0; // utan origo gar markeringarna inte att placera

  // Traktgransen - INTE kartbild_bounds. Se lib/provytor.ts for varfor.
  const { data, error } = await klient
    .from('planering_markeringar')
    .select('data')
    .eq('objekt_id', objektId)
    .order('marker_id', { ascending: true });
  if (error) throw new Error(`Kunde inte läsa traktgränsen: ${error.message}`);

  const paths = ((data ?? []) as unknown as { data: Record<string, unknown> | null }[])
    .filter((m) => m.data && (m.data as Record<string, unknown>).lineType === 'boundary')
    .map((m) => (m.data as { path?: { x: number; y: number }[] }).path)
    .filter((p): p is { x: number; y: number }[] => Array.isArray(p) && p.length >= 3);

  if (paths.length === 0) return 0;

  // Stammarna hamtas EN gang och anvands bade som filter har och som lager i
  // helskarmskartan. Saknas de lottas det enbart innanfor traktgransen.
  const stammar = await hamtaAvverkadeStammar(objekt.vo_nummer, { klient });
  const ytor = lottaProvytor(paths, origo, antal, stammar);
  if (ytor.length === 0) return 0;

  const { error: skrivFel } = await klient.from('egenkontroll_provyta').insert(
    ytor.map((y) => ({
      egenkontroll_id: egenkontrollId,
      nummer: y.nummer,
      lat: y.lat,
      lng: y.lng,
      radie_m: PROVYTA_RADIE_M,
    })),
  );
  if (skrivFel) throw new Error(`Kunde inte skapa provytorna: ${skrivFel.message}`);
  return ytor.length;
}

/**
 * Avverkade stammar for ett objekt, ur HPR.
 *
 * Matchning: split_part(objekt_nyckel, ':', 2) mot objekt.vo_nummer - SAMMA
 * regel som SkordarKarta anvander. LAS BARA; dim_objekt_id ar en oppen
 * modellfraga och skrivs aldrig harifran.
 *
 * Kumulativa filer: filen med FLEST stammar vinner, inte den nyaste. En senare
 * inkrementfil kan innehalla farre stammar an en tidigare full export.
 *
 * Tom lista betyder "inga stammar hittades" - anroparen ska da saga det, inte
 * lata det se ut som att trakten var orord.
 */
export async function hamtaAvverkadeStammar(
  voNummer: string | null | undefined,
  options: KlientOptions = {},
): Promise<LatLng[]> {
  const vo = String(voNummer ?? '').trim();
  if (!vo) return [];
  const { klient } = await kravSession(options);

  const { data: filer, error: filFel } = await klient
    .from('hpr_filer')
    .select('id, objekt_nyckel, stammar_count')
    .not('objekt_nyckel', 'is', null)
    .order('stammar_count', { ascending: false, nullsFirst: false });
  if (filFel) throw new Error(`Kunde inte läsa HPR-filerna: ${filFel.message}`);

  const fil = ((filer ?? []) as unknown as { id: string; objekt_nyckel: string }[])
    .find((f) => String(f.objekt_nyckel ?? '').split(':')[1] === vo);
  if (!fil) return [];

  // Sidhamtning: en gallring kan ha over 12 000 stammar och PostgREST tar
  // 1000 at gangen. .order() kravs for stabil paginering.
  const ut: LatLng[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await klient
      .from('hpr_stammar')
      .select('lat, lng')
      .eq('hpr_fil_id', fil.id)
      .not('lat', 'is', null)
      .order('stam_nummer', { ascending: true })
      .order('id')  // unik tiebreaker — .range() kräver total ordning
      .range(offset, offset + 999);
    if (error) throw new Error(`Kunde inte läsa stammarna: ${error.message}`);
    const rader = (data ?? []) as unknown as { lat: number; lng: number }[];
    for (const r of rader) if (r.lat != null && r.lng != null) ut.push({ lat: r.lat, lng: r.lng });
    if (rader.length < 1000) break;
  }
  return ut;
}

/** Provytorna for en runda, i nummerordning. */
export async function hamtaProvytor(
  egenkontrollId: string,
  options: KlientOptions = {},
): Promise<EgenkontrollProvyta[]> {
  const { klient } = await kravSession(options);
  const { data, error } = await klient
    .from('egenkontroll_provyta')
    .select('*')
    .eq('egenkontroll_id', egenkontrollId)
    .order('nummer', { ascending: true });
  if (error) throw new Error(`Kunde inte läsa provytorna: ${error.message}`);
  return (data ?? []) as unknown as EgenkontrollProvyta[];
}

export type ProvytaMatning = {
  antalFrisk: number;
  antalSkadad: number;
  stickvagsbreddM?: number | null;
  stickvagsavstandM?: number | null;
  grundytaM2Ha?: number | null;
  markessnitslad?: boolean;
  noggrannhetM?: number | null;
  kommentar?: string | null;
};

/**
 * Skriver ytans matvarden. UPDATE-only.
 *
 * Skadeandelen lagras ALDRIG - den raknas ur de tva talen. En lagrad andel
 * blir en andra sanning som kan glida ifran sina delar.
 *
 * Laset ar triggern egenkontroll_provyta_last; kontrollen har ger bara ett
 * begripligt besked.
 */
export async function sparaProvyta(
  provytaId: string,
  m: ProvytaMatning,
  options: KlientOptions = {},
): Promise<EgenkontrollProvyta> {
  if (m.antalFrisk < 0 || m.antalSkadad < 0) {
    throw new Error('Antalet träd kan inte vara negativt.');
  }
  const { klient } = await kravSession(options);
  await kravOppenRundaForProvyta(klient, provytaId);

  const { data, error } = await klient
    .from('egenkontroll_provyta')
    .update({
      antal_frisk: m.antalFrisk,
      antal_skadad: m.antalSkadad,
      stickvagsbredd_m: m.stickvagsbreddM ?? null,
      stickvagsavstand_m: m.stickvagsavstandM ?? null,
      grundyta_m2_ha: m.grundytaM2Ha ?? null,
      markt_i_falt: m.markessnitslad ?? false,
      noggrannhet_m: m.noggrannhetM ?? null,
      kommentar: tomtEllerNull(m.kommentar),
      overhoppad: false,
      matt: new Date().toISOString(),
    })
    .eq('id', provytaId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte spara provytan: ${error.message}`);
  if (!data) throw new Error('Provytan sparades inte — den hittades inte. Ladda om sidan.');
  const sparad = data as unknown as EgenkontrollProvyta;
  if (sparad.antal_frisk !== m.antalFrisk || sparad.antal_skadad !== m.antalSkadad) {
    throw new Error('Provytan sparades inte som väntat. Ladda om sidan.');
  }
  return sparad;
}

/**
 * Hoppar over en yta. SKALET KRAVS - constraintet overhoppad_kraver_skal
 * avvisar en overhoppning utan kommentar, och det ska synas i dokumentet
 * varfor ytan inte matts.
 */
export async function hoppaOverProvyta(
  provytaId: string,
  skal: string,
  options: KlientOptions = {},
): Promise<EgenkontrollProvyta> {
  const text = tomtEllerNull(skal);
  if (!text) throw new Error('Skriv varför ytan hoppas över — det ska synas i dokumentet.');

  const { klient } = await kravSession(options);
  await kravOppenRundaForProvyta(klient, provytaId);

  const { data, error } = await klient
    .from('egenkontroll_provyta')
    .update({ overhoppad: true, kommentar: text, matt: new Date().toISOString() })
    .eq('id', provytaId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Kunde inte hoppa över ytan: ${error.message}`);
  if (!data) throw new Error('Ytan sparades inte — den hittades inte. Ladda om sidan.');
  return data as unknown as EgenkontrollProvyta;
}

/** Begripligt besked. Laset ar triggern egenkontroll_provyta_last. */
async function kravOppenRundaForProvyta(klient: SupabaseClient, provytaId: string): Promise<void> {
  const { data } = await klient
    .from('egenkontroll_provyta')
    .select('egenkontroll:egenkontroll_id (status)')
    .eq('id', provytaId)
    .maybeSingle();
  const status = (data as { egenkontroll?: { status?: string } } | null)?.egenkontroll?.status;
  if (status === 'klar') throw new Error('Rundan är avslutad och går inte att ändra.');
}

/**
 * Foto pa en provyta. Constraintet foto_hor_till_en_sak kraver punkt ELLER
 * provyta - aldrig bada. Fotolaset gar pa egenkontroll_id och tacker darfor
 * redan provyte-bilder.
 */
export async function laggTillProvytaFoto(
  foto: { egenkontrollId: string; provytaId: string; sokvag: string; lat?: number | null; lng?: number | null },
  options: KlientOptions = {},
): Promise<EgenkontrollFoto> {
  const { klient } = await kravSession(options);
  await kravOppenRundaForProvyta(klient, foto.provytaId);

  const { data, error } = await klient
    .from('egenkontroll_foto')
    .insert({
      egenkontroll_id: foto.egenkontrollId,
      provyta_id: foto.provytaId,
      sokvag: foto.sokvag,
      lat: foto.lat ?? null,
      lng: foto.lng ?? null,
      tagen: new Date().toISOString(),
    })
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Bilden sparades inte: ${error.message}`);
  if (!data) throw new Error('Bilden sparades inte — raden kunde inte läsas tillbaka.');
  return data as unknown as EgenkontrollFoto;
}

/** En yta ar avklarad nar den ar matt ELLER overhoppad med skal. */
export function provytaAvklarad(y: EgenkontrollProvyta): boolean {
  return y.overhoppad || y.matt != null;
}
