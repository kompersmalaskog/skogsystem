// Liggetid: hur länge virket legat sedan sista avverkningsdagen. EN regel för
// listan och detaljvyn. Saknas datumet skrivs det ut ärligt, aldrig gissat.
// Klockan skickas in (nu i ms) så funktionen går att testa.

const DAG = 864e5;

// Kalenderdagar i svensk tid — aldrig avrundat på klockslaget (förut stod samma
// trakt som 23 dagar på morgonen och 24 på eftermiddagen).
function svenskDag(nu: number): string {
  return new Date(nu).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

export function liggetidDagar(sistaAvverkning: string, nu: number): number {
  const fran = Date.parse(sistaAvverkning.slice(0, 10));
  const till = Date.parse(svenskDag(nu));
  return Math.max(0, Math.round((till - fran) / DAG));
}

export function liggetidText(sistaAvverkning: string | null | undefined, nu: number): string {
  if (!sistaAvverkning) return 'avverkningsdatum saknas';
  const dag = liggetidDagar(sistaAvverkning, nu);
  const datum = new Date(sistaAvverkning).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  const man = dag >= 60 ? ` (${Math.round(dag / 30)} mån)` : '';
  return `avverkat ${datum} · legat ${dag} ${dag === 1 ? 'dag' : 'dgr'}${man}`;
}
