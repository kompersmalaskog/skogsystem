// Öppna en fil ur den privata bucketen (signerad URL, aldrig getPublicUrl — kartfiler.ts). Fönstret öppnas SYNKRONT i trycket och får sin
// adress när signeringen är klar: ett window.open efter en await blockeras av iOS Safari som popup.
import { signeraKartfil } from '@/lib/kartfiler';

/** true = filen öppnades. false = kunde inte signeras eller fönstret blockerades — anroparen säger det till användaren. */
export async function oppnaFil(path: string | null | undefined): Promise<boolean> {
  if (!path) return false;
  const fonster = window.open('', '_blank');
  const url = await signeraKartfil(path);
  if (!url) { fonster?.close(); return false; }
  if (!fonster) { window.location.href = url; return true; }
  fonster.location.href = url;
  return true;
}
