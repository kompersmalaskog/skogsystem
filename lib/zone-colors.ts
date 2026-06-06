// === Enda källan för zonfärger (zoneType → hex) ===
// Delas av app/planering/page.tsx (zoneTypes) och app/planering/TraktBriefing.tsx
// (checklist-ikoner/rader) så att kartans zoner och förarens briefing aldrig kan
// drifta isär. Värdena är identiska med motsvarande LEGEND-palettnyckel i page.tsx
// (wet=vatten, steep=brant, protected=naturvard, culture=kultur, noentry=fara,
// fornlamning=fornlamning) — LEGEND äger den bredare multifunktionspaletten,
// denna modul äger zoneType→färg-avbildningen.
export const ZONE_COLORS: Record<string, string> = {
  wet:         '#3b82f6', // blå        – blött
  steep:       '#a855f7', // lila       – brant
  protected:   '#30d158', // grön       – naturvård
  culture:     '#f59e0b', // ljus amber – kulturmiljö
  noentry:     '#ff453a', // röd        – ej framkomlig
  fornlamning: '#b45309', // mörk amber – fornlämning (starkt lagskydd)
};
