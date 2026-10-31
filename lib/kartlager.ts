// Vilket bakgrundskartlager kartan visar — ett val per ANVÄNDARE (konto), med en lokal kopia på enheten för när nätet saknas.
//
// Standard för alla (också befintliga användare som aldrig valt): Flygfoto. Ett val som någon gör sparas på kontot (medarbetare.kartlager) och gäller
// överallt där planeringsvyns karta visas — planeringsvyn, körvyn, skotarläget, maskinläget — tills hen byter igen. Utan nät används det senast valda
// på enheten (lokal kopia) och skickas till kontot när nätet kommer tillbaka. Reglerna för vad som gäller när servern svarar finns i `avstam`.

export const KARTLAGER = ['satellite', 'lantmateriet', 'terrain', 'osm', 'ritad'] as const;
export type Kartlager = (typeof KARTLAGER)[number];
/** De fyra som är kartbilder (rutor från en tjänst). "Ritad" ritas av appen själv ur laserdatan (lib/ritadKarta, lib/hooks/useRitadKarta). */
export const RASTER_KARTLAGER = ['satellite', 'lantmateriet', 'terrain', 'osm'] as const;
export type RasterKartlager = (typeof RASTER_KARTLAGER)[number];

/** Flygfoto (Lantmäteriets ortofoto). Internt id 'satellite' — bara visningsnamnet är "Flygfoto". */
export const STANDARD_KARTLAGER: Kartlager = 'satellite';

export const LOKAL_NYCKEL = 'kartlager_v1';

export const arKartlager = (v: unknown): v is Kartlager => typeof v === 'string' && (KARTLAGER as readonly string[]).includes(v);

export const KARTLAGER_NAMN: Record<Kartlager, string> = { satellite: 'Flygfoto', lantmateriet: 'Karta', terrain: 'Topokarta', osm: 'OpenStreetMap', ritad: 'Ritad' };

/** Kartlagrets lager-id i kartstilen (page.tsx mapStyleConfig). För Ritad: skogsbilden (reglaget Dämpad ↔ Skarp gäller den); resten av Ritads lager styrs av useRitadKarta. */
export const KARTLAGER_LAGER_ID: Record<Kartlager, string> = { satellite: 'satellite-layer', lantmateriet: 'lm-layer', terrain: 'terrain-layer', osm: 'osm-layer', ritad: 'ritad-skog' };

/** Den lokala kopian: senast valda lager på den här enheten, vem som valde det och om det ännu inte nått kontot. */
export interface LokalKopia { val: Kartlager; osynkad: boolean; anvandarId: string | null }

export function lasLokal(lager: Pick<Storage, 'getItem'> | null | undefined): LokalKopia | null {
  try {
    const raw = lager?.getItem(LOKAL_NYCKEL);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!arKartlager(j?.val)) return null;
    return { val: j.val, osynkad: j.osynkad === true, anvandarId: typeof j.anvandarId === 'string' ? j.anvandarId : null };
  } catch { return null; }
}

export function skrivLokal(lager: Pick<Storage, 'setItem'> | null | undefined, kopia: LokalKopia): void {
  try { lager?.setItem(LOKAL_NYCKEL, JSON.stringify(kopia)); } catch { /* privat läge / full lagring: valet gäller i minnet i den här sessionen */ }
}

/** Det som visas innan kontot är läst: enhetens senaste val, annars standard. */
export const startLager = (lokal: LokalKopia | null): Kartlager => lokal?.val ?? STANDARD_KARTLAGER;

export interface Avstamning { gallande: Kartlager; skickaTillKontot: boolean }

/**
 * Vad som gäller när vi vet vem som är inloggad och (kanske) vad kontot säger.
 *   • ett val som gjorts på den här enheten utan nät (osynkat) och av samma användare vinner och skickas — det är det senaste valet
 *   • annars gäller kontot (ett byte på en annan enhet slår igenom)
 *   • kontot har inget val (aldrig valt): Flygfoto — en annan användares lokala val på en delad enhet följer inte med
 *   • kontot kunde inte läsas (inget nät): enhetens senaste val, annars Flygfoto
 * `server`: undefined = kunde inte läsas, null = kontot har inget val.
 */
export function avstam(lokal: LokalKopia | null, anvandarId: string, server: Kartlager | null | undefined): Avstamning {
  const minLokal = lokal && lokal.anvandarId === anvandarId ? lokal : null;
  if (minLokal?.osynkad) return { gallande: minLokal.val, skickaTillKontot: true };
  if (server === undefined) return { gallande: startLager(lokal), skickaTillKontot: false };
  if (server) return { gallande: server, skickaTillKontot: false };
  return { gallande: STANDARD_KARTLAGER, skickaTillKontot: false };
}
