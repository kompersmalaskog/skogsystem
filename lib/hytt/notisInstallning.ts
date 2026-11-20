// Notiser i hytten: brytaren och testets resultat, per enhet (maskindatorn). PÅ som standard på en enhet som är maskin (enhet_maskin_id) — ingen brytare ska behöva slås på
// (Martin körde Elefanten 26/10 och fick inga notiser: brytaren var av). Ett uttryckligt val gäller före standarden: den som stängt av i Inställningar har det avstängt.
// En enhet som inte är maskin har det av. Går localStorage inte att läsa gäller standarden.
import { hamtaEnhetMaskin } from '@/lib/enhetMaskin';

const PA_NYCKEL = 'hytt_notiser_v1';
const TEST_NYCKEL = 'hytt_notis_test_v1';

export type TestResultat = {
  /** När testnotisen skickades (ms). */
  skickad?: number;
  /** Fönsterläget när den skickades. */
  lage?: 'framme' | 'borta';
  /** När föraren tryckte Uppfattat på testnotisen (ms). */
  uppfattat?: number;
  /** När föraren tryckte Öppna kartan. */
  oppnad?: number;
};

/** Uttryckligt val: 'pa' | 'av', eller null när ingen rört brytaren. */
export function lasHyttNotiserVal(): 'pa' | 'av' | null {
  try { const v = localStorage.getItem(PA_NYCKEL); return v === 'pa' || v === 'av' ? v : null; } catch { return null; }
}
/** På? Valet först, annars standarden: på när enheten är en maskin. */
export function lasHyttNotiserPa(): boolean {
  const val = lasHyttNotiserVal();
  if (val) return val === 'pa';
  return hamtaEnhetMaskin() != null;
}
export function sparaHyttNotiserPa(pa: boolean): void {
  try { localStorage.setItem(PA_NYCKEL, pa ? 'pa' : 'av'); } catch { /* ingen lagring: förblir av */ }
  try { window.dispatchEvent(new Event('hytt-notiser-andrad')); } catch { /* ingen window */ }
}

export function lasTestResultat(): TestResultat {
  try {
    const j = JSON.parse(localStorage.getItem(TEST_NYCKEL) ?? '{}');
    return j && typeof j === 'object' ? j : {};
  } catch { return {}; }
}
export function sparaTestResultat(r: TestResultat): void {
  try { localStorage.setItem(TEST_NYCKEL, JSON.stringify(r)); } catch { /* bekvämlighet */ }
}
