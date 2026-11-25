/**
 * Månadens arbetade timmar i Min tid › Översikt (raden "November").
 *
 * Talet är lönemotorns uppställning `arbetat` (maskin + extra tid + kortpass +
 * hemskickad) — samma tal som Lön och Förare · Månad räknar ihop. Förut stod här
 * timlön + övertid, och en företagsledare får inga lönerader (löntalen är 0), så
 * raden sa "0 tim" fast Lön och Kalender visade 49 tim (Martin 2026-11-25).
 *
 * För en vanlig förare är det samma tal som förut: timlön + övertid = arbetad tid.
 * Saknas `arbetat` i svaret (äldre server) gäller timlön + övertid.
 * Ingen rad = null: raden visar "Se lönespecen", aldrig en påhittad nolla.
 */
export function manadTimmar(m: any): number | null {
  if (!m) return null;
  const a = m.arbetat;
  if (a) {
    const min = (Number(a.maskin_min) || 0) + (Number(a.extra_min) || 0) + (Number(a.kortpass_min) || 0) + (Number(a.hemskickad_min) || 0);
    return min / 60;
  }
  return (Number(m.timlon_h) || 0) + (Number(m.overtid_h) || 0);
}
