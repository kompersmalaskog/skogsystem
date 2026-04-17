/**
 * Löneexport-beräkning för Fortnox.
 *
 * Skickar ANTAL (timmar, veckor, mil) + löneartkod.
 * Fortnox multiplicerar med sats per anställd.
 *
 * Löneartkoder:
 *   Gemensamma: 11 timlön, 136 vältlappar, 821 färdtidsersättning
 *   Skördare:   1355 premielön, 1435 övertid betald 4
 *   Skotare:    1354 premielön 1, 1436 övertid betald 5
 */

type ArbetsdagInput = {
  datum: string;        // YYYY-MM-DD
  arbetad_min: number;
  maskin_id: string | null;
  km_totalt: number | null;
  bekraftad: boolean | null;
};

type MaskinTypMap = Record<string, "skordare" | "skotare">;

export type FortnoxRad = {
  EmployeeId: string;
  SalaryCode: string;
  Number: string;     // antal (timmar, veckor, mil) — Fortnox multiplicerar med sats
  Date: string;        // YYYY-MM-DD
  beskrivning: string; // intern — skickas inte till Fortnox
};

export type ExportSammanfattning = {
  medarbetare_id: string;
  namn: string;
  anstallningsnummer: string;
  rader: FortnoxRad[];
  varningar: string[];
  timlon_h: number;
  premielon_skordare_h: number;
  premielon_skotare_h: number;
  overtid_h: number;
  valtlappar_veckor: number;
  kor_mil: number;
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

function måndag(d: Date): string {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - ((day + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

export function beräknaExport(
  medarbetareId: string,
  namn: string,
  anstallningsnummer: string,
  dagar: ArbetsdagInput[],
  maskinTypMap: MaskinTypMap,
  period: string, // YYYY-MM
): ExportSammanfattning {
  const periodStart = period + "-01";
  const varningar: string[] = [];
  const rader: FortnoxRad[] = [];

  if (!anstallningsnummer) {
    varningar.push("Anställningsnummer saknas — kan inte skicka till Fortnox.");
  }

  const eid = anstallningsnummer || "SAKNAS";

  // ── 1. TIMLÖN (kod 11) ──
  let totalH = 0;
  let skordareH = 0;
  let skotareH = 0;

  for (const d of dagar) {
    const h = (d.arbetad_min || 0) / 60;
    totalH += h;
    const typ = d.maskin_id ? maskinTypMap[d.maskin_id] : null;
    if (typ === "skordare") skordareH += h;
    else if (typ === "skotare") skotareH += h;
    else {
      // Okänd maskintyp — räkna som timlön men varna
      if (d.maskin_id) varningar.push(`Dag ${d.datum}: maskin_id ${d.maskin_id} saknar typ i maskiner-tabellen.`);
    }
    if (!d.bekraftad) varningar.push(`Dag ${d.datum}: ej bekräftad.`);
  }

  totalH = Math.round(totalH * 100) / 100;
  skordareH = Math.round(skordareH * 100) / 100;
  skotareH = Math.round(skotareH * 100) / 100;

  if (totalH > 0) {
    rader.push({ EmployeeId: eid, SalaryCode: "11", Number: totalH.toFixed(2), Date: periodStart, beskrivning: `Timlön ${period}` });
  }

  // ── 2. PREMIELÖN (kod 1354/1355) ──
  if (skordareH > 0) {
    rader.push({ EmployeeId: eid, SalaryCode: "1355", Number: skordareH.toFixed(2), Date: periodStart, beskrivning: `Premielön skördare ${period}` });
  }
  if (skotareH > 0) {
    rader.push({ EmployeeId: eid, SalaryCode: "1354", Number: skotareH.toFixed(2), Date: periodStart, beskrivning: `Premielön skotare ${period}` });
  }

  // ── 3. ÖVERTID per vecka (kod 1435/1436) ──
  // Gruppera per ISO-vecka
  const veckor = new Map<number, { dagar: ArbetsdagInput[]; monday: string }>();
  for (const d of dagar) {
    const dt = new Date(d.datum);
    const v = isoVecka(dt);
    if (!veckor.has(v)) veckor.set(v, { dagar: [], monday: måndag(dt) });
    veckor.get(v)!.dagar.push(d);
  }

  let totalOvertidH = 0;
  for (const [vecka, { dagar: vDagar, monday }] of veckor) {
    // Daglig övertid: sum(max(0, h - 8)) per dag
    const dagligOt = vDagar.reduce((s, d) => s + Math.max(0, (d.arbetad_min || 0) / 60 - 8), 0);
    // Veckovis övertid: max(0, sum(h) - 38)
    const veckoTotal = vDagar.reduce((s, d) => s + (d.arbetad_min || 0) / 60, 0);
    const veckovisOt = Math.max(0, veckoTotal - 38);
    // Använd max (det som ger mest enligt avtalet)
    const övertid = Math.round(Math.max(dagligOt, veckovisOt) * 100) / 100;

    if (övertid > 0) {
      totalOvertidH += övertid;
      // Dominant maskintyp denna vecka
      let vSkordare = 0, vSkotare = 0;
      for (const d of vDagar) {
        const typ = d.maskin_id ? maskinTypMap[d.maskin_id] : null;
        if (typ === "skordare") vSkordare += d.arbetad_min || 0;
        else vSkotare += d.arbetad_min || 0;
      }
      const overtidKod = vSkordare >= vSkotare ? "1435" : "1436";
      rader.push({
        EmployeeId: eid,
        SalaryCode: overtidKod,
        Number: övertid.toFixed(2),
        Date: monday,
        beskrivning: `Övertid v${vecka} (${övertid.toFixed(1)}h, ${overtidKod === "1435" ? "skördare" : "skotare"})`,
      });
    }
  }

  // ── 4. VÄLTLAPPAR (kod 136): 1 timme per vecka med minst 1 arbetsdag ──
  const vältVeckor = veckor.size;
  if (vältVeckor > 0) {
    rader.push({
      EmployeeId: eid,
      SalaryCode: "136",
      Number: vältVeckor.toFixed(0),
      Date: periodStart,
      beskrivning: `Vältlappar mm: ${vältVeckor} veckor`,
    });
  }

  // ── 5. KÖRERSÄTTNING (kod 821): mil över 60 km/dag ──
  let totalMil = 0;
  for (const d of dagar) {
    const km = d.km_totalt || 0;
    if (km > 60) {
      totalMil += (km - 60) * 2 / 10;
    }
  }
  totalMil = Math.round(totalMil * 100) / 100;
  if (totalMil > 0) {
    rader.push({
      EmployeeId: eid,
      SalaryCode: "821",
      Number: totalMil.toFixed(2),
      Date: periodStart,
      beskrivning: `Färdtidsersättning skattefri: ${totalMil.toFixed(1)} mil`,
    });
  }

  return {
    medarbetare_id: medarbetareId,
    namn,
    anstallningsnummer,
    rader,
    varningar,
    timlon_h: totalH,
    premielon_skordare_h: skordareH,
    premielon_skotare_h: skotareH,
    overtid_h: Math.round(totalOvertidH * 100) / 100,
    valtlappar_veckor: vältVeckor,
    kor_mil: totalMil,
  };
}
