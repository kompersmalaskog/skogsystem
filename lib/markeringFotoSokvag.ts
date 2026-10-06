// Rena helpers för markeringsfotons Storage-sökvägar. INGEN supabase-import: delas av appen
// (lib/markeringFoto.ts) och migreringsskriptet (scripts/migrera-markering-foton.ts), så att
// sökvägsformatet har EN källa.

export const MARKERING_FOTO_BUCKET = 'markering-foton';

/** Har markeringen ett foto — i Storage (photoPath) eller kvar inbäddat (photoData)? */
export function harFoto(m: { photoPath?: string | null; photoData?: string | null } | null | undefined): boolean {
  return !!(m && (m.photoPath || m.photoData));
}

const sakraSegment = (s: string | number) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * Sökväg i bucketen: {objekt_id}/{marker_id}.jpg — ETT foto per markering. Ett omtag skriver
 * över filen (upsert), så inga föräldralösa äldre versioner samlas.
 */
export function byggFotoSokvag(objektId: string | number, markerId: string | number): string {
  return `${sakraSegment(objektId)}/${sakraSegment(markerId)}.jpg`;
}

/** Ligger sökvägen i just detta objekts mapp? (vakt mot att radera en annan trakts fil) */
export function arMarkeringFotoSokvagFor(objektId: string | number, sokvag: string): boolean {
  return sokvag.startsWith(`${sakraSegment(objektId)}/`) && !sokvag.includes('..') && sokvag.split('/').length === 2;
}
