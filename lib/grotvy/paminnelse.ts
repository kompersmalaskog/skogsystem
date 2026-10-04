// Push-påminnelser om markägarens datum (grot_senast) — REN logik: vilka rader som ska påminnas idag, vilken tidpunkt de
// hör till, nyckeln som gör att varje tidpunkt skickas EN gång, och texten. Ingen databas, ingen klocka (idag skickas in).
//
// SAMMA LISTA SOM VYN (byggGrotLista): körda trakter finns inte i den och får därför aldrig en påminnelse — en enda
// körd-regel, ingen kopia i SQL. Producenten (lib/grotvy/paminnelse-ko + /api/grot/paminnelse) köar raderna i notis_kö;
// /api/notis/flush bygger texten med paminnelseMeddelande och skickar.
//
// TIDPUNKTER: 7 och 2 dagar före markägarens datum — med ett dygns marginal åt det sena hållet (6 dagar kvar räknas till
// 7-notisen, 1 dag kvar till 2-notisen), så en missad cron-dag inte tappar en notis. Är datumet satt för sent för en
// tidpunkt hoppas den över (datum om 5 dagar → bara 2-notisen). Själva dagen och försenat ger ingen ny notis.

import { kortDatum, markBegransningText } from './format';
import type { GrotLista, GrotRad } from './lista';

export const PAMINNELSE_TYP = 'grot_senast';
/** Tidpunkterna, i dagar före markägarens datum. */
export const TIDPUNKTER = [7, 2] as const;
export type Tidpunkt = (typeof TIDPUNKTER)[number];

/** Vilken tidpunkt hör "dagar kvar" till? 7 eller 6 → 7-notisen, 2 eller 1 → 2-notisen, allt annat (0, försenat, 3–5, över 7) → ingen. */
export function tidpunktFor(dagarKvar: number | null | undefined): Tidpunkt | null {
  if (dagarKvar == null || !Number.isInteger(dagarKvar)) return null;
  if (dagarKvar === 7 || dagarKvar === 6) return 7;
  if (dagarKvar === 2 || dagarKvar === 1) return 2;
  return null;
}

/** Dedup-nyckeln: `<VO-nummer eller dim-id>|<datum>|<tidpunkt>`. En notis per tidpunkt och datum — ändras datumet blir nyckeln ny
 *  och tidpunkterna gäller igen. VO-numret (inte dim-id) gör att en trakt som står som flera dim-rader påminns EN gång. */
export function paminnelseNyckel(rad: Pick<GrotRad, 'id' | 'voNummer'>, senast: string, tidpunkt: Tidpunkt): string {
  const trakt = (rad.voNummer ?? '').trim() || rad.id;
  return `${trakt}|${senast}|${tidpunkt}`;
}

export interface GrotPaminnelse {
  nyckel: string;
  tidpunkt: Tidpunkt;
  /** dim_objekt.objekt_id för raden */
  radId: string;
  namn: string;
  /** Markägarens datum, 'YYYY-MM-DD' */
  senast: string;
  dagarKvar: number;
  /** Planeringens markvillkor när det är en BEGRÄNSNING ('dålig bärighet'), annars null */
  markBegransning: string | null;
}

/** Påminnelserna som ska köas idag, ur listan som byggts för idag. */
export function grotPaminnelser(lista: GrotLista): GrotPaminnelse[] {
  const ut: GrotPaminnelse[] = [];
  const sett = new Set<string>();
  lista.alla.forEach((r) => {
    if (!r.senast || r.dagarTillSenast == null) return;
    const tidpunkt = tidpunktFor(r.dagarTillSenast);
    if (!tidpunkt) return;
    const nyckel = paminnelseNyckel(r, r.senast, tidpunkt);
    if (sett.has(nyckel)) return;
    sett.add(nyckel);
    ut.push({ nyckel, tidpunkt, radId: r.id, namn: r.namn, senast: r.senast, dagarKvar: r.dagarTillSenast, markBegransning: markBegransningText(r.barighet) || null });
  });
  return ut;
}

/** Det som lagras i notis_kö.payload — texten byggs FÄRSKT vid utskick ur det här (som övriga typer). */
export interface PaminnelsePayload {
  namn: string;
  senast: string;
  dagar_fore: Tidpunkt;
  mark_begransning: string | null;
}
export function paminnelsePayload(p: GrotPaminnelse): PaminnelsePayload {
  return { namn: p.namn, senast: p.senast, dagar_fore: p.tidpunkt, mark_begransning: p.markBegransning };
}

/** Pushtexten: titel 'GROT · <namn>', brödtext 'Ska vara bortkört senast 14 okt — dålig bärighet' (markvillkoret bara när det är en
 *  begränsning). Tryck på notisen öppnar översikten. `idag` avgör bara om årtalet tas med (annat år än idag). */
export function paminnelseMeddelande(payload: Partial<PaminnelsePayload> | null | undefined, idag: string): { title: string; body: string; url: string; tag: string } {
  const p = payload || {};
  const namn = (p.namn ?? '').trim() || 'okänt objekt';
  const datum = kortDatum(p.senast, idag) || 'okänt datum';
  const mark = (p.mark_begransning ?? '').trim();
  return {
    title: `GROT · ${namn}`,
    body: `Ska vara bortkört senast ${datum}${mark ? ` — ${mark}` : ''}`,
    url: '/oversikt-v2',
    tag: `grot-senast-${namn}-${p.senast ?? ''}-${p.dagar_fore ?? ''}`,
  };
}
