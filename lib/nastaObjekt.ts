// "Nästa objekt" per maskin — förslag, aldrig order. STEG 1: ren read-only-logik.
//
// Ingen UI, inga skrivningar, inga imports/sidoeffekter. All data skickas IN som
// vanliga objekt (positioner, kandidater, avståndsfunktion) så funktionen är
// deterministisk och testbar utan DB eller nät. Anroparen (översikten, en cron,
// ett test) bygger indata och läser förslaget.
//
// VIKTIGT om datat den vilar på (uppmätt mot prod 2026-09-15, se utredningen):
//   • Maskinens "position" är OBJEKT-nivå (senaste produktionsobjekt via fakt_tid,
//     dagsfärskt) — INTE live-GPS. Det räcker för "vilket objekt härnäst", men
//     medger ingen geofence (point-in-polygon). Objektpolygoner finns inte heller.
//   • "Backen" (skördat − skotat) är opålitlig där skotardata (FPR/lass) saknas —
//     64 av 106 skördade objekt har ingen lass-rad alls, så skotat=0 betyder
//     "ovisst", inte "0 utkört". Därför rankar skotarförslaget BARA objekt där
//     backen är trovärdig (backenPalitlig=true). Utan det skulle det peka på
//     månadsgamla, redan utkörda högar.

export type MaskinTyp = 'skordare' | 'skotare';
export interface Koordinat { lat: number; lng: number }

export interface MaskinLage {
  maskinId: string;
  typ: MaskinTyp;
  koordinat: Koordinat | null;        // objekt-nivå (senaste produktionsobjekt), EJ live-GPS
  nuvarandeObjektKey: string | null;  // vilket objekt maskinen står på nu (fakt-nyckel)
  positionAlderDagar: number | null;  // signalens ålder i dagar (färskhet)
}

export interface Kandidat {
  key: string;                    // fakt-nyckel (dim_objekt_id/vo_nummer)
  namn: string;
  status: string;                 // objekt.status
  koordinat: Koordinat | null;
  skordat: number;                // m³fub (vy_uppf_prod)
  backen: number;                 // m³fub kvar på backen (lib/skotat paBackenKvar)
  backenPalitlig: boolean;        // FPR-täckning finns OCH rimlig liggetid → backen går att lita på
  legatDagar: number | null;      // dagar sedan sista skörd (liggetid)
  skordareIds: string[];          // vilka skördare avverkat (vy_uppf_prod maskin_ids)
  attKora: boolean;               // status = planerad ("klar att köra"-grunden)
  oppenFara: boolean;             // ≥1 fara-markering (powerline/warning) i planering_markeringar
  grotDeadline: string | null;    // objekt.grot_deadline (idag osatt i prod)
  egenSkotning: boolean;          // säljaren/markägaren skotar själv → aldrig vårt skotarjobb
}

export type Konfidens = 'hog' | 'lag' | 'ingen';

export interface NastaForslag {
  vald: Kandidat | null;
  skal: string;
  poang: number;                  // 0..1 för vald (skotare) / avstånd-baserad (skördare)
  konfidens: Konfidens;
  rankning: { key: string; namn: string; poang: number; skal: string }[];
}

// Avstånd injiceras: appen skickar OSRM-vägavstånd (samma som "Härnäst närmast"),
// tester skickar haversine. null = okänt avstånd (t.ex. saknad koordinat/OSRM-miss).
export type AvstandKm = (from: Koordinat, to: Koordinat) => number | null;

// ── Trösklar och vikter — FÖRSLAG, motiverade i rapporten. Exporterade så de är
//    lätta att justera och att testa mot. ──
export const TROSKEL = {
  skotareBackenMin: 30,   // m³fub — mindre än så är ingen egen skotartur värd (~2 lass)
  skotareLegatMax: 45,    // dagar — äldre "backen" är sannolikt redan utkört men oregistrerat
  arKlarBackenMax: 15,    // m³fub — mindre än ett skotarlass kvar ≈ klart
};

// Skotarens rangordning: liggetid tyngst (virket tappar värde och kan bli blått),
// sedan volym (en stor hög är en effektiv tur), sedan närhet (billig förflyttning).
export const VIKT = { liggetid: 0.4, volym: 0.35, narhet: 0.25 };

function normalisera(varden: number[]): (v: number) => number {
  const min = Math.min(...varden), max = Math.max(...varden);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return () => 0.5;
  return (v: number) => (v - min) / (max - min);
}

/**
 * Nästa objekt för en maskin. Förslag med skäl och konfidens — aldrig en order.
 * Muterar ingenting, gör inga anrop; allt kommer via argumenten.
 */
