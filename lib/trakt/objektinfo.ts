import { XMLParser } from 'fast-xml-parser';
import proj4 from 'proj4';

// En stavning för VIDA: "Vida", "VIDA" och "Vida Skog AB" -> "Vida". Samma regel körs som
// engångsstädning av befintliga rader i migration 20260805_4_normalisera_bolag.sql.
function normaliseraBolag(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim();
  if (t === '') return undefined;
  if (['vida', 'vida skog ab'].includes(t.toLowerCase())) return 'Vida';
  return t;
}

// Fält ur en envz: object-info.xml (strukturerad objektdata) + OGI-dokumentet (cert,
// avverkningsform). Sätter ENDAST fält som faktiskt har ett värde — tomt/saknat utelämnas,
// så den generella mergen (lib/trakt/merge.ts) aldrig nollar en kolumn eller skriver över
// något TD-parsern hittade.

const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
function sweref99ToWgs84(northing: number, easting: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(SWEREF99TM, 'WGS84', [easting, northing]);
  return { lat, lng };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function textOf(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'object') return v['#text'];
  return v as string;
}
function samlaDjupt(obj: any, nyckel: string, ut: any[] = []): any[] {
  if (obj == null || typeof obj !== 'object') return ut;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === nyckel.toLowerCase()) ut.push(obj[k]);
    samlaDjupt(obj[k], nyckel, ut);
  }
  return ut;
}
// Första icke-tomma strängvärdet för en nyckel, eller undefined.
function forsta(obj: any, nyckel: string): string | undefined {
  for (const v of samlaDjupt(obj, nyckel).flat(Infinity)) {
    const s = textOf(v);
    if (s != null && String(s).trim() !== '') return String(s).trim();
  }
  return undefined;
}
const tomTillUndef = (s: string | undefined) => (s && s.trim() !== '' ? s.trim() : undefined);
const somArray = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export interface ChecklistPost {
  sektion?: string;   // formSection/rootQuestion.title
  fraga?: string;     // followUpQuestion.title
  svarsalternativ: { text?: string; larmar: boolean }[]; // option[] med @_alarm
}

// questionForm: varje formSection har EN rootQuestion (sektionsrubrik) + N followUpQuestion
// (de riktiga frågorna), var och en med option[] som bär @_alarm. Rubrikerna är inte frågorna
// — plattar till en post per followUpQuestion med sin sektion och sina svarsalternativ (rått,
// men strukturerat så alarm-flaggan bevaras). Larm-tolkningen (agera på larmar) görs senare.
function parseChecklist(oi: any): ChecklistPost[] {
  const ut: ChecklistPost[] = [];
  for (const sek of samlaDjupt(oi, 'formSection').flat(Infinity)) {
    const sektion = textOf(somArray(sek?.rootQuestion)[0]?.title);
    for (const fq of somArray(sek?.followUpQuestion)) {
      ut.push({
        sektion,
        fraga: textOf(fq?.title),
        svarsalternativ: somArray(fq?.option).map((o: any) => ({
          text: textOf(o),
          larmar: String(o?.['@_alarm']) === 'true',
        })),
      });
    }
  }
  return ut;
}

// typ har bara gemener i prod ('slutavverkning' | 'gallring'). Purpose gemeniseras och måste
// matcha en känd kategori — okänt värde skrivs INTE (hittar inte på en ny kategori).
const KÄNDA_TYP = new Set(['slutavverkning', 'gallring']);

// Fältnycklarna följer objekt-tabellens kolumnnamn. region + avverkningsform är nya kolumner
// (migration). atgard behålls från TD (Purpose är kategorin typ, inte åtgärdskoden). volym
// skrivs av Target (volym_planerad är död kolumn — 0/45 rader — och rörs inte).
export interface EnvzFalt {
  traktnr?: string;
  vo_nummer?: string;
  namn?: string;
  typ?: string;             // <Purpose>, gemeniserad, validerad
  areal?: number;           // <Area> (komma som decimaltecken)
  volym?: number;           // <Target>
  bolag?: string;           // <Requestor>, normaliserad
  region?: string;          // <Region> (ny kolumn)
  larmkoordinat_lat?: number; // <Coord-X>=northing, <Coord-Y>=easting, EPSG:3006 (ej kartpin lat/lng)
  larmkoordinat_lng?: number;
  inkopare?: string;        // objectProperties/property "Name" (signatur-parentes strippad)
  cert?: string;            // OGI ForestCertification (flera element -> join)
  avverkningsform?: string; // OGI LoggingFormDescription (ny kolumn)
}

