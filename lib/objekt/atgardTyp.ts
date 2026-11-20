// Åtgärd -> traktyp för översiktslistans filter. Martins mappning: Au/Rp/Lrk = Slutavverkning, Gallring = Gallring; allt annat avgörs av
// objektets typ-fält (typ läses ur filen vid import).
//
// Au/Rp/Lrk är AVTALSFORMER (objekt.avtalsform sedan 20261014125836), men äldre rader har dem kvar i åtgärden och gäller därför fortfarande här.
// Nya importer lämnar åtgärden tom eller sätter Första gallring/Gallring/Föryngring — alla landar rätt via typ-fältet.
const SLUTAVV_ATGARDER = new Set(['au', 'rp', 'lrk']);

export function klassaObjektTyp(atgard: string | null | undefined, typ: string | null | undefined): 'slutavverkning' | 'gallring' {
  const a = (atgard || '').trim().toLowerCase();
  if (SLUTAVV_ATGARDER.has(a)) return 'slutavverkning';
  if (a === 'gallring') return 'gallring';
  return typ === 'slutavverkning' ? 'slutavverkning' : 'gallring';
}
