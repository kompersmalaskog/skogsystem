// Tidsförslag för prognos-fliken (planering). Jocke kan ALLTID skriva över — aldrig tvingande.
//
// Bygger på: areal + medelstam-proxy (medeldiameter i cm) + historiskt snitt ha/timme från LIKNANDE
// avslutade objekt (samma kategori: gallring/slutavverkning), justerat för skotningsavstånd och
// breddat lastrede. Basvägsarbete läggs på SEPARAT som engångstid (aldrig i ha/timme-modellen).
//
// ÄRLIGHET (viktig): "historiken" = de avslutade objektens PLANERADE timmar (manuell_prognos). Appen
// har inga tillförlitliga FAKTISKA maskintimmar per objekt (fakt_tid saknar skarp objekt-koppling), så
// förslaget speglar hur Jocke brukat uppskatta liknande trakter — självförbättrande allt eftersom fler
// objekt avslutas med satt prognos. Är underlaget för tunt ges INGET förslag (ärligt tomt-läge), aldrig
// en gissad siffra utan grund. Medelstam grövre än historikens median → snabbare (färre timmar); klenare
// → långsammare. Skotaren är mindre medelstams-känslig (mer volym/avstånd) → ingen medelstam-justering.
//
// FAKTORER:
//  - Skotningsavstånd (kort/medel/långt): faktor BARA på skotaren. Kort <1, medel =1, långt >1.
//  - Breddat lastrede (skotare_lastreder_breddat, befintligt Fakta-fält): breddat lastrede → mer virke
//    per lass → färre skotartimmar (faktor <1). Redigeras i Fakta-fliken; prognosen läser bara värdet.
//  - Basvägsarbete: ENGÅNGSTID. Läggs på skotarens FÖRSLAG efter ha/timme-räkningen (skotareTotalt),
//    och — KRITISKT — måste dras BORT från ett avslutat objekts planerade skotartid INNAN objektet
//    används som historik-underlag (annars snedvrids ha/timme-snittet uppåt för alla framtida förslag).
//    Den subtraktionen sker där HistorikObjekt byggs (app/planering/page.tsx historik-effekten).
//    Skotningsavstånd/breddat-faktorerna appliceras BARA framåt (historikens snitt blandar redan ihop
//    trakter med olika avstånd/lastrede — en konservativ v1-förenkling, kalibreras mot utfall senare).

export interface HistorikObjekt {
  areal: number | null;
  kategori: string | null;         // normaliserad (gallring/slutavverkning) — matchas mot aktuellt objekt
  skordareTimmar: number | null;   // manuell_prognos.skordare (PLANERAD)
  skotareTimmar: number | null;    // manuell_prognos.skotare (PLANERAD) MINUS basvag_timmar (volymberoende bas)
  medeldiameterCm: number | null;  // trakt_data.beraknad.medeldiameter
}

export interface TidsforslagInput {
  areal: number | null;
  kategori: string | null;
  medeldiameterCm: number | null;
  skotningsavstand?: string | null;   // 'kort' | 'medel' | 'langt'
  lastrederBreddat?: boolean | null;  // skotare_lastreder_breddat (befintligt Fakta-fält)
  basvagTimmar?: number | null;       // engångstid för DETTA objekt (0/null = ingen basväg)
}

export interface Tidsforslag {
  skordareTimmar: number | null;   // null = för tunt underlag för skördaren
  skotareTimmar: number | null;    // volymberoende bas (EXKL basväg); null = för tunt underlag
  basvagTimmar: number;            // engångspåslag för detta objekt (0 om ingen)
  skotareTotalt: number | null;    // skotareTimmar + basvagTimmar (null om skotareTimmar null)
  underlagSkordare: number;        // antal avslutade objekt bakom skördar-snittet
  underlagSkotare: number;
  medelstamJusterad: boolean;
  forklaring: string;              // kort källrad för UI
}

export const PROGNOS_MIN_UNDERLAG = 3;   // minst så många liknande avslutade objekt bakom ett tal

// Timmar-multiplikatorer (>1 = mer tid, <1 = mindre). Medvetet konservativa — små knuffar, inte drama.
const AVSTAND_FAKTOR: Record<string, number> = { kort: 0.85, medel: 1.0, langt: 1.25 };
const LASTREDER_BREDDAT_FAKTOR = 0.9;  // breddat lastrede → mer virke/lass → färre skotartimmar
const AVSTAND_ETIKETT: Record<string, string> = { kort: 'kort skotningsavstånd', medel: 'medel skotningsavstånd', langt: 'långt skotningsavstånd' };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function norm(s: string | null | undefined): string { return (s || '').trim().toLowerCase(); }

