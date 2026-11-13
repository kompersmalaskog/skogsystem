// HUR GAMMAL ÄR MASKINENS PRICK? (Martin 2026-11-13, säkerhetsprincipen: det som visas ska vara ärligt om sin ålder.)
// Besökssidan visar hyttspårets senaste punkt, upp till MASKIN_FERSK_MIN gammal. En prick utan ålder ser ut som "där står maskinen nu" –
// en gammal prick är farligare än ingen. Därför: "nu" bara när punkten är färsk, annars klockslaget, och efter en stund tonas pricken ner.
// Obs: en maskin som står still skickar ingen ny punkt, så "senast här 14:32" betyder "här rörde den sig senast" – den kan stå kvar.
import { klockslag } from './tid';

/** Yngre än så här = "nu". Hyttspåret sparas var 20:e sekund och sidan läser var 15:e, så en maskin i arbete ligger långt under gränsen. */
export const MASKIN_NU_MAX_S = 120;
/** Äldre än så här = pricken tonas ner och sidan säger inte längre att maskinerna arbetar just nu. */
export const MASKIN_GAMMAL_MIN = 10;

export type MaskinAlder = { text: string; gammal: boolean };

export function maskinAlder(tidIso: string | null | undefined, nu: Date = new Date()): MaskinAlder {
  const t = tidIso ? Date.parse(tidIso) : NaN;
  if (!Number.isFinite(t)) return { text: 'tid okänd', gammal: true };
  const s = Math.max(0, (nu.getTime() - t) / 1000);
  if (s <= MASKIN_NU_MAX_S) return { text: 'nu', gammal: false };
  return { text: `senast här ${klockslag(tidIso)}`, gammal: s >= MASKIN_GAMMAL_MIN * 60 };
}

/**
 * Raden över kartan. Sidan påstår "arbetar här just nu" bara när minst en maskins prick är färsk; annars säger den när de senast syntes
 * och att de kan vara kvar. Inga maskiner → ingen rad (null).
 */
export function arbetarRad(tider: (string | null | undefined)[], nu: Date = new Date()): { text: string; farsk: boolean } | null {
  if (tider.length === 0) return null;
  if (tider.some((t) => !maskinAlder(t, nu).gammal)) return { text: 'Maskinerna arbetar här just nu', farsk: true };
  const senast = tider.map((t) => (t ? Date.parse(t) : NaN)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const kl = senast != null ? klockslag(new Date(senast).toISOString()) : '';
  return { text: kl ? `Maskinerna syntes här senast ${kl} – de kan vara kvar` : 'Maskinerna kan vara kvar här', farsk: false };
}
