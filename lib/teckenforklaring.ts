// TECKENFÖRKLARINGEN ("Vad betyder kartan") — byggs ur samma källor som kartan ritar med: grupper (färg, form, namn, larm), symboldefinitionerna
// (glyf, förklaring) och ytornas tabeller. Ingen egen lista över vad som finns; en ny symbol eller yta dyker upp här av sig själv.
//
// Bara det som FINNS på trakten visas (en rad per sort, ingen dubblett — en gammal Kulturstubbe och en Kulturlämning är samma rad), grupperat i
// Fara · Natur · Kultur · Blött · Att göra · Info. "Visa alla symboler" slår på visaAlla: allt som går att sätta eller möta.

import { GRUPPER, LINJE_GRUPP, LINJE_NAMN, SYMBOL_NAMN, YTA, VIDA, type FargGrupp, type SymbolForm, type VidaSlag } from './larm/grupper';
import { LINJE_FORKLARING, MENY_KATEGORIER, symbolDef, symbolDefTyp, VIDA_FORKLARING, YTA_FORKLARING } from './symboler';

export const GRUPP_ORDNING: readonly FargGrupp[] = ['fara', 'natur', 'kultur', 'blott', 'att_gora', 'info'];

export type ForklaringSlag = 'symbol' | 'yta' | 'linje';
export interface ForklaringRad {
  nyckel: string;
  /** linje: ritas streckad (kraftledningen) i stället för heldragen */
  streckad?: boolean;
  slag: ForklaringSlag;
  /** symbol: symboltypen · yta: zoneType eller `vida:<slag>` · linje: lineType */
  typ: string;
  namn: string;
  forklaring: string;
  grupp: FargGrupp;
  /** ytor man inte får köra in i (snedstreckade) */
  forbjuden: boolean;
}
export interface ForklaringGrupp { grupp: FargGrupp; namn: string; farg: string; form: SymbolForm; rader: ForklaringRad[] }

export interface TeckenMarkering { isMarker?: boolean; type?: string; isZone?: boolean; zoneType?: string; isLine?: boolean; lineType?: string }

/** Vidas lager som finns i en trakts geometri (features med _typ/_lager/FLBESKR, som Vida-importen skriver dem). */
export function vidaSlagIFeatures(features: ReadonlyArray<{ properties?: Record<string, unknown> | null }> | null | undefined): VidaSlag[] {
  const ut = new Set<VidaSlag>();
  for (const f of features ?? []) {
    const p = f?.properties ?? {};
    const typ = String(p._typ ?? ''), lager = String(p._lager ?? ''), beskr = String(p.FLBESKR ?? '').toLowerCase();
    if (typ === 'hänsynsyta') ut.add('hansynsyta');
    else if (lager === 'SV_SKS_NYCKELBIOTOP_101') ut.add('nyckelbiotop');
    else if (lager === 'L_RAA_POLY_101') ut.add('raa_yta');
    else if (lager === 'L_RAA_POINT_101') ut.add('raa_punkt');
    else if (typ === 'linje' && beskr.includes('kraftled')) ut.add('kraftledning');
  }
  return Array.from(ut);
}

const symbolRad = (typ: string): ForklaringRad => {
  const d = symbolDef(typ);
  return { nyckel: `symbol:${d.id}`, slag: 'symbol', typ: d.id, namn: d.namn, forklaring: d.forklaring, grupp: d.grupp, forbjuden: false };
};
const ytaRad = (zoneType: string): ForklaringRad | null => {
  const d = YTA[zoneType]; if (!d) return null;
  return { nyckel: `yta:${zoneType}`, slag: 'yta', typ: zoneType, namn: d.namn, forklaring: YTA_FORKLARING[zoneType] ?? '', grupp: d.grupp, forbjuden: d.forbjuden };
};
/** Samma sak från Vida och från oss är EN rad: Vidas hänsynsyta = vår Hänsyn, Vidas RAÄ-yta = vår Fornlämning (som i Om trakten). */
const VIDA_SOM_EGEN: Partial<Record<VidaSlag, string>> = { hansynsyta: 'protected', raa_yta: 'fornlamning' };
const vidaRad = (slag: VidaSlag): ForklaringRad | null => {
  const egen = VIDA_SOM_EGEN[slag];
  if (egen) return ytaRad(egen);
  const d = VIDA[slag];
  const bas = { nyckel: `vida:${slag}`, namn: d.namn, forklaring: VIDA_FORKLARING[slag], grupp: d.grupp, forbjuden: d.forbjuden };
  // Kraftledningen är en linje (röd, streckad på kartan), RAÄ-punkten ritas som en Kulturlämning (en punkt i gruppen Kultur); övriga är ytor.
  if (slag === 'kraftledning') return { ...bas, slag: 'linje', typ: slag, streckad: true };
  if (slag === 'raa_punkt') return { ...bas, slag: 'symbol', typ: 'culturemonument' };
  return { ...bas, slag: 'yta', typ: `vida:${slag}` };
};
const linjeRad = (lineType: string): ForklaringRad | null => {
  const grupp = LINJE_GRUPP[lineType]; if (!grupp) return null;
  return { nyckel: `linje:${lineType}`, slag: 'linje', typ: lineType, namn: LINJE_NAMN[lineType] ?? lineType, forklaring: LINJE_FORKLARING[lineType] ?? '', grupp, forbjuden: false };
};

/** Symbolerna som går att sätta ur menyn (samma lista som symbolarket). */
export const MENY_SYMBOLER: readonly string[] = MENY_KATEGORIER.flatMap((k) => k.symboler);

export function byggTeckenforklaring(indata: { markeringar?: readonly TeckenMarkering[] | null; vida?: readonly VidaSlag[] | null; visaAlla?: boolean }): ForklaringGrupp[] {
  const rader = new Map<string, ForklaringRad>();
  const lagg = (r: ForklaringRad | null) => { if (r && !rader.has(r.nyckel)) rader.set(r.nyckel, r); };

  if (indata.visaAlla) {
    for (const t of MENY_SYMBOLER) lagg(symbolRad(t));
    for (const z of Object.keys(YTA)) lagg(ytaRad(z));
    for (const v of Object.keys(VIDA) as VidaSlag[]) lagg(vidaRad(v));
    for (const l of Object.keys(LINJE_GRUPP)) lagg(linjeRad(l));
  } else {
    for (const m of indata.markeringar ?? []) {
      if (m.isZone && m.zoneType) lagg(ytaRad(m.zoneType));
      else if (m.isLine && m.lineType) lagg(linjeRad(m.lineType));
      else if (m.isMarker && m.type) {
        // Okänd typ (symbolDefTyp ger 'default') ritas som en vanlig markering på kartan — den får ingen egen rad, vi gissar inte ett namn.
        if (symbolDefTyp(m.type) !== 'default' || m.type in SYMBOL_NAMN) lagg(symbolRad(m.type));
      }
    }
    for (const v of indata.vida ?? []) lagg(vidaRad(v));
  }

  return GRUPP_ORDNING.map((g) => ({
    grupp: g, namn: GRUPPER[g].namn, farg: GRUPPER[g].farg, form: GRUPPER[g].form,
    rader: Array.from(rader.values()).filter((r) => r.grupp === g).sort((a, b) => a.namn.localeCompare(b.namn, 'sv')),
  })).filter((g) => g.rader.length > 0);
}