export interface EnvzUttag {
  falt: EnvzFalt;
  executor?: string;   // <Executor> org.nr — för Executor-gaten, lagras inte
  info?: string;       // <Info> — omappad tills vi ser en ifylld (886465 har tom Info)
  checklist: ChecklistPost[]; // en post per followUpQuestion -> objekt.checklist_items (jsonb)
  varningar: string[];
}

export function parseObjektInfo(objectInfoXml: string, ogiXml: string | null): EnvzUttag {
  const varningar: string[] = [];
  const oi = parser.parse(objectInfoXml);
  const falt: EnvzFalt = {};

  falt.traktnr = forsta(oi, 'Objectnumber');
  falt.vo_nummer = forsta(oi, 'orderNumber');
  falt.namn = forsta(oi, 'Objectname');
  falt.bolag = normaliseraBolag(forsta(oi, 'Requestor'));
  falt.region = forsta(oi, 'Region');

  // Purpose -> typ (gemener, validerad). Okänt -> logga, skriv inget.
  const purpose = forsta(oi, 'Purpose');
  if (purpose) {
    const t = purpose.toLowerCase();
    if (KÄNDA_TYP.has(t)) falt.typ = t;
    else varningar.push(`Okänt Purpose "${purpose}" — sätter inte typ.`);
  }

  const arealStr = forsta(oi, 'Area');
  if (arealStr) {
    const a = parseFloat(arealStr.replace(',', '.'));
    if (Number.isFinite(a)) falt.areal = a;
  }
  const targetStr = forsta(oi, 'Target');
  if (targetStr) {
    const v = parseInt(targetStr.replace(/\s/g, ''), 10);
    if (Number.isFinite(v)) falt.volym = v;
  }

  // Larmkoordinat. <Coord-X>=northing, <Coord-Y>=easting (verifierat mot L_TILLAGGSPUNKTER).
  const cxStr = forsta(oi, 'Coord-X');
  const cyStr = forsta(oi, 'Coord-Y');
  if (cxStr && cyStr) {
    const northing = parseInt(cxStr, 10);
    const easting = parseInt(cyStr, 10);
    if (Number.isFinite(northing) && Number.isFinite(easting)) {
      const { lat, lng } = sweref99ToWgs84(northing, easting);
      if (lat >= 55 && lat <= 70 && lng >= 10 && lng <= 25) {
        falt.larmkoordinat_lat = lat;
        falt.larmkoordinat_lng = lng;
      } else {
        varningar.push(`Larmkoordinat utanför Sverige (lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}) — utelämnas.`);
      }
    }
  }

  // Inköpare: objectProperties/property där propertyName = "Name". Strippa VSOP-signaturen
  // i parentes ("Martin Hjert (MARHJE)" -> "Martin Hjert") — vi har nog med identiteter.
  for (const prop of samlaDjupt(oi, 'property').flat(Infinity)) {
    const namn = textOf(samlaDjupt(prop, 'propertyName').flat(Infinity)[0]);
    if (namn === 'Name') {
      const raw = tomTillUndef(textOf(samlaDjupt(prop, 'value').flat(Infinity)[0]));
      falt.inkopare = tomTillUndef(raw?.replace(/\s*\([^)]*\)\s*$/, ''));
      break;
    }
  }

  const executor = forsta(oi, 'Executor');
  const info = forsta(oi, 'Info');

  // OGI: cert (flera ForestCertification -> join) + avverkningsform.
  if (ogiXml) {
    const ogi = parser.parse(ogiXml);
    const certer = samlaDjupt(ogi, 'ForestCertification')
      .flat(Infinity)
      .map(textOf)
      .filter((s): s is string => !!s && s.trim() !== '');
    if (certer.length) falt.cert = certer.join(' ');
    falt.avverkningsform = forsta(ogi, 'LoggingFormDescription');
  }

  const checklist = parseChecklist(oi);

  return { falt, executor, info, checklist, varningar };
}
