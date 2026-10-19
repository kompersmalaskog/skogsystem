/**
 * MÅNADENS ORDINARIE — övertid först när månadens ordinarie timmar är fyllda (Martins beslut 2026-10-19).
 *
 * Förut var ordinarie = antal ARBETADE dagar × 8: tre långa dagar (28,65 tim) gav 24 timlön + 4,65 övertid fast månaden var långt
 * ifrån full. Nu är ordinarie MÅNADENS timmar, så en förare får övertid först när hen arbetat mer än månaden rymmer:
 *
 *   ordinarie = vardagar i arbetsmånaden × 8
 *             − röda vardagar (helglön betalas för dem — avdrag alltid, också när dagen arbetades)
 *             − dagar med ALL frånvaro: semester, ATK, komp, sjuk, VAB, föräldraledig, tjänstledig, permission, inarbetad
 *             − vardagar före anställningsdatum
 *             − frånvarotimmarna på en deldag (halv dag sjuk/VAB: timmarna, inte hela dagen)
 *
 *   timlön = min(arbetad tid, ordinarie)       övertid = max(0, arbetad tid − ordinarie)       premien följer timlönetimmarna
 *
 * Arbetad tid = maskin + extra tid + kortpass + hemskickad tid (allt som betalas som arbetad tid). Facit: Oscar sep 2026 = 28,65 / 0,
 * Stefan jan 2026 = 160 timlön, Oskar jan 2026 = 160 timlön.
 *
 * En månad som överlappar förarens utjämningsperiod (Gävle: tabellen `utjamningsperiod`) behåller den gamla formeln
 * (arbetade dagar × 8) — den perioden följer sin egen beräkning. Då är `modell` 'utjamning' och modulen räknar inget.
 *
 * Rena funktioner, ingen databas. Datum är YYYY-MM-DD och räknas utan tidszon (UTC-dagar), aldrig toISOString på lokal tid.
 */

export const ORDINARIE_DAG_H = 8;

/** Frånvarorad så som lönemotorn får den (lib/franvaro). Klockslag = deldag. */
export type OrdinarieLedighet = { typ: string; startdatum: string; slutdatum: string; fran_tid?: string | null; till_tid?: string | null };

export type OrdinarieIndata = {
  /** Arbetsmånaden, YYYY-MM. */
  arbetsperiod: string;
  /** Röda vardagar i månaden ur avtalets lista — ALLA, oavsett om helglönen betalas (närvarokravet avgör lönen, inte ordinarie). */
  rodaDagar: string[];
  ledigheter: OrdinarieLedighet[];
  /** Dagar med arbetspass (arbetad_min > 0): en HELDAGS frånvarorad på en sådan dag är arbete, inte frånvaro. */
  arbetadeDatum: Set<string>;
  /** Deldagar (frånvaro från ett klockslag): bara timmarna tas bort. Hemskickad är ingen deldag här. */
  deldagar: { datum: string; timmar: number }[];
  /** medarbetare.anstallningsdatum. Saknas det kontrolleras inget. */
  anstallningsdatum: string | null;
};

export type OrdinarieResultat = {
  /** 'manad' = ny regel. 'utjamning' = månaden överlappar en utjämningsperiod och behåller arbetade dagar × 8. */
  modell: "manad" | "utjamning";
  /** Månadens ordinarie timmar (aldrig negativt). */
  timmar: number;
  /** Vardagar i månaden före några avdrag. */
  vardagar: number;
  /** Avdragna dagar, en gång var (röd dag går före anställning före frånvaro). */
  roda: string[];
  franvaro: string[];
  anstallning: string[];
  /** Timmar som en deldag tar bort (deldag på en redan avdragen dag räknas inte). */
  deldag_h: number;
};

const dt = (s: string) => new Date(s + "T00:00:00Z");
const isoUtc = (d: Date) => d.toISOString().slice(0, 10);
const arVardagUtc = (s: string) => { const w = dt(s).getUTCDay(); return w !== 0 && w !== 6; };

/** Månadens vardagar (mån–fre), i ordning. `ym` = YYYY-MM. */
export function vardagarIManad(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const ut: string[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) ut.push(isoUtc(d));
  }
  return ut;
}

const avrunda2 = (x: number) => Math.round(x * 100) / 100;

