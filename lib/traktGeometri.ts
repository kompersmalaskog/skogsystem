// Klassning + kort-innehåll för trakt-geometri (objekt_geometri, källa envz). PR A: gör Vida-geometrin
// tappbar i körvy + planering med ETT gemensamt kort. Klassas på `_lager` (importen sätter `_typ='okänt'`
// för referenslagren, så vi kan inte lita på _typ). Rättelse (Martin): traktdelar = L_TRAKTDEL (Vida),
// INTE SV_BESKRIVNINGSENHET_FL (markägarens skogsbruksplan → renderas ej).

export type TraktKategori =
  | 'traktdel' | 'hansyn' | 'punkt' | 'nyckelbiotop' | 'lamning' | 'omrade' | 'ignorera';
//   'omrade' = planerarens egna ritade område (planering_markeringar, ej objekt_geometri) — PR B.

// _lager → kategori (+ källa). Allt som inte mappas → 'ignorera' (renderas/tappas inte).
// Ej renderade med flit: SV_BESKRIVNINGSENHET_FL (skogsbruksplan), SV_FASTIGHET, NVV/SKS-områden.
const LAGER_KATEGORI: Record<string, { kategori: TraktKategori; kalla: string }> = {
  L_TRAKTDEL:              { kategori: 'traktdel',     kalla: 'Vida' },
  L_TILLAGGSYTOR:          { kategori: 'hansyn',       kalla: 'Vida' },
  L_TILLAGGSPUNKTER:       { kategori: 'punkt',        kalla: 'Vida' },
  SV_SKS_NYCKELBIOTOP_101: { kategori: 'nyckelbiotop', kalla: 'Skogsstyrelsen' },
  L_RAA_POINT_101:         { kategori: 'lamning',      kalla: 'RAÄ' },
  L_RAA_POLY_101:          { kategori: 'lamning',      kalla: 'RAÄ' },
  L_RAA_LINE_101:          { kategori: 'lamning',      kalla: 'RAÄ' },
};

export function klassaTraktFeature(props: Record<string, any> | null | undefined): { kategori: TraktKategori; kalla: string | null } {
  const lager = String((props && props._lager) ?? '');
  const m = LAGER_KATEGORI[lager];
  return m ? { kategori: m.kategori, kalla: m.kalla } : { kategori: 'ignorera', kalla: null };
}

/** _lager-värden som ska RITAS (tappbara), per kategori — används i MapLibre-lagerfiltren. */
export const LAGER_TRAKTDEL = ['L_TRAKTDEL'];
export const LAGER_HANSYN = ['L_TILLAGGSYTOR'];
export const LAGER_PUNKT = ['L_TILLAGGSPUNKTER'];
export const LAGER_NYCKELBIOTOP = ['SV_SKS_NYCKELBIOTOP_101'];
export const LAGER_LAMNING = ['L_RAA_POINT_101', 'L_RAA_POLY_101', 'L_RAA_LINE_101'];

const num = (v: any): number => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const txt = (v: any): string => (v == null ? '' : String(v).trim());

/** Areal (ha) ur shapefile-fälten. AREA_HA är redan hektar; SHAPE.STAr/Shape_Area är m². Punkter/linjer → null. */
export function traktArealHa(props: Record<string, any>): number | null {
  const aHa = num(props['AREA_HA']);
  if (Number.isFinite(aHa) && aHa > 0) return aHa;
  const aM2 = num(props['SHAPE.STAr'] ?? props['SHAPE_STAr'] ?? props['Shape_Area']);
  return Number.isFinite(aM2) && aM2 > 0 ? aM2 / 10000 : null;
}

export interface TraktKort {
  kategori: TraktKategori;
  kalla: string | null;
  rubrik: string;
  nr: string;                    // Nr/löpnr/traktdelsnr (kontextrad)
  arealHa: number | null;
  rader: { etikett?: string; text: string }[];   // beskrivande textfält (åtgärd / biotop / lämningsbeskrivning)
}

