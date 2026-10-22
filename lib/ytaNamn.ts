// SAMMA NAMN PÅ KARTAN OCH I LISTAN (Martin 2026-10-22, "så att ett barn förstår direkt"). Förut hette Vidas yta "HÄNSYN 1" på kartan men "KANT MOT VATTEN O" i listan och
// "Hänsynsyta 1" i kortet — föraren kunde inte koppla texten till ytan. Nu har varje Vida-yta EN bricka som är kartans etikett ("Hänsyn 1", "Övrigt 4"), en typ ("Kant mot
// vatten") och en kort text (första punkten av instruktionen). Samma rubrik i listan, instruktionskortet vid inkörning, påminnelsen och kartkortet.
//
// Nummer = Vidas eget löpnummer (LOPNR), alltid detsamma som kartans etikett (`VIDA_ETIKETT` + LOPNR i lagret trakt-hansyn-label / trakt-ovrigt-label). Vidas suffix " O" / " F"
// i FLBESKR ("Kant mot vatten O") är ett internt kodtecken och visas aldrig för föraren.

import type { FargGrupp } from './larm/grupper';
import { GRUPPER } from './larm/grupper';
import { arOvrigYta } from './vidaYtaTyp';
import { kommentarPunkter } from './kommentarPunkter';
import { OVRIGT_YTA_STIL, VIDA_ETIKETT } from './ytaStil';

/** Vidas FLBESKR utan det avslutande kodtecknet: "Kant mot vatten O" → "Kant mot vatten", "Grova lövträd F" → "Grova lövträd". Bara ETT ensamt O eller F sist. */
export function rensaVidaNamn(s: string | null | undefined): string {
  return String(s ?? '').trim().replace(/\s+[OF]$/, '').trim();
}

/** "HÄNSYN" → "Hänsyn" (kartans etikett är versaler, brickan är vanlig text). */
const gemener = (s: string): string => (s ? s.charAt(0) + s.slice(1).toLocaleLowerCase('sv-SE') : '');

/** Brickans färg: gruppens (Natur grön, Kultur brun, Blött blå …) — Övrigt är vit/neutral som ytans kant på kartan. */
export type BrickaGrupp = FargGrupp | 'ovrigt';
export const brickaFarg = (g: BrickaGrupp): string => (g === 'ovrigt' ? OVRIGT_YTA_STIL.farg : GRUPPER[g].farg);

export interface VidaYtaNamn {
  /** "Hänsyn 1" / "Övrigt 4" — exakt kartans etikett (utan versaler). */
  bricka: string;
  /** "Kant mot vatten". Tom när brickan redan säger det (Övrigt). */
  typ: string;
  /** "Hänsyn 1 · Kant mot vatten" / "Övrigt 4" — EN rubrik för listan, instruktionskortet och kartkortet. */
  rubrik: string;
  grupp: BrickaGrupp;
  nr: string;
}

/** Namnet på en Vidas tilläggsyta (L_TILLAGGSYTOR), ur featurens egenskaper. Null = ingen tilläggsyta. */
export function vidaYtaNamn(props: Record<string, any> | null | undefined): VidaYtaNamn | null {
  if (!props || String(props._lager ?? '') !== 'L_TILLAGGSYTOR') return null;
  const ovrigt = arOvrigYta(props);
  const nr = String(props.LOPNR ?? '').trim();
  const ord = gemener(ovrigt ? VIDA_ETIKETT.ovrigt : VIDA_ETIKETT.hansynsyta);
  const bricka = nr ? `${ord} ${nr}` : ord;
  const typRaw = rensaVidaNamn(props.FLBESKR);
  // Övrigt heter redan Övrigt (FLBESKR "Övrigt"): ingen upprepning. En hänsynsyta utan beskrivning visar bara brickan.
  const typ = !typRaw || typRaw.toLocaleLowerCase('sv-SE') === ord.toLocaleLowerCase('sv-SE') ? '' : typRaw;
  return { bricka, typ, rubrik: typ ? `${bricka} · ${typ}` : bricka, grupp: ovrigt ? 'ovrigt' : 'natur', nr };
}

/** Första punkten av en instruktion (en rad = en punkt, `kommentarPunkter`): det som står på en rad i listan och i påminnelsen. Tom text ger null. */
export function forstaPunkt(text: string | null | undefined): string | null {
  return kommentarPunkter(text)[0] ?? null;
}
