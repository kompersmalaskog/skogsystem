// GLASLÄGET — glas eller solid på kartans flytande kontroller (stilen bor i lib/design/tokens: GLAS, GLAS_CSS, klassen `.glas`).
//
// Suddig bakgrund (backdrop-filter) kostar grafikminne och bilder per sekund på en svag dator, och maskindatorn i hytten är det svaga ledet. Därför:
//   • MASKINLÄGET är solid som standard. Glas dit först när någon har MÄTT att panoreringen inte märks på riktig hytthårdvara — inte förrän dess.
//   • en SVAG dator (≤ 2 kärnor eller ≤ 2 GB minne enligt webbläsaren) får solid överallt.
//   • där webbläsaren inte kan sudda alls, och vid "minska genomskinlighet", sköter CSS:en fallbacken själv (@supports / prefers-reduced-transparency).
//   • `?glas=solid` / `?glas=glas` i adressen går före allt (mätning och felsökning).
// Läget skrivs som `data-glas` på <body>; CSS:en läser det. Rena funktioner här, effekten i useGlasLage.

import { useEffect } from 'react';

export type GlasLage = 'glas' | 'solid';

export interface GlasIndata {
  maskinlage: boolean;
  svagDator: boolean;
  /** Från adressen (?glas=…). */
  tvingat?: GlasLage | null;
}

/** Ett val per läge. Tvingat går först, sedan maskinläge, sedan svag dator; annars glas. */
export function valjGlasLage({ maskinlage, svagDator, tvingat }: GlasIndata): GlasLage {
  if (tvingat === 'glas' || tvingat === 'solid') return tvingat;
  if (maskinlage) return 'solid';
  if (svagDator) return 'solid';
  return 'glas';
}

export const SVAG_KARNOR = 2;
export const SVAGT_MINNE_GB = 2;

/** Svag dator = webbläsaren säger högst 2 kärnor eller högst 2 GB. Okänt (Safari säger inget om minnet) räknas aldrig som svagt. */
export function arSvagDator(n: { hardwareConcurrency?: number; deviceMemory?: number } | null | undefined): boolean {
  if (!n) return false;
  if (typeof n.hardwareConcurrency === 'number' && n.hardwareConcurrency > 0 && n.hardwareConcurrency <= SVAG_KARNOR) return true;
  if (typeof n.deviceMemory === 'number' && n.deviceMemory > 0 && n.deviceMemory <= SVAGT_MINNE_GB) return true;
  return false;
}

/** ?glas=solid | glas ur en sökväg. Allt annat är null. */
export function glasUrAdress(search: string | null | undefined): GlasLage | null {
  if (!search) return null;
  try {
    const v = new URLSearchParams(search).get('glas');
    return v === 'solid' || v === 'glas' ? v : null;
  } catch {
    return null;
  }
}

/** Skriver läget på <body>, där CSS:en läser det. Tom miljö (server, test utan dokument) rör ingenting. */
export function tillampaGlasLage(lage: GlasLage, doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): void {
  if (!doc?.body) return;
  doc.body.setAttribute('data-glas', lage);
}

/** Tar bort märket igen (vyn lämnas): <body> utan `data-glas` är glas, så andra vyer ser ingen skillnad. */
export function rensaGlasLage(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): void {
  doc?.body?.removeAttribute('data-glas');
}

/** Läs enhetens uppgifter + adressen och välj läge. Hook-fritt så att testet kan köra den. */
export function glasLageFranMiljon(maskinlage: boolean): GlasLage {
  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { hardwareConcurrency?: number; deviceMemory?: number }) : null;
  const sok = typeof window !== 'undefined' ? window.location.search : '';
  return valjGlasLage({ maskinlage, svagDator: arSvagDator(nav), tvingat: glasUrAdress(sok) });
}

/** Planeringsvyn: sätter läget medan vyn står och tar bort det när den lämnas. Anropas före alla tidiga returer. */
export function useGlasLage(maskinlage: boolean): void {
  useEffect(() => {
    tillampaGlasLage(glasLageFranMiljon(maskinlage));
    return () => rensaGlasLage();
  }, [maskinlage]);
}
