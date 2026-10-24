/**
 * OBJEKT-FLIKENS LISTA — sökning, sortering och grupperna Under kravet / Godkända / För tunt underlag.
 * Flyttat ur app/kalibrering/page.tsx, oförändrat. Rubriken bär ordet, så procenten i raden slipper vara en färgad prick.
 * Senaste först; äldre än 6 månader bakom "Visa äldre". Sökning visar allt som matchar, oavsett hopfällning.
 */
import type { ObjektData, ObjektStat } from './typer';
import { objektBedom, type ObjektBedomning, type ObjektGrupp } from './bedomning';

export type ObjektRad = { o: ObjektStat; b: ObjektBedomning; gammal: boolean };

/** Hur många dagar bakåt ett objekt räknas som "nytt" (≈ 6 månader). */
export const NYTT_DAGAR = 183;

export const objektRader = (data: ObjektData, sokning: string, nuMs: number = Date.now()): { rader: ObjektRad[]; soker: boolean } => {
  const q = sokning.trim().toLowerCase();
  const soker = q.length > 0;
  const sexManSedan = new Date(nuMs - NYTT_DAGAR * 86400000).toISOString().slice(0, 10);
  const rader = data.objekt
    .filter(o => !soker || o.object_name.toLowerCase().includes(q))
    .map(o => ({ o, b: objektBedom(o, o.maskin_id ? data.maskiner[o.maskin_id] : undefined), gammal: o.till < sexManSedan }))
    .sort((a, b) => b.o.till.localeCompare(a.o.till));
  return { rader, soker };
};

export const OBJEKT_GRUPPER: { key: ObjektGrupp; rubrik: string }[] = [
  { key: 'under', rubrik: 'Under kravet' },
  { key: 'godkand', rubrik: 'Godkända' },
  { key: 'tunt', rubrik: 'För tunt underlag' },
];
