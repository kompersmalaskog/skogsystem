/**
 * Löneexport-beräkning för Fortnox.
 *
 * VIKTIGT: Löneperiod i Fortnox ligger en månad efter arbetstiden.
 * Löneperiod mars 2026 = arbetstid februari 2026.
 * Funktionen arbetar med "arbetsperiod" (YYYY-MM) — anroparen
 * ansvarar för att skicka rätt arbetsperiod baserat på vald löneperiod.
 *
 * Skickar ANTAL (timmar, veckor, mil) + löneartkod.
 * Fortnox multiplicerar med sats per anställd.
 *
 * Löneartkoder:
 *   Gemensamma: 11 timlön, 136 vältlappar, 821 färdtidsersättning
 *   Skördare:   1355 premielön, 1435 övertid betald 4
 *   Skotare:    1354 premielön 1, 1436 övertid betald 5
 *
 * Övertid:
 *   Ordinarie tid = antal arbetsdagar × 8h
 *   Övertid = totalt jobbat - ordinarie
 *   Timlön = ordinarie (inte totalt!)
 *   En rad per månad med Date = löneperiodens första dag.
 */

type ArbetsdagInput = {
  datum: string;        // YYYY-MM-DD
  arbetad_min: number;
  maskin_id: string | null;
  km_totalt: number | null;
  bekraftad: boolean | null;
  dagtyp: string | null;
};

type MaskinTypMap = Record<string, "skordare" | "skotare">;

export type FortnoxRad = {
  EmployeeId: string;
  SalaryCode: string;
  Number: string;     // antal — Fortnox multiplicerar med sats
  Date: string;        // YYYY-MM-DD (löneperiodens 1:a)
  beskrivning: string; // intern — skickas inte till Fortnox
};

export type ExportSammanfattning = {
  medarbetare_id: string;
  namn: string;
  anstallningsnummer: string;
  rader: FortnoxRad[];
  varningar: string[];
  arbetsdagar: number;
  ordinarie_h: number;
  timlon_h: number;
  premielon_skordare_h: number;
  premielon_skotare_h: number;
  overtid_h: number;
  valtlappar_veckor: number;
  kor_mil: number;
  obekraftade: number;
};

function isoVecka(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
}

/**
 * Beräkna arbetsperiod (månad bakåt) från löneperiod.
 * Löneperiod "2026-03" → arbetsperiod "2026-02".
 */