export function foreslaNasta(
  m: MaskinLage,
  kandidater: Kandidat[],
  avstand: AvstandKm,
  upptagnaKeys: string[] = [], // objekt att aldrig föreslå (deconflict). Anroparen avgör vad som är
                               // upptaget — normalt objekt en annan maskin av SAMMA roll står på:
                               // en skotare ska följa en skördare, så deconflicta bara mot samma roll.
): NastaForslag {
  const km = (k: Kandidat): number | null =>
    m.koordinat && k.koordinat ? avstand(m.koordinat, k.koordinat) : null;
  const upptagna = new Set([...upptagnaKeys, m.nuvarandeObjektKey].filter(Boolean) as string[]);
  const ledig = (k: Kandidat) => !upptagna.has(k.key);

  if (m.typ === 'skordare') {
    // Skördare: närmaste objekt som är KLART ATT KÖRA (status planerad) och utan öppen fara.
    // grot_deadline/bärighet/tälvillkor finns inte som data → ingår inte (skulle bli gissning).
    const klara = kandidater.filter((k) => k.attKora && !k.oppenFara && ledig(k));
    if (klara.length === 0) {
      return { vald: null, skal: 'Inga objekt är klara att köra (planerad + utan öppen fara)', poang: 0, konfidens: 'ingen', rankning: [] };
    }
    const medAvst = klara
      .map((k) => ({ k, d: km(k) }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity));
    const rankning = medAvst.map(({ k, d }) => ({
      key: k.key, namn: k.namn,
      poang: d ?? -1,
      skal: d != null ? `${Math.round(d)} km körväg` : 'avstånd okänt (saknar koordinat)',
    }));
    const vald = medAvst[0];
    const harAvst = vald.d != null;
    return {
      vald: vald.k,
      skal: harAvst
        ? `Närmast av ${klara.length} klara att köra — ${Math.round(vald.d!)} km`
        : `Klar att köra, men avstånd okänt (${klara.length} kandidater saknar koordinat/rutt)`,
      poang: vald.d ?? 0,
      konfidens: harAvst && m.koordinat ? 'hog' : 'lag',
      rankning,
    };
  }

  // Skotare: bland objekt med TROVÄRDIG backen (FPR-täckt + färsk liggetid, ej egen skotning,
  // ej avslutat). Utan backenPalitlig-filtret pekar förslaget på månadsgamla, redan utkörda högar.
  const palitliga = kandidater.filter(
    (k) => k.backenPalitlig && k.backen >= TROSKEL.skotareBackenMin && !k.egenSkotning
      && k.status !== 'avslutat' && ledig(k)
      && (k.legatDagar == null || k.legatDagar <= TROSKEL.skotareLegatMax),
  );
  if (palitliga.length === 0) {
    return {
      vald: null,
      skal: 'Ingen trovärdig backen att skota — objekten med "virke på backen" saknar FPR-data eller är för gamla (sannolikt redan utkörda)',
      poang: 0, konfidens: 'ingen', rankning: [],
    };
  }
  const nBacken = normalisera(palitliga.map((k) => k.backen));
  const nLegat = normalisera(palitliga.map((k) => k.legatDagar ?? 0));
  const avstVarden = palitliga.map((k) => km(k)).filter((d): d is number => d != null);
  const nAvst = avstVarden.length ? normalisera(avstVarden) : () => 0.5;
  const poangFor = (k: Kandidat): number => {
    const d = km(k);
    const narhet = d != null ? 1 - nAvst(d) : 0.3; // okänt avstånd straffas milt, tystas inte
    return VIKT.liggetid * nLegat(k.legatDagar ?? 0) + VIKT.volym * nBacken(k.backen) + VIKT.narhet * narhet;
  };
  const rankad = palitliga
    .map((k) => ({ k, p: poangFor(k), d: km(k) }))
    .sort((a, b) => b.p - a.p);
  const rankning = rankad.map(({ k, p, d }) => ({
    key: k.key, namn: k.namn, poang: Math.round(p * 100) / 100,
    skal: `${Math.round(k.backen)} m³fub · ${k.legatDagar ?? '?'} d liggetid${d != null ? ` · ${Math.round(d)} km` : ''}`,
  }));
  const vald = rankad[0];
  return {
    vald: vald.k,
    skal: `Störst kombination av liggetid + volym + närhet av ${palitliga.length} trovärdiga — ${Math.round(vald.k.backen)} m³fub, ${vald.k.legatDagar ?? '?'} d`,
    poang: Math.round(vald.p * 100) / 100,
    konfidens: vald.d != null ? 'hog' : 'lag',
    rankning,
  };
}

/**
 * Är maskinen klar med objektet? Read-only, ingen geofence (positionen är objekt-nivå,
 * objektpolygoner finns inte). Klar = maskinen jobbar nu på ett ANNAT objekt (den har
 * flyttat vidare) ELLER så lite trovärdig backen kvar att det i praktiken är klart.
 * Returnerar aldrig "klar" på gissning: opålitlig backen ensam räcker inte.
 */
export function arKlar(m: MaskinLage, k: Kandidat): { klar: boolean; skal: string } {
  // Status vinner över backen: ett avslutat objekt är markerat klart av en människa —
  // lita på det, inte på en backen-siffra som ofta är fantom (oregistrerad skotning).
  if (k.status === 'avslutat') return { klar: true, skal: 'Objektet är avslutat (markerat klart)' };
  const flyttatVidare = m.nuvarandeObjektKey != null && m.nuvarandeObjektKey !== k.key;
  if (flyttatVidare) return { klar: true, skal: 'Maskinen producerar nu på ett annat objekt' };
  // Kvar på objektet → typberoende. Skördaren "klar" kan vi inte avgöra utan planerad volym
  // (finns inte som pålitlig data) → så länge den producerar här är den inte klar.
  if (m.typ === 'skordare') return { klar: false, skal: 'Skördaren producerar fortfarande här' };
  // Skotare kvar på objektet: nästan allt utkört = i praktiken klart, men bara om backen går att lita på.
  if (k.backenPalitlig && k.backen < TROSKEL.arKlarBackenMax) {
    return { klar: true, skal: `Mindre än ${TROSKEL.arKlarBackenMax} m³fub kvar (${Math.round(k.backen)})` };
  }
  if (!k.backenPalitlig) return { klar: false, skal: 'Kan inte avgöra — otillförlitlig skotardata, maskinen står kvar' };
  return { klar: false, skal: `${Math.round(k.backen)} m³fub kvar att skota` };
}
