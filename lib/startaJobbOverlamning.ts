// ÖVERLÄMNING Starta jobb → körvyn (maskindator).
//
// Ett jobb som skapas på en maskindator ska öppna körvyn direkt på det nya objektet. Starta jobb är en egen sida; körvyn bor i planeringssidan
// (app/planering). Den har redan en mekanism för "öppna det här objektet i körvyn efter en omladdning": auto-uppdateringen skriver
// sessionStorage['planering_autoreload'] = { objektId, korvyActive, korvyForceRoll, ts } och planeringssidan läser (och rensar) den vid start
// (pendingRestore), högst 5 minuter gammal. Vi använder EXAKT den — ingen ny väg in i planeringen.
// Dessutom ett kort besked (P-VO:t som ska knappas in i maskinen) som planeringssidan visar en gång.
//
// Rena funktioner mot ett Storage-liknande objekt → testbara (startaJobbOverlamning.test.ts). Tål blockerad sessionStorage.

export const AUTORELOAD_NYCKEL = 'planering_autoreload';
export const BESKED_NYCKEL = 'starta_jobb_besked_v1';
/** Beskedet gäller så här länge (planeringssidan ska hinna starta). */
export const BESKED_MAX_MS = 2 * 60 * 1000;

type Skriv = Pick<Storage, 'setItem'>;
type Las = Pick<Storage, 'getItem' | 'removeItem'>;

export interface Overlamning {
  objektId: string;
  roll: 'skordare' | 'skotare';
  /** Kort text som körvyn visar en gång (t.ex. "P-1018 — knappa in i båda maskinerna"). */
  besked?: string | null;
  nu?: number;
}

/** Skriv överlämningen. false om lagringen är blockerad (anroparen navigerar då ändå — körvyn öppnas via maskindator-starten). */
export function skrivOverlamning(lager: Skriv, o: Overlamning): boolean {
  const nu = o.nu ?? Date.now();
  try {
    lager.setItem(AUTORELOAD_NYCKEL, JSON.stringify({ objektId: o.objektId, korvyActive: true, korvyForceRoll: o.roll, ts: nu }));
    if (o.besked) lager.setItem(BESKED_NYCKEL, JSON.stringify({ text: o.besked, ts: nu }));
    return true;
  } catch { return false; }
}

/** Läs och rensa beskedet. null om det saknas, är för gammalt eller trasigt. */
export function lasBesked(lager: Las, nu: number = Date.now()): string | null {
  try {
    const raw = lager.getItem(BESKED_NYCKEL);
    if (!raw) return null;
    lager.removeItem(BESKED_NYCKEL);
    const s = JSON.parse(raw);
    if (typeof s?.text === 'string' && s.text.trim() && typeof s.ts === 'number' && nu - s.ts >= 0 && nu - s.ts < BESKED_MAX_MS) return s.text;
  } catch { /* trasigt → inget besked */ }
  return null;
}
