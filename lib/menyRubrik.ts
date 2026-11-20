// Rubriken i planeringsvyns meny-ark (menuOpen): en rad per kategori som arket kan öppnas på. Förut låg listan som `menuCategories` i page.tsx
// tillsammans med fem poster som ingen kunde nå (checklist, prognos, info, briefing, briefing-checklist) och en icke-anropad `openMenu`;
// bara `.name` användes, till rubriken. En kategori utan post ger tom rubrik — `lib/menyRubrik.test.ts` läser page.tsx och larmar om någon saknas.

export const MENY_KATEGORIER = [
  { id: 'lines', name: 'Linjer' },
  { id: 'zones', name: 'Zoner' },
  { id: 'arrows', name: 'Pilar' },
  { id: 'gallring', name: 'Gallring' },
  { id: 'settings', name: 'Inställningar' },
  { id: 'brandrisk', name: 'Brandrisk' },
  { id: 'skotning', name: 'Skotning' },
] as const;

export type MenyKategoriId = typeof MENY_KATEGORIER[number]['id'];

/** Rubriken: undermenyn först (GPS/manuell har egna ord), annars kategorins namn, annars "Meny". Aldrig tom. */
export function menyRubrik(subMenu: string | null, activeCategory: string | null): string {
  if (subMenu) return subMenu === 'gps-lines' ? 'Spåra med GPS' : subMenu === 'draw-lines' ? 'Rita manuellt' : subMenu;
  if (activeCategory) return MENY_KATEGORIER.find((c) => c.id === activeCategory)?.name ?? 'Meny';
  return 'Meny';
}
