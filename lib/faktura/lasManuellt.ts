// Debiterbart arbete ur arbetsrapporten för EN trakt.
//
// FÄLLAN (utredning mot prod 2026-10-24): extra_tid.objekt_id är TEXT och bär
// ett VO-nummer — men inte alltid traktens eget. Tre av fem trakter med
// debiterbart arbete nås BARA via objekt_alt_nummer:
//   11166440 → Bågskyttebanan (11271849) · 11161397 → Skälviken (11271860)
//   11166477 → Mölleryd (11271883)
// En koppling på objekt.vo_nummer ensamt tappar 2 034 av 2 687 minuter tyst —
// samma felklass som dim_objekt_id, fran_objekt_id och matched_objekt_id, där
// bryggan fanns som kolumn men var tom. Därför läses ALLA traktens nummer.
import type { serverKlient } from './lasOversikt';

export type ManuellPost = {
  datum: string
  forare: string
  aktivitet: string
  minuter: number
  kommentar: string | null
}

export type ManuelltArbete = { poster: ManuellPost[]; timmar: number }

const AKTIVITET: Record<string, string> = {
  manuellt: 'Manuell fällning',
  planering: 'Planering',
  flytt: 'Flytt',
  markagare: 'Markägarkontakt',
};

/** Alla nummer som pekar på samma trakt: traktens eget plus dess extranummer. */
export async function traktensNummer(
  sb: Awaited<ReturnType<typeof serverKlient>>,
  vo: string,
): Promise<string[]> {
  const nummer = new Set<string>([vo]);
  const { data: objekt } = await sb.from('objekt').select('id').eq('vo_nummer', vo).limit(1);
  const id = objekt?.[0]?.id;
  if (id) {
    const { data: alt } = await sb.from('objekt_alt_nummer').select('nummer').eq('objekt_id', id);
    for (const r of alt ?? []) if (r.nummer) nummer.add(String(r.nummer));
  }
  return [...nummer];
}

export async function lasManuelltArbete(
  sb: Awaited<ReturnType<typeof serverKlient>>,
  vo: string,
): Promise<ManuelltArbete | null> {
  const nummer = await traktensNummer(sb, vo);
  const { data, error } = await sb
    .from('extra_tid')
    .select('datum, minuter, aktivitet_typ, aktivitet_text, kommentar, medarbetare:medarbetare_id(namn)')
    .eq('debiterbar', true)
    .in('objekt_id', nummer)
    .order('datum');
  // Ett läsfel här får inte fälla trakten: raderna uteblir och priset påverkas
  // inte (det manuella prissätts inte av radbyggaren än ändå).
  if (error || !data || data.length === 0) return null;

  const poster: ManuellPost[] = data.map(r => {
    const m = r.medarbetare as unknown as { namn?: string } | { namn?: string }[] | null;
    const namn = Array.isArray(m) ? m[0]?.namn : m?.namn;
    return {
      datum: String(r.datum),
      forare: (namn ?? 'okänd').split(' ')[0],
      aktivitet: r.aktivitet_text
        || AKTIVITET[String(r.aktivitet_typ ?? '')]
        || String(r.aktivitet_typ ?? 'Arbete'),
      minuter: Number(r.minuter) || 0,
      kommentar: r.kommentar ? String(r.kommentar) : null,
    };
  });
  const minuter = poster.reduce((s, p) => s + p.minuter, 0);
  return { poster, timmar: Math.round((minuter / 60) * 100) / 100 };
}
