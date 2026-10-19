// Observationer: det man ser ute, som planen inte fragade om.
//
// RENT - ingen databas, ingen React, ingen karta - sa att reglerna gar att testa utan
// webblasare. lib/egenkontroll.ts skriver, RundKarta ritar, ObservationSheet fragar.
//
// EN OBSERVATION AR ETT TILLAGG, INGEN PUNKT SOM SKA BETAS AV. Den ligger i samma tabell
// som planpunkterna (egenkontroll_punkt) men med kalla='observation' och del='observation'
// (CHECK observation_ar_komplett kopplar ihop dem), och den ar ALLTID besvarad: tonen ar
// statusen och sparas i samma skrivning som raden. Darfor kan en observation aldrig bli
// "kvar", och darfor delas den bort VID KALLAN (hamtaRunda) - de tio stallen som raknar
// "N av M klara" far aldrig se den.
//
// TONEN AR ETT OMDOME: Bra / Kan bli battre / Avvikelse. TYPEN galler at BADA hallen -
// ett korspar kan vara bra. Det ar skillnaden mot planpunktens avvikelse, vars typ bara
// finns pa en avvikelse (och som heter hansyn_skadad). Observationens "hansyn" ar neutralt
// just for att en rishog som ligger ratt inte ska lagras som "skadad".

/** Tonerna, i den ordning de visas. Samma tre som CHECK status_hor_till_del tillater pa kalla='observation'. */
export const OBSERVATION_TONER = ['bra', 'battre', 'avvikelse'] as const;
export type ObservationTon = (typeof OBSERVATION_TONER)[number];

/**
 * Tonens ord och tecken. TECKNET bar tonen tillsammans med formen pa kartan (lib/observationIkon.ts):
 * farg ar aldrig ensam informationsbarare - rott i solljus ar brunt.
 */
export const OBSERVATION_TON: Record<ObservationTon, { etikett: string; tecken: string }> = {
  bra: { etikett: 'Bra', tecken: '✓' },
  battre: { etikett: 'Kan bli bättre', tecken: '!' },
  avvikelse: { etikett: 'Avvikelse', tecken: '✕' },
};

/** CHECK egenkontroll_punkt_avvikelse_typ_check, observationens fyra. Fler blir en lista - och da ett eget beslut. */
export const OBSERVATION_TYPER = ['korspar', 'stubbhojd', 'hansyn', 'annat'] as const;
export type ObservationTyp = (typeof OBSERVATION_TYPER)[number];

export const OBSERVATION_TYP_ETIKETT: Record<ObservationTyp, string> = {
  korspar: 'Körspår',
  stubbhojd: 'Stubbhöjd',
  hansyn: 'Hänsyn',
  annat: 'Annat',
};

/** punkt.rubrik ar NOT NULL. En observation har ingen rubrik av sig sjalv - tonen och typen bar den. */
export const OBSERVATION_RUBRIK = 'Observation';

/**
 * Observationerna har ingen ordning i serien. 0 ar inte en plats: det partiella unika indexet
 * egenkontroll_punkt_ordning_plan_key galler bara kalla <> 'observation', sa flera far samma 0.
 * Tidsordningen i dokumentet kommer ur besvarad, aldrig ur ordning.
 */
export const OBSERVATION_ORDNING = 0;

export function arObservationTon(v: unknown): v is ObservationTon {
  return typeof v === 'string' && (OBSERVATION_TONER as readonly string[]).includes(v);
}

export function arObservationTyp(v: unknown): v is ObservationTyp {
  return typeof v === 'string' && (OBSERVATION_TYPER as readonly string[]).includes(v);
}

export function arObservation(p: { kalla?: string | null } | null | undefined): boolean {
  return !!p && p.kalla === 'observation';
}

/**
 * Delar en rundas rader i planpunkter (plan, utforande, matning) och observationer.
 *
 * DET HAR ar stallet dar observationerna skiljs fran punkterna. Allt nedstroms - raknarna, serien,
 * avslutsknappen, oversikten - far bara `punkter`, och kan darfor inte rakna in dem av misstag.
 * Observationerna kommer i den ordning de gjordes (besvarad, aldst forst); id avgor lika tid.
 */
export function delaObservationer<T extends { kalla?: string | null; besvarad?: string | null; id: string }>(
  rader: T[],
): { punkter: T[]; observationer: T[] } {
  const punkter: T[] = [];
  const observationer: T[] = [];
  for (const r of rader) (arObservation(r) ? observationer : punkter).push(r);
  observationer.sort((a, b) => {
    const ta = a.besvarad ?? '';
    const tb = b.besvarad ?? '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return { punkter, observationer };
}

/** "Bra · Körspår" - tonen och typen i ord. Okand ton eller typ visas som den ar, aldrig som ett tomt falt. */
export function observationText(p: { status: string | null; avvikelse_typ: string | null }): string {
  const ton = arObservationTon(p.status) ? OBSERVATION_TON[p.status].etikett : (p.status ?? 'Okänd ton');
  const typ = arObservationTyp(p.avvikelse_typ) ? OBSERVATION_TYP_ETIKETT[p.avvikelse_typ] : (p.avvikelse_typ ?? 'Okänd typ');
  return `${ton} · ${typ}`;
}

export type SparKrav = {
  kan: boolean;
  /** Det forsta som saknas, sagt som en uppmaning. null nar allt finns. */
  saknas: string | null;
};

/**
 * Vad som kravs for att spara. EN regel som formularet och skrivningen delar, sa att knappen aldrig
 * kan vara aktiv for nagot skrivningen sedan avvisar.
 *
 * FOTOT AR OBLIGATORISKT VID AVVIKELSE och valfritt annars. Det kan inte vara en CHECK i databasen -
 * fotot ligger i egenkontroll_foto, en annan tabell - sa kravet vaktas har och i skapaObservation.
 * POSITIONEN kravs alltid (CHECK observation_ar_komplett), och den ar ett kvitto, aldrig inmatning.
 */
export function sparaKrav(i: {
  ton: ObservationTon | null;
  typ: ObservationTyp | null;
  antalFoton: number;
  harPosition: boolean;
}): SparKrav {
  if (!i.ton) return { kan: false, saknas: 'Välj om det är bra, kan bli bättre eller en avvikelse.' };
  if (!i.typ) return { kan: false, saknas: 'Välj vad det gäller.' };
  if (i.ton === 'avvikelse' && i.antalFoton < 1) return { kan: false, saknas: 'En avvikelse behöver ett foto.' };
  if (!i.harPosition) return { kan: false, saknas: 'Positionen saknas — hämta den innan du sparar.' };
  return { kan: true, saknas: null };
}

/** En position som duger: finita tal inom jordens granser. En NaN eller 0/0 far aldrig bli en observation. */
export function giltigPosition(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Ett nytt uuid for en observation, skapat FORE uppladdningen: bildens sokvag bar punktens id, och
 * bilden laddas upp fore raden. randomUUID finns i varje sakert sammanhang (PWA:n gar over https);
 * reserven ar for en aldre webblasare och for testmiljon, och duger lika bra som id - kollisionsrisken
 * ar densamma som for varje annat slumpat v4-id.
 */
export function nyttPunktId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
