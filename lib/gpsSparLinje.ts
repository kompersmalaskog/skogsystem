// SPÅRA MED GPS — hur den ritade linjen följer positionen (Martin 2026-11-02: "börjar 20 m bredvid mig och slutar före där jag står").
//
// Tre regler, alla rena funktioner så de går att pröva utan karta:
//  1. Startpunkten räknas ur SAMMA position som resten av linjen (lat/lon → kartkoordinater). Förut togs x/y från den utjämnade
//     pricken medan lat/lon togs från GPS:en — de två låg olika, och hela linjen förskjöts med skillnaden.
//  2. Linjen jämnas ut över högst GPS_LINJE_MEDEL positioner (förut 20: linjen släpade 10–15 m efter vid gångfart).
//     Telefonens position är redan filtrerad (lib/telefonGps), maskindatorns serial-GPS är det inte — 3 punkter räcker för båda.
//  3. När spårningen avslutas läggs den senaste riktiga positionen till som sista punkt, så linjen går ända fram till där man står.

export interface P { x: number; y: number }

/** Hur många positioner linjen jämnas ut över. */
export const GPS_LINJE_MEDEL = 3;

/** Lägg till en position i historiken (högst `n` sparas) och ge medelvärdet. */
export function medelAvSenaste(historik: readonly P[], ny: P, n: number = GPS_LINJE_MEDEL): { historik: P[]; medel: P } {
  const h = [...historik.slice(-(n - 1)), ny];
  const medel = { x: h.reduce((s, p) => s + p.x, 0) / h.length, y: h.reduce((s, p) => s + p.y, 0) / h.length };
  return { historik: h, medel };
}

/** Linjen vid Klar: den senaste riktiga positionen läggs till sist om den ligger minst `minAvstand` från linjens sista punkt. */
export function avslutaMedPosition(linje: readonly P[], position: P | null | undefined, minAvstand: number): P[] {
  if (!position || linje.length === 0) return [...linje];
  const sista = linje[linje.length - 1];
  const d = Math.hypot(position.x - sista.x, position.y - sista.y);
  return d >= minAvstand ? [...linje, position] : [...linje];
}