/** Bygg kortets innehåll för en tappad trakt-feature. Ett gemensamt kort, fältuppsättning per kategori. */
export function byggTraktKort(props: Record<string, any>): TraktKort {
  const { kategori, kalla } = klassaTraktFeature(props);
  const arealHa = traktArealHa(props);
  const rader: { etikett?: string; text: string }[] = [];
  let rubrik = ''; let nr = '';

  if (kategori === 'traktdel') {
    nr = txt(props.TRDEL_NR_K);
    rubrik = nr ? `Traktdel ${nr}` : 'Traktdel';
    if (txt(props.FLBESKR)) rader.push({ text: txt(props.FLBESKR) });
  } else if (kategori === 'hansyn') {
    nr = txt(props.LOPNR);
    rubrik = txt(props.FLBESKR) || 'Hänsynsyta';
    if (txt(props.ATGARD)) rader.push({ text: txt(props.ATGARD) });
  } else if (kategori === 'punkt') {
    nr = txt(props.EXTRA_LABE);
    rubrik = txt(props.FLBESKR) || 'Avlägg';
    if (txt(props.ATGARD)) rader.push({ text: txt(props.ATGARD) });
  } else if (kategori === 'nyckelbiotop') {
    rubrik = txt(props.Objnamn) || 'Nyckelbiotop';
    nr = txt(props.Beteckn);
    for (const f of ['Biotop1', 'Biotop2']) { const t = txt(props[f]); if (t) rader.push({ etikett: 'Biotop', text: t }); }
    for (let i = 1; i <= 8; i++) { const t = txt(props['Beskrivn' + i]); if (t) rader.push({ text: t }); }
  } else if (kategori === 'lamning') {
    rubrik = txt(props.lamningsty) || 'Lämning';
    nr = txt(props.lamningsnu);
    if (txt(props.antikva_11)) rader.push({ etikett: 'Antikvarisk bedömning', text: txt(props.antikva_11) });
    if (txt(props.beskrivnin)) rader.push({ text: txt(props.beskrivnin) });
  } else {
    rubrik = 'Trakt-objekt';
  }
  return { kategori, kalla, rubrik, nr, arealHa, rader };
}

/** Stabil yta-nyckel för per-yta-anteckning (tabell objekt_yta_anteckning). Måste ÖVERLEVA omimport,
 *  därför bygger vi på Vida/SKS/RAÄ:s egna id-fält (LOPNR/TRDEL_ID/Beteckn/lamningsnu) — aldrig på
 *  geometri-radens interna id. Egna områden nycklas separat i page.tsx som `omrade:<marker_id>`.
 *  Returnerar null när nyckelfältet saknas (då kan ingen anteckning knytas stabilt → dölj skrivfältet). */
export function ytaNyckel(props: Record<string, any> | null | undefined): string | null {
  const { kategori } = klassaTraktFeature(props);
  const p = props || {};
  switch (kategori) {
    case 'hansyn':       { const v = txt(p.LOPNR);                       return v ? `hansyn:${v}` : null; }
    case 'traktdel':     { const v = txt(p.TRDEL_ID) || txt(p.TRDEL_NR_K); return v ? `traktdel:${v}` : null; }
    case 'nyckelbiotop': { const v = txt(p.Beteckn);                     return v ? `nb:${v}` : null; }
    case 'lamning':      { const v = txt(p.lamningsnu);                  return v ? `raa:${v}` : null; }
    case 'punkt':        { const v = txt(p.EXTRA_LABE) || txt(p.LOPNR);  return v ? `punkt:${v}` : null; }
    default:             return null;
  }
}

/** Vid överlapp: välj den MINSTA ytan (hänsynsyta före traktdel). Punkter/linjer (areal null) vinner
 *  över polygoner (de är små och ligger "ovanpå"). Returnerar valt features props. */
export function valjMinstaYta<T extends { properties?: Record<string, any> }>(traffar: T[]): T | null {
  if (!traffar || traffar.length === 0) return null;
  let bast = traffar[0]; let bastArea = traktArealHa(traffar[0].properties || {}) ?? -1;
  for (const t of traffar.slice(1)) {
    const a = traktArealHa(t.properties || {}) ?? -1;   // -1 = ingen areal (punkt/linje) → vinner
    if (a < bastArea) { bast = t; bastArea = a; }
  }
  return bast;
}
