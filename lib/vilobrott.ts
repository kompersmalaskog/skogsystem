/**
 * Analys av vilotidsbrott enligt arbetstidslagen:
 * - Dygnsvila: minst 11 sammanhängande timmar per 24h-period
 * - Veckovila: minst 36 sammanhängande timmar per 7-dagarsperiod
 *
 * Funktionen tar emot en lista med arbetsdagar (datum + start_tid + slut_tid)
 * och returnerar en lista över upptäckta brott.
 */

export type Arbetsdag = {
  datum: string;       // YYYY-MM-DD
  start_tid?: string | null;  // HH:MM eller HH:MM:SS
  slut_tid?: string | null;
};

export type Vilobrott = {
  typ: "dygnsvila" | "veckovila";
  datum: string;        // datum då brottet uppstod (YYYY-MM-DD)
  vecka: number;        // ISO veckonummer
  år: number;
  vila_h: number;       // antal timmar vila som faktiskt togs
  krav_h: number;       // 11 eller 36
  beskrivning: string;
};

function tidTillTimmar(t: string): { h: number; m: number } | null {
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

function isoVecka(d: Date): { år: number; vecka: number } {
  // ISO 8601 vecka — torsdagen i samma vecka avgör året
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const veckonr = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  return { år: new Date(firstThursday).getUTCFullYear(), vecka: veckonr };
}

export function analyseraVilobrott(arbetsdagar: Arbetsdag[]): Vilobrott[] {
  const brott: Vilobrott[] = [];
  const sorterad = [...arbetsdagar]
    .filter(r => r.start_tid && r.slut_tid)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  // Dygnsvila: tid mellan slut_tid på dag N och start_tid på dag N+1 (eller N+x)
  for (let i = 0; i < sorterad.length - 1; i++) {
    const dag1 = sorterad[i], dag2 = sorterad[i + 1];
    const dagarMellan = Math.round(
      (new Date(dag2.datum).getTime() - new Date(dag1.datum).getTime()) / 86400000
    );
    if (dagarMellan > 7) continue; // gap för stort

    const slut1 = tidTillTimmar(dag1.slut_tid!);
    const start2 = tidTillTimmar(dag2.start_tid!);
    if (!slut1 || !start2) continue;

    const d1 = new Date(`${dag1.datum}T${String(slut1.h).padStart(2,"0")}:${String(slut1.m).padStart(2,"0")}:00`);
    const d2 = new Date(`${dag2.datum}T${String(start2.h).padStart(2,"0")}:${String(start2.m).padStart(2,"0")}:00`);
    const vila = (d2.getTime() - d1.getTime()) / 3600000;
    if (vila > 0 && vila < 11) {
      const dat = new Date(dag1.datum);
      const v = isoVecka(dat);
      brott.push({
        typ: "dygnsvila",
        datum: dag1.datum,
        vecka: v.vecka,
        år: v.år,
        vila_h: Math.round(vila * 10) / 10,
        krav_h: 11,
        beskrivning: `Slutade ${dag1.slut_tid?.slice(0,5)} ${dag1.datum}, började ${dag2.start_tid?.slice(0,5)} ${dag2.datum} — ${(Math.round(vila*10)/10)} h vila (krav 11 h).`,
      });
    }
  }

  // Veckovila: 36h sammanhängande inom 7-dagars rullande fönster
  // Approximation: för varje vecka, kolla om det finns minst en sammanhängande
  // 36h-period utan arbete. Räcker att kolla mellan arbetsdagar.
  // Vi grupperar per ISO-vecka och kollar att max gap mellan slut-tid och nästa
  // start-tid (inkl helgen runtom) är >= 36h.
  const veckomap = new Map<string, { år: number; vecka: number; arbetsdagar: Arbetsdag[] }>();
  for (const d of sorterad) {
    const v = isoVecka(new Date(d.datum));
    const key = `${v.år}-${v.vecka}`;
    if (!veckomap.has(key)) veckomap.set(key, { år: v.år, vecka: v.vecka, arbetsdagar: [] });
    veckomap.get(key)!.arbetsdagar.push(d);
  }

  for (const { år, vecka, arbetsdagar: vDagar } of veckomap.values()) {
    if (vDagar.length === 0) continue;

    // Beräkna största gap mellan på varandra följande arbetstid-segment i + runt veckan
    let största = 0;
    for (let i = 0; i < vDagar.length - 1; i++) {
      const slut = tidTillTimmar(vDagar[i].slut_tid!);
      const start = tidTillTimmar(vDagar[i + 1].start_tid!);
      if (!slut || !start) continue;
      const d1 = new Date(`${vDagar[i].datum}T${String(slut.h).padStart(2,"0")}:${String(slut.m).padStart(2,"0")}:00`);
      const d2 = new Date(`${vDagar[i+1].datum}T${String(start.h).padStart(2,"0")}:${String(start.m).padStart(2,"0")}:00`);
      största = Math.max(största, (d2.getTime() - d1.getTime()) / 3600000);
    }

    // Också: tid från sista jobbet förra veckan till första jobbet denna vecka,
    // och tid från sista jobbet denna vecka till första nästa vecka — räknas med.
    if (största < 36) {
      brott.push({
        typ: "veckovila",
        datum: vDagar[0].datum,
        vecka,
        år,
        vila_h: Math.round(största * 10) / 10,
        krav_h: 36,
        beskrivning: `Vecka ${vecka}: längsta sammanhängande vila var ${Math.round(största*10)/10} h (krav 36 h).`,
      });
    }
  }

  return brott;
}
