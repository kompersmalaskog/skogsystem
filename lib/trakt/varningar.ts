// Importvarningar med nyckel och sort. `objekt.import_varningar` är jsonb och tog förut emot ren text — alla rader blandades: det som kräver
// en människa, det som redan är beslutat och det som bara är till utvecklaren. Prod 2026-10-19, hela tabellen: "Okänt lagernamn" 106 rader,
// ForestOwner (URBAN EK) 23 rader på 23 objekt, PDF utan känt suffix 18, Flera traktkarta 10, Hoppade över lagret 4, OSÄKER stämplingslängd 3,
// Okänt Purpose 2. En lista som larmar på alla objekt slutar betyda något inom en vecka.
//
//   fraga      → kräver en människa (okänd PDF, osäker stämplingslängd)               → visas i objektvyn
//   noterat    → beslutet är redan taget (Vida-kontakten, hoppade lager, flera kartor) → visas hopfällt
//   utveckling → till utvecklaren (okänt lagernamn, okänt Purpose)                    → visas inte
//
// Importen skriver objekt `{ nyckel, sort, text, fil? }`. Rader som skrevs före detta (ren text) tolkas av SAMMA funktion när de läses
// (`tillVarningar`), så ingen migration och ingen omimport krävs. En rad som ingen regel känner igen är `noterat`: den syns hopfälld i stället
// för att bli en fråga eller försvinna.

export type VarningSort = 'fraga' | 'noterat' | 'utveckling';

export interface Varning {
  /** Stabil identitet för raden (samma fråga ger samma nyckel vid varje import): `okand_pdf:<fil>`, `okant_lager:<lager>` … */
  nyckel: string;
  sort: VarningSort;
  /** Raden som importen skrev, oförändrad. */
  text: string;
  /** Filen frågan gäller (bara `fraga`). */
  fil?: string;
  /** `info_namnde_stamplingslangd`: importen fick en ledtråd om att filen kan vara stämplingslängden. */
  ledtrad?: string;
}

const OKAND_PDF = /^PDF utan känt suffix: "(.+)" — /;
const OSAKER_STAMPLINGSLANGD = /^"(.+)" tolkad som stämplingslängd via Info — OSÄKER/;
const INFO_NAMNER_FLERA = /^Info nämner stämplingslängd men \d+ oidentifierade PDF:er finns/;
const FOREST_OWNER = /^OGI ForestOwner: /;
const HOPPADE_LAGER = /^Hoppade över lagret "(.+?)" — /;
const FLERA_KARTOR = /^Flera (traktkarta|översiktskarta|[^(]+?) \(/;
const OKANT_LAGER = /^Okänt lagernamn "(.+?)" — /;
const OKANT_PURPOSE = /^Okänt Purpose "(.*?)" — /;

/** Klassar EN rad. Okänd rad = `noterat`. */
export function klassaVarning(text: string): Varning {
  let m: RegExpExecArray | null;
  // Osäker stämplingslängd och okänd PDF är SAMMA mänskliga fråga ("vad är den här PDF:en?"). Skillnaden är bara om Info nämnde en stämplingslängd.
  if ((m = OSAKER_STAMPLINGSLANGD.exec(text))) return { nyckel: `okand_pdf:${m[1]}`, sort: 'fraga', text, fil: m[1], ledtrad: 'info_namnde_stamplingslangd' };
  if ((m = OKAND_PDF.exec(text))) return { nyckel: `okand_pdf:${m[1]}`, sort: 'fraga', text, fil: m[1] };
  if (INFO_NAMNER_FLERA.test(text)) return { nyckel: 'info_namnde_stamplingslangd', sort: 'noterat', text };
  if (FOREST_OWNER.test(text)) return { nyckel: 'forestowner_vida', sort: 'noterat', text };
  if ((m = HOPPADE_LAGER.exec(text))) return { nyckel: `hoppat_lager:${m[1]}`, sort: 'noterat', text };
  if ((m = FLERA_KARTOR.exec(text))) return { nyckel: `flera_filer:${m[1]}`, sort: 'noterat', text };
  if ((m = OKANT_LAGER.exec(text))) return { nyckel: `okant_lager:${m[1]}`, sort: 'utveckling', text };
  if ((m = OKANT_PURPOSE.exec(text))) return { nyckel: `okant_purpose:${m[1]}`, sort: 'utveckling', text };
  return { nyckel: `ovrigt:${text.slice(0, 40)}`, sort: 'noterat', text };
}

/** Importen: raderna den samlat blir de strukturerade raderna som skrivs till `import_varningar`. Tom lista → null (som förut). */
export function klassaVarningar(rader: string[]): Varning[] | null {
  return rader.length > 0 ? rader.map(klassaVarning) : null;
}

function arVarning(v: unknown): v is Varning {
  const o = v as Varning | null;
  return !!o && typeof o === 'object' && typeof o.text === 'string' && typeof o.nyckel === 'string' && (o.sort === 'fraga' || o.sort === 'noterat' || o.sort === 'utveckling');
}

/** Läsning: kolumnen kan innehålla både gamla rader (text) och nya (objekt). Allt annat hoppas över. */
export function tillVarningar(raw: unknown): Varning[] {
  if (!Array.isArray(raw)) return [];
  const ut: Varning[] = [];
  for (const v of raw) {
    if (typeof v === 'string') ut.push(klassaVarning(v));
    else if (arVarning(v)) ut.push(v);
  }
  return ut;
}

/** Texten på en rad, oavsett om den lagrades som text eller objekt (för loggar som ska visa raden som den är). */
export function varningText(v: unknown): string {
  if (typeof v === 'string') return v;
  const t = (v as { text?: unknown } | null)?.text;
  return typeof t === 'string' ? t : String(v);
}
