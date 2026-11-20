// "Hämtas siffrorna från Fortnox?" — svaret överst i ekonomins Inställningar.
// Ja bara när både verifikat och fakturor hämtats de senaste 3 dygnen och
// senaste körningen inte misslyckades. En död synk ska synas här, inte
// upptäckas efter månader.

export type SynkStatus = {
  last_success_at: string | null;
  invoice_last_sync_at: string | null;
  last_status: string | null; // 'ok' | 'pågår' | 'fel' | 'avbruten'
} | 'fel' | null;

export const SYNK_LARM_DYGN = 3;

const DAG = 86400000;
const dygnSedan = (iso: string, nu: Date) => Math.floor((nu.getTime() - new Date(iso).getTime()) / DAG);

/** "i dag" / "i går" / "4 aug" (svensk tid). */
export function nar(iso: string, nu: Date): string {
  const tz = { timeZone: 'Europe/Stockholm' } as const;
  const dag = (d: Date) => d.toLocaleDateString('sv-SE', tz);
  if (dag(new Date(iso)) === dag(nu)) return 'i dag';
  if (dag(new Date(iso)) === dag(new Date(nu.getTime() - DAG))) return 'i går';
  return new Date(iso).toLocaleDateString('sv-SE', { ...tz, day: 'numeric', month: 'short' }).replace('.', '');
}

export function synkSvar(synk: SynkStatus, nu: Date): { svar: string; under: string; vantar: string | null } {
  if (synk === null) return { svar: '…', under: 'Läser…', vantar: null };
  if (synk === 'fel') return { svar: 'Vet inte', under: 'Kunde inte läsa när Fortnox senast hämtades', vantar: null };
  const delar = [
    { namn: 'Verifikat', iso: synk.last_success_at },
    { namn: 'Fakturor', iso: synk.invoice_last_sync_at },
  ];
  const aldrig = delar.filter(d => !d.iso);
  if (aldrig.length) {
    return { svar: 'Nej', under: `${aldrig.map(d => d.namn).join(' och ')} har aldrig hämtats`, vantar: null };
  }
  // Den äldsta avgör: hämtas den ena men inte den andra är svaret ändå nej.
  const aldst = delar.reduce((a, b) => (new Date(a.iso!) < new Date(b.iso!) ? a : b));
  const dygn = dygnSedan(aldst.iso!, nu);
  const misslyckad = synk.last_status === 'fel' || synk.last_status === 'avbruten';
  if (dygn > SYNK_LARM_DYGN) {
    return { svar: 'Nej', under: `${aldst.namn} hämtades senast ${nar(aldst.iso!, nu)} — ${dygn} dygn sedan`, vantar: misslyckad ? 'Senaste försöket misslyckades' : null };
  }
  if (misslyckad) return { svar: 'Nej', under: `Senaste försöket misslyckades. Senast hämtat ${nar(aldst.iso!, nu)}`, vantar: null };
  return { svar: 'Ja', under: `Senast hämtat ${nar(aldst.iso!, nu)}`, vantar: null };
}
