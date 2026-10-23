// Notiser i hytten: brytaren och testets resultat, per enhet (maskindatorn). Standard AV — steg 2 tas i bruk först när Martin testat testnotisen i skördaren
// och slagit på brytaren i Inställningar. Minnet är en bekvämlighet: går localStorage inte att läsa gäller AV.

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

export function lasHyttNotiserPa(): boolean {
  try { return localStorage.getItem(PA_NYCKEL) === 'pa'; } catch { return false; }
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