export function arbetsperiodFrånLöneperiod(loneperiod: string): string {
  const [å, m] = loneperiod.split("-").map(Number);
  const d = new Date(å, m - 2, 1); // m-1 = löneperiod (0-indexed), minus 1 = föregående
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function beräknaExport(
  medarbetareId: string,
  namn: string,
  anstallningsnummer: string,
  dagar: ArbetsdagInput[],
  maskinTypMap: MaskinTypMap,
  loneperiod: string,  // YYYY-MM — löneperioden (en månad efter arbetstiden)
): ExportSammanfattning {
  const loneperiodStart = loneperiod + "-01"; // Date på Fortnox-transaktionerna
  const varningar: string[] = [];
  const rader: FortnoxRad[] = [];

  if (!anstallningsnummer) {
    varningar.push("Anställningsnummer saknas — kan inte skicka till Fortnox.");
  }

  const eid = anstallningsnummer || "SAKNAS";

  // Filtrera bort frånvarodagar (sjuk, semester, vab, atk)
  const FRANVARO = new Set(["sjuk", "semester", "vab", "atk"]);
  const produktionsDagar = dagar.filter(d => !d.dagtyp || !FRANVARO.has(d.dagtyp));
  const antalArbetsdagar = produktionsDagar.length;
  const ordinarie = antalArbetsdagar * 8; // timmar

  // Räkna obekräftade
  let obekraftade = 0;

  // Timmar per maskintyp
  let totalH = 0;
  let skordareH = 0;
  let skotareH = 0;

  for (const d of produktionsDagar) {
    const h = (d.arbetad_min || 0) / 60;
    totalH += h;
    const typ = d.maskin_id ? maskinTypMap[d.maskin_id] : null;
    if (typ === "skordare") skordareH += h;
    else if (typ === "skotare") skotareH += h;
    else if (d.maskin_id) {
      varningar.push(`Dag ${d.datum}: maskin ${d.maskin_id} saknar typ.`);
    }
    if (!d.bekraftad) obekraftade++;
  }

  totalH = Math.round(totalH * 100) / 100;
  skordareH = Math.round(skordareH * 100) / 100;
  skotareH = Math.round(skotareH * 100) / 100;

  // Övertid = totalt - ordinarie
  const overtidH = Math.round(Math.max(0, totalH - ordinarie) * 100) / 100;

  // Timlön = ordinarie (inte totalt!)
  // Premielön = ordinarie fördelat per maskintyp proportionellt
  const timlonH = Math.round(Math.min(totalH, ordinarie) * 100) / 100;
  const premieSkordare = totalH > 0 ? Math.round(timlonH * (skordareH / totalH) * 100) / 100 : 0;
  const premieSkotare = totalH > 0 ? Math.round(timlonH * (skotareH / totalH) * 100) / 100 : 0;

  // ── 1. TIMLÖN (kod 11) ──
  if (timlonH > 0) {
    rader.push({ EmployeeId: eid, SalaryCode: "11", Number: timlonH.toFixed(2), Date: loneperiodStart, beskrivning: `Timlön: ${timlonH}h ordinarie (${antalArbetsdagar} dagar × 8h)` });
  }

  // ── 2. PREMIELÖN (kod 1354/1355) — fördelat proportionellt ──
  if (premieSkordare > 0) {
    rader.push({ EmployeeId: eid, SalaryCode: "1355", Number: premieSkordare.toFixed(2), Date: loneperiodStart, beskrivning: `Premielön skördare: ${premieSkordare}h` });
  }
  if (premieSkotare > 0) {
    rader.push({ EmployeeId: eid, SalaryCode: "1354", Number: premieSkotare.toFixed(2), Date: loneperiodStart, beskrivning: `Premielön skotare: ${premieSkotare}h` });
  }

  // ── 3. ÖVERTID (kod 1435/1436) — en rad per månad ──
  if (overtidH > 0) {
    // Dominant maskintyp för hela perioden
    const overtidKod = skordareH >= skotareH ? "1435" : "1436";
    rader.push({
      EmployeeId: eid,
      SalaryCode: overtidKod,
      Number: overtidH.toFixed(2),
      Date: loneperiodStart,
      beskrivning: `Övertid: ${overtidH}h (${totalH}h totalt - ${ordinarie}h ordinarie)`,
    });
  }

  // ── 4. VÄLTLAPPAR (kod 136): antal veckor med minst 1 arbetsdag ──
  const veckor = new Set<number>();
  for (const d of produktionsDagar) veckor.add(isoVecka(new Date(d.datum)));
  const vältVeckor = veckor.size;
  if (vältVeckor > 0) {
    rader.push({
      EmployeeId: eid, SalaryCode: "136", Number: vältVeckor.toFixed(0),
      Date: loneperiodStart, beskrivning: `Vältlappar: ${vältVeckor} veckor`,
    });
  }

  // ── 5. KÖRERSÄTTNING (kod 821): mil över 60 km/dag ──
  let totalMil = 0;
  for (const d of produktionsDagar) {
    const km = d.km_totalt || 0;
    if (km > 60) totalMil += (km - 60) * 2 / 10;
  }
  totalMil = Math.round(totalMil * 100) / 100;
  if (totalMil > 0) {
    rader.push({
      EmployeeId: eid, SalaryCode: "821", Number: totalMil.toFixed(2),
      Date: loneperiodStart, beskrivning: `Färdtidsersättning: ${totalMil} mil`,
    });
  }

  // Obekräftade varning
  if (obekraftade > 0) {
    varningar.push(`${obekraftade} av ${antalArbetsdagar} dagar är ej bekräftade.`);
  }

  return {
    medarbetare_id: medarbetareId,
    namn,
    anstallningsnummer,
    rader,
    varningar,
    arbetsdagar: antalArbetsdagar,
    ordinarie_h: ordinarie,
    timlon_h: timlonH,
    premielon_skordare_h: premieSkordare,
    premielon_skotare_h: premieSkotare,
    overtid_h: overtidH,
    valtlappar_veckor: vältVeckor,
    kor_mil: totalMil,
    obekraftade,
  };
}
