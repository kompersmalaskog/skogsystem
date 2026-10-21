// QR-koderna på lådorna. EN regel för adressen och texten på etiketten — etikettsidan och skanningssidan läser härifrån.
//
// Koden pekar ALLTID på produktionens adress, aldrig på den sida etiketten skrevs ut från: en etikett som skrivs ut
// från en förhandsvisning (…-git-…vercel.app) ska ändå fungera i hallen om ett år. Byts domänen måste etiketterna
// skrivas ut igen — därför en konstant, inte window.location.
//
// /i/<rad_id>: radens id ändras aldrig (se kommentaren på inventarie_rad). Tas raden bort och läggs upp igen får den
// ett nytt id och den gamla etiketten säger "Etiketten pekar inte på någon artikel längre".

import type { VisadRad } from './typer';
import { artikelTitel, maskinNamn, platsText } from './vy';

export const APP_URL = 'https://skogsystem.vercel.app';

export function qrAdress(radId: string): string {
  return `${APP_URL}/i/${encodeURIComponent(radId)}`;
}

export type EtikettText = { titel: string; plats: string; gor: string };

/** Vad etiketten säger: vad det är, var det hör hemma, och vad en skanning gör. */
export function etikettText(v: VisadRad): EtikettText {
  const m = maskinNamn(v.maskin);
  const plats = [m, platsText(v.plats, v.rad.hylla)].filter(Boolean).join(' · ');
  const gor = v.artikel.typ !== 'forbrukning'
    ? 'Skanna: var den hör hemma'
    : v.rad.tva_lador
      ? 'RESERVLÅDA · skanna när du börjar på den'
      : 'Skanna när du tar en';
  return { titel: artikelTitel(v.artikel), plats, gor };
}

/**
 * Förvalt på etikettsidan: det som behöver en etikett för att appen ska fungera — reservlådorna (två lådor) och det
 * som räknas. Utrustning väljs till för hand (det mesta hittas med sökningen).
 */
export function forvaldaEtiketter(rader: VisadRad[]): string[] {
  return rader.filter(v => v.artikel.typ === 'forbrukning').map(v => v.rad.id);
}

/** Vad /i/<id> gör med raden. */
export type SkanningsLage = 'reserv' | 'oppna';

export function skanningsLage(v: Pick<VisadRad, 'rad' | 'artikel'>): SkanningsLage {
  return v.artikel.typ === 'forbrukning' && v.rad.tva_lador ? 'reserv' : 'oppna';
}