/**
 * Returnerar null om inget vettigt förslag kan ges (ingen areal, eller för tunt underlag för BÅDA roller).
 * Annars ett förslag där skordareTimmar/skotareTimmar kan vara null var för sig (tunt underlag för just den).
 * skotareTimmar är den volymberoende basen; basvag/skotareTotalt bär engångstiden separat.
 */
export function beraknaTidsforslag(input: TidsforslagInput, historik: HistorikObjekt[]): Tidsforslag | null {
  const areal = Number(input.areal);
  if (!Number.isFinite(areal) || areal <= 0) return null;

  // Liknande = samma kategori (om känd). Okänd kategori → jämför mot alla (svagare, men bättre än inget).
  const kat = norm(input.kategori);
  const liknande = historik.filter(h => {
    if (!h.areal || h.areal <= 0) return false;
    if (!kat) return true;
    return norm(h.kategori) === kat;
  });

  const haPerTimme = (tim: (h: HistorikObjekt) => number | null): number[] =>
    liknande
      .map(h => { const t = tim(h); return t && t > 0 && h.areal ? h.areal / t : NaN; })
      .filter(x => Number.isFinite(x) && x > 0) as number[];

  const haSk = haPerTimme(h => h.skordareTimmar);
  const haSko = haPerTimme(h => h.skotareTimmar);

  // Medelstam-justering (bara skördaren, och bara med tillräckligt diam-underlag).
  const diamValues = liknande.map(h => h.medeldiameterCm).filter((d): d is number => !!d && d > 0);
  let diamFaktor = 1;
  let medelstamJusterad = false;
  if (input.medeldiameterCm && input.medeldiameterCm > 0 && diamValues.length >= PROGNOS_MIN_UNDERLAG) {
    const medianDiam = median(diamValues);
    if (medianDiam > 0) { diamFaktor = clamp(input.medeldiameterCm / medianDiam, 0.7, 1.4); medelstamJusterad = true; }
  }

  // Skotar-faktorer (timmar-multiplikatorer). Okänt avstånd → 1 (neutralt).
  const avstandKey = norm(input.skotningsavstand);
  const avstandF = AVSTAND_FAKTOR[avstandKey] ?? 1;
  const lastrederF = input.lastrederBreddat ? LASTREDER_BREDDAT_FAKTOR : 1;

  const skordareTimmar = haSk.length >= PROGNOS_MIN_UNDERLAG
    ? Math.max(1, Math.round(areal / (median(haSk) * diamFaktor)))
    : null;
  const skotareTimmar = haSko.length >= PROGNOS_MIN_UNDERLAG
    ? Math.max(1, Math.round((areal / median(haSko)) * avstandF * lastrederF))
    : null;

  if (skordareTimmar == null && skotareTimmar == null) return null;

  // Basväg = SEPARAT engångspåslag. Aldrig i ha/timme-modellen ovan.
  const bvRaw = Number(input.basvagTimmar);
  const basvagTimmar = Number.isFinite(bvRaw) && bvRaw > 0 ? Math.round(bvRaw) : 0;
  const skotareTotalt = skotareTimmar != null ? skotareTimmar + basvagTimmar : null;

  const delar = [
    `${liknande.length} liknande avslutade objekt`,
    `areal ${areal} ha`,
    input.medeldiameterCm ? `medeldiam ${input.medeldiameterCm} cm` : null,
    medelstamJusterad ? 'medelstam-justerat' : null,
    AVSTAND_ETIKETT[avstandKey] ?? null,
    input.lastrederBreddat ? 'breddat lastrede' : null,
    basvagTimmar > 0 ? `+ ${basvagTimmar} h basväg (engångstid)` : null,
  ].filter(Boolean) as string[];

  return {
    skordareTimmar,
    skotareTimmar,
    basvagTimmar,
    skotareTotalt,
    underlagSkordare: haSk.length,
    underlagSkotare: haSko.length,
    medelstamJusterad,
    forklaring: `Snitt av planerad tid · ${delar.join(' · ')}`,
  };
}
