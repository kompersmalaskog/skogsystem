// RADERNA I ⓘ-PANELEN "Det här gäller här" (maskinläget): en rad per yta, med kartans namn som bricka — samma nummer som på kartan, alltid (lib/ytaNamn).
//   [Hänsyn 1] Kant mot vatten   kantzon lämnas på ca 10-15 m där endast gran avverkas.     (· blå prick = inte sedd)
// Alla Vidas tilläggsytor har en rad (också de utan text: en hänsynsyta man ska veta finns), plus egna områden och avlägg som har en instruktion. Vidas traktdirektiv gäller hela
// trakten och är ingen yta: det visas som egen ruta ovanför raderna och har ingen rad här.

import type { InstruktionerPaTrakten } from './instruktioner/instruktioner';
import { DIREKTIV_NYCKEL } from './instruktioner/instruktioner';
import { ytaNyckel } from './traktGeometri';
import { forstaPunkt, vidaYtaNamn, type BrickaGrupp } from './ytaNamn';

export interface YtaRad {
  /** Områdets nyckel (`hansyn:<LOPNR>`, `marker:<id>` …) — den som ytan hittas på kartan med. */
  nyckel: string;
  bricka: string;
  typ: string;
  grupp: BrickaGrupp;
  /** Första punkten av instruktionen (Vidas ATGARD eller egen kommentar) — avkortas på en rad av vyn. Null när ytan inte har någon text. */
  text: string | null;
  /** Något i ytans instruktion är inte sett: liten blå prick. */
  osedd: boolean;
}

/** Raderna: Vidas tilläggsytor i Vidas nummerordning (samma ordning som på kartan), sedan övriga områden med instruktion i den ordning de samlats. */
export function ytaRader(features: ReadonlyArray<{ properties?: Record<string, any> | null }> | null | undefined, lista: InstruktionerPaTrakten): YtaRad[] {
  const perNyckel = new Map(lista.omraden.map((o) => [o.nyckel, o]));
  const vida: (YtaRad & { n: number })[] = [];
  const sedda = new Set<string>();
  for (const f of features ?? []) {
    const props = f?.properties ?? null;
    const namn = vidaYtaNamn(props);
    const nyckel = ytaNyckel(props);
    if (!namn || !nyckel || sedda.has(nyckel)) continue;
    sedda.add(nyckel);
    const o = perNyckel.get(nyckel);
    vida.push({ nyckel, bricka: namn.bricka, typ: namn.typ, grupp: namn.grupp, text: o?.instruktioner[0] ? forstaPunkt(o.instruktioner[0].text) : null, osedd: (o?.nya ?? 0) > 0, n: parseInt(namn.nr, 10) });
  }
  vida.sort((a, b) => (Number.isFinite(a.n) ? a.n : 1e9) - (Number.isFinite(b.n) ? b.n : 1e9));
  const ovriga: YtaRad[] = lista.omraden
    .filter((o) => o.nyckel !== DIREKTIV_NYCKEL && !sedda.has(o.nyckel) && o.instruktioner.length > 0)
    .map((o) => ({ nyckel: o.nyckel, bricka: o.bricka ?? o.namn, typ: o.typ ?? '', grupp: o.brickaGrupp ?? 'ovrigt', text: forstaPunkt(o.instruktioner[0].text), osedd: o.nya > 0 }));
  return [...vida.map(({ n: _n, ...r }) => r), ...ovriga];
}