export function manadensOrdinarie(i: OrdinarieIndata): OrdinarieResultat {
  const vardagar = vardagarIManad(i.arbetsperiod);
  const iManaden = new Set(vardagar);

  const roda = [...new Set(i.rodaDagar)].filter(d => iManaden.has(d)).sort();
  const redan = new Set(roda);

  const anstallning = i.anstallningsdatum
    ? vardagar.filter(d => d < i.anstallningsdatum! && !redan.has(d))
    : [];
  for (const d of anstallning) redan.add(d);

  // Frånvaro: heldagsrader, en dag i taget. Deldagar (klockslag) och hemskickad (betald tid) är ingen heldagsfrånvaro.
  const franvaroSet = new Set<string>();
  for (const l of i.ledigheter) {
    if (!l.startdatum || !l.slutdatum) continue;
    if (String(l.typ || "").toLowerCase() === "hemskickad") continue;
    if (l.fran_tid || l.till_tid) continue;
    for (let d = dt(l.startdatum); isoUtc(d) <= l.slutdatum; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = isoUtc(d);
      if (!iManaden.has(iso) || redan.has(iso) || i.arbetadeDatum.has(iso)) continue; // helg/utanför/redan avdragen/arbete vinner
      franvaroSet.add(iso);
    }
  }
  const franvaro = [...franvaroSet].sort();
  for (const d of franvaro) redan.add(d);

  // Deldag: bara timmarna, och bara på en vardag som inte redan är avdragen (annars dras samma dag två gånger).
  let deldagH = 0;
  const deldagSedda = new Set<string>();
  for (const dd of i.deldagar) {
    if (!iManaden.has(dd.datum) || redan.has(dd.datum) || deldagSedda.has(dd.datum)) continue;
    deldagSedda.add(dd.datum);
    deldagH += Math.max(0, dd.timmar || 0);
  }

  const avdragna = roda.length + anstallning.length + franvaro.length;
  const timmar = Math.max(0, avrunda2((vardagar.length - avdragna) * ORDINARIE_DAG_H - deldagH));

  return { modell: "manad", timmar, vardagar: vardagar.length, roda, franvaro, anstallning, deldag_h: avrunda2(deldagH) };
}

/** Överlappar månaden (YYYY-MM) någon av förarens utjämningsperioder? Gränsdagarna räknas som överlapp. */
export function overlapparUtjamning(arbetsperiod: string, perioder: { startdatum: string; slutdatum: string }[]): boolean {
  const [y, m] = arbetsperiod.split("-").map(Number);
  const forsta = `${arbetsperiod}-01`;
  const sista = isoUtc(new Date(Date.UTC(y, m, 0)));
  return perioder.some(p => !!p.startdatum && !!p.slutdatum && p.startdatum <= sista && p.slutdatum >= forsta);
}

/** Resultat för en månad som följer utjämningsperioden: dagens formel, arbetade dagar × 8. */
export function utjamningOrdinarie(arbetsperiod: string, arbetadeDagar: number): OrdinarieResultat {
  return { modell: "utjamning", timmar: arbetadeDagar * ORDINARIE_DAG_H, vardagar: vardagarIManad(arbetsperiod).length, roda: [], franvaro: [], anstallning: [], deldag_h: 0 };
}

const fmtH = (h: number) => `${avrunda2(h)}h`;

/** Det avgörande i ord, så som det står i timlönens och övertidens beskrivning: "22 vardagar × 8h − 2 röda dagar − 1 frånvarodag − 4h deldag". */
export function ordinarieText(o: OrdinarieResultat): string {
  const delar = [`${o.vardagar} vardagar × ${ORDINARIE_DAG_H}h`];
  if (o.roda.length) delar.push(`${o.roda.length} ${o.roda.length === 1 ? "röd dag" : "röda dagar"}`);
  if (o.franvaro.length) delar.push(`${o.franvaro.length} ${o.franvaro.length === 1 ? "frånvarodag" : "frånvarodagar"}`);
  if (o.anstallning.length) delar.push(`${o.anstallning.length} ${o.anstallning.length === 1 ? "dag" : "dagar"} före anställning`);
  if (o.deldag_h > 0) delar.push(fmtH(o.deldag_h) + " deldag");
  return delar.join(" − ");
}
