// === Enda källan för zonfärger (zoneType → hex) ===
// Färgen kommer ur FÄRGGRUPPEN (lib/larm/grupper): Blött = Blå, Brant och Ej framkomlig = Röd, Hänsyn = Grön, Kulturmiljö och Fornlämning = Brun.
// Delas av app/planering/page.tsx (zoneTypes), app/planering/TraktBriefing.tsx, egenkontrollkartan och A4-rapporten så att kartans zoner och
// förarens briefing aldrig kan drifta isär. Kulturmiljö och Fornlämning har samma brun: namnet står i ytan (zone-label), inte färgen.
import { GRUPPER, YTA } from './larm/grupper';

export const ZONE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(YTA).map(([typ, d]) => [typ, GRUPPER[d.grupp].farg]),
);
