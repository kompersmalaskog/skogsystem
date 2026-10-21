// A4-rapporten ur en egenkontrollrunda: modellen. RENT - ingen databas, ingen React, ingen PDF - sa att
// reglerna gar att testa utan webblasare. lib/egenkontrollRapportPdf.ts ritar ur den, och sidan som
// visar "Dela rapport" laser in indata; ingen av dem raknar nagot.
//
// STRUKTUREN ar Vidas Redovisning (Martin 2026-10-19): en tat A4 med huvud, betyg och kommentar sist,
// och en bilaga med karta och foton med bildtext. VAD VI TAR: huvudets uppgifter, uppdelningen
// "omdome + kommentar", och att bilagan ar karta plus foton med bildtext. VAD VI LATER BLI:
//   - 0-5-skalan. Vi har bra / kan bli battre / avvikelse. Vara tre tal overst ar ANTAL, inte betyg:
//     en siffra pa en skala ar ett betyg Martin satter pa sig sjalv.
//   - De tomma raderna. Vida skriver ut hela blanketten med 0,0 pa det som inte galler; vi visar bara
//     det som finns.
// DEN VIKTIGASTE DELEN AR KOMMENTAREN SIST, i lopande text: den enda delen av Vidas rapport som laser.
//
// OBSERVATIONER RAKNAS ALDRIG I TALEN. De ar tillagg (lib/egenkontrollObservation.ts) och star under
// egen rubrik, med tonen som ord och tecken.
//
// ETT LOPNUMMER, TRE STALLEN. Ett fynd som far ett nummer har samma nummer i listan pa sida 1, som pin
// pa bilagans karta och som bildtext pa fotot. Annars ar tre system att halla ihop for den som laser.

import type { EgenkontrollPunkt, EgenkontrollFoto, EgenkontrollProvyta, Egenkontroll } from './egenkontroll';
import { AVVIKELSE_ETIKETT } from './egenkontroll';
import { forutsattningsRader, period } from './egenkontrollForutsattningar';
import { OBSERVATION_TON, OBSERVATION_TYP_ETIKETT, arObservationTon, arObservationTyp, type ObservationTon } from './egenkontrollObservation';
import { sammanstallProvytor, type LatLng } from './provytor';
import { arMedIRapport, type Notering } from './egenkontrollNotering';
import { markeringsStil, type KartMarkering } from './egenkontrollRapportKarta';
import { HYTTSPAR_ETIKETT } from './egenkontrollRapportKarta';

export type { LatLng, KartMarkering };

export type Omdome = 'avvikelse' | 'battre' | 'godkant' | 'bra';

export const OMDOME_ETIKETT: Record<Omdome, string> = {
  avvikelse: 'Avvikelse',
  battre: 'Kan bli bättre',
  godkant: 'Godkänt',
  bra: 'Bra',
};

/** Det rapporten laser in. Allt ar redan hamtat - modellen gor inga anrop. */
/** En notering som kartan i rapporten ritar: punkter i lat/lng, text och avsikt. */
export type KartNotering = {
  id: string;
  typ: 'punkt' | 'linje';
  pil: boolean;
  etikett: string;
  /** Bara avsikten blev kommer hit: rapporten till Vida tar ingen skulle-notering (arMedIRapport). */
  avsikt: 'blev';
  punkter: LatLng[];
};

export type RapportIndata = {
  objektNamn: string;
  voNummer: string | null;
  runda: Egenkontroll;
  /** Plan, utforande och matningar - aldrig observationer (RundVy.punkter). */
  punkter: EgenkontrollPunkt[];
  /** Observationerna (RundVy.observationer). */
  observationer: EgenkontrollPunkt[];
  foton: EgenkontrollFoto[];
  provytor: EgenkontrollProvyta[];
  /**
   * Planpunkternas plats pa marken, punkt-id -> en position (punktPlatser, mitten for en linje eller
   * yta). En punkt som har egen lat/lng (avvikelsens registrerade plats, observationen) anvander den.
   */
  platser: Record<string, LatLng | null>;
  /** Vidas traktgrans som ringar, for vektorkartan. Tom lista = ingen grans ritas. */
  traktgrans: LatLng[][];
  /**
   * STAMMOLNET: en punkt per avverkad stam (hpr_filer med flest stammar, positioner ur hpr_stammar). null = gick inte att lasa
   * (ett FEL, sagt pa kartan); [] = inga stammar hittades. Glesas ALDRIG ut - monstret (stickvagarna, halen dar hansynen star) ar poangen.
   */
  stammar: LatLng[] | null;
  /** Filens eget stammar_count - FAKTA om vad som gjordes. Kan vara fler an stammar.length (de utan position). */
  antalStammar: number | null;
  /** Hyttsparet per roll, ritat. [] = inget spar finns (kommer med pa nya objekt); null = gick inte att lasa. */
  hyttspar: { roll: 'skordare' | 'skotare'; linjer: LatLng[][] }[] | null;
  /** Planeringens markeringar (basvagar, hansynsytor, symboler) i lat/lng. null = gick inte att lasa. */
  markeringar: KartMarkering[] | null;
  /**
   * Noteringarna (ord pa kartan, PR 9a). Utelamnad eller [] = inga; null = gick inte att lasa (ett FEL som sags under kartan, aldrig en tyst
   * karta utan det besiktaren ritat). Raknas aldrig i talen - de forklarar vad man tittar pa, de ar ingen bedomning.
   */
  noteringar?: Notering[] | null;
  /** Hektar ur objektet. null = saknas (aldrig 0). */
  areal: number | null;
  /**
   * JAMFORELSEN MOT TIDIGARE RUNDOR av samma typ. BYGGS INTE an - det finns tva rundor och inget att jamfora mot - men faltet finns,
   * sa att raden gar att lagga till utan att modellen skrivs om: ge en lista rader, rapporten skriver dem under faktaraden.
   * null/utelamnad = ingen rad.
   */
  jamforelse?: JamforelseRad[] | null;
  /** Anmarkningar fran den som byggde indata (t.ex. att origot inte betrodds, sa markeringarna inte ritas). Skrivs under kartan. */
  extraAnmarkningar?: string[];
};

/** En rad i jamforelsen, t.ex. { etikett: 'Stammar per ha', text: '468 · tidigare rundor 410–520' }. */
export type JamforelseRad = { etikett: string; text: string };

/** En rad i kartans teckenforklaring - bara lager som FINNS pa kartan. */
export type Teckenforklaring = { nyckel: string; etikett: string };

export type Fynd = {
  /** Lopnumret. null = fyndet star bara som rad i "Bra"/"Godkant" (ingen text, inget foto). */
  nr: number | null;
  id: string;
  omdome: Omdome;
  /** true = en observation: egen rubrik, raknas aldrig i talen. */
  observation: boolean;
  rubrik: string;
  /** Avvikelsens eller observationens typ ("Hansyn skadad", "Korspar"). */
  typ: string | null;
  /** Besiktarens egen kommentar. null = ingen - vi hittar aldrig pa en. */
  text: string | null;
  /** Planerarens kommentar pa markeringen, som sammanhang. Aldrig besiktarens text. */
  planText: string | null;
  plats: LatLng | null;
  antalBilder: number;
};

export type Bild = {
  fotoId: string;
  sokvag: string;
  /** Fyndets nummer. null for provytefoton. */
  nr: number | null;
  /** "1/2" for ett fynd med flera foton. */
  del: { i: number; av: number };
  text: string;
  /** Var texten kommer ifran. 'rubrik' = fallback ur data (fyndet hade ingen kommentar). */
  textKalla: 'kommentar' | 'matning' | 'provyta' | 'rubrik';
  plats: LatLng | null;
};

export type Tal = {
  bra: number;
  battre: number;
  avvikelse: number;
  /** Visas bara nar > 0, som en fjarde rad - godkant ar varken bra eller ett problem. */
  godkant: number;
  /** Punkter utan svar. En klar runda har 0; ett utkast kan ha fler. */
  obesvarade: number;
};

export type RapportModell = {
  /** true = rundan ar inte avslutad. Rapporten sager det. */
  utkast: boolean;
  titel: 'Egenkontroll';
  huvud: {
    objektNamn: string;
    voNummer: string | null;
    typ: string;
    besok: string;
    utfordAv: string | null;
    maskingrupp: string | null;
  };
  tal: Tal;
  avvikelser: Fynd[];
  battre: Fynd[];
  godkant: { fynd: Fynd[]; ovriga: string[] };
  bra: { fynd: Fynd[]; ovriga: string[] };
  observationer: Fynd[];
  /** Provytorna som textrader - bara gallring med ytor, bara det som har ett varde. */
  provytor: string[] | null;
  forutsattningar: string[];
  /** Kommentaren i stycken. null = ingen skrivits - rapporten visar da ingen tom ruta. */
  kommentar: string[] | null;
  /**
   * KARTAN PA SIDA 1, direkt under de tre talen - det forsta man ser (Vidas bilaga oppnar ocksa med kartan): man orienterar sig forst, laser sedan.
   * Lager underifran: traktgrans, stammoln, hyttspar, planeringens markeringar, kontrollpunkterna (numrerade, overst).
   */
  karta: {
    granser: LatLng[][];
    stammar: LatLng[];
    hyttspar: { roll: 'skordare' | 'skotare'; linjer: LatLng[][] }[];
    markeringar: KartMarkering[];
    /** Noteringarna pa kartan, aldst forst (samma ordning som i appen). Ritas over planens vagar och hyttsparet, under kontrollpunkterna; etiketterna overst. */
    noteringar: KartNotering[];
    pinnar: { nr: number; rubrik: string; plats: LatLng }[];
    utanPlats: { nr: number; rubrik: string }[];
    /** "2 247 stammar · 4,8 ha" - fakta om vad som gjordes. null = varken stammar eller areal kanda. */
    fakta: string | null;
    /** Det som saknas pa kartan och SKA sagas ("Stammolnet kunde inte lasas") - aldrig en tyst tom karta. */
    anmarkningar: string[];
    teckenforklaring: Teckenforklaring[];
  };
  /** Jamforelsen mot tidigare rundor. null tills den byggs (se RapportIndata.jamforelse). */
  jamforelse: JamforelseRad[] | null;
  bilaga: {
    bilder: Bild[];
    /** Foton pa en punkt utan text som varken ar en avvikelse eller en observation. Tas inte med. */
    utanText: number;
    /** Bilagans EGNA karta - till fotonumren: traktgrans, stammoln (blekt, for orientering) och de numrerade pinnarna. */
    karta: { granser: LatLng[][]; stammar: LatLng[]; pinnar: { nr: number; rubrik: string; plats: LatLng }[]; utanPlats: { nr: number; rubrik: string }[] };
  };
  filnamn: string;
};

// ---------------------------------------------------------------------------
// Hjalpare
// ---------------------------------------------------------------------------

const MANADER = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Svensk kalenderdag (aldrig enhetens zon) ur en tidsstampel: { ar, manad, dag }. */
function svDag(iso: string): { ar: number; manad: number; dag: number } | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const delar = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(t);
  const hamta = (typ: string) => Number(delar.find((d) => d.type === typ)?.value);
  return { ar: hamta('year'), manad: hamta('month'), dag: hamta('day') };
}

/**
 * "12 okt 2026" for ett besok pa en dag, "12–13 okt 2026" nar rundan gick over flera dagar.
 * Saknas starten ar det ett fel i datan och ingenting gissas; en pagaende runda har ingen slutdag,
 * da star bara startdagen.
 */
export function besokText(startad: string, klar: string | null): string {
  const a = svDag(startad);
  if (!a) return 'datum saknas';
  const b = klar ? svDag(klar) : null;
  const m = (i: number) => (MANADER[i - 1] ?? '');
  if (!b || (a.ar === b.ar && a.manad === b.manad && a.dag === b.dag)) return `${a.dag} ${m(a.manad)} ${a.ar}`;
  const delat = period(
    `${a.ar}-${String(a.manad).padStart(2, '0')}-${String(a.dag).padStart(2, '0')}`,
    `${b.ar}-${String(b.manad).padStart(2, '0')}-${String(b.dag).padStart(2, '0')}`,
  );
  return a.ar === b.ar ? `${delat} ${a.ar}` : (delat ?? 'datum saknas');
}

function tomtEllerNull(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
}

const TAL_FORMAT = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** 2247 -> "2 247" (hart mellanslag: talet far aldrig brytas over en rad). */
export function tusental(n: number): string {
  return Math.round(n).toLocaleString('sv-SE');
}

/** Hektar: hogst tva decimaler, utan avslutande nollor. 4 -> "4", 4.8 -> "4,8", 0.83 -> "0,83". */
export function arealText(ha: number): string {
  return String(Math.round(ha * 100) / 100).replace('.', ',');
}

/** "2 247 stammar · 4,8 ha". Skiljer sig stammar med position fran filens antal sags bada. null = inget av dem kant. */
export function faktaRad(stammar: LatLng[] | null, antalStammar: number | null, areal: number | null): string | null {
  const delar: string[] = [];
  const antal = antalStammar ?? (stammar && stammar.length > 0 ? stammar.length : null);
  if (antal !== null && antal > 0) {
    const medPos = stammar?.length ?? 0;
    delar.push(
      antalStammar !== null && medPos > 0 && medPos !== antalStammar
        ? `${tusental(antal)} stammar (${tusental(medPos)} med position)`
        : `${tusental(antal)} stammar`,
    );
  }
  if (areal !== null && Number.isFinite(areal) && areal > 0) delar.push(`${arealText(areal)} ha`);
  return delar.length === 0 ? null : delar.join(' · ');
}

function omdomeAv(status: string | null): Omdome | null {
  if (status === 'ok' || status === 'bra') return 'bra';
  if (status === 'godkant') return 'godkant';
  if (status === 'battre') return 'battre';
  if (status === 'avvikelse') return 'avvikelse';
  return null;
}

function rubrikAv(p: EgenkontrollPunkt): string {
  return tomtEllerNull(p.rubrik) ?? 'Punkt';
}

function typAv(p: EgenkontrollPunkt): string | null {
  const t = p.avvikelse_typ;
  if (!t) return null;
  return (AVVIKELSE_ETIKETT as Record<string, string>)[t] ?? (arObservationTyp(t) ? OBSERVATION_TYP_ETIKETT[t] : null);
}

function ordnad(a: EgenkontrollPunkt, b: EgenkontrollPunkt): number {
  return a.ordning - b.ordning || a.id.localeCompare(b.id);
}

function tidsordnad(a: EgenkontrollPunkt, b: EgenkontrollPunkt): number {
  const x = a.besvarad ?? '', y = b.besvarad ?? '';
  return x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id);
}

/** Egen position om punkten har en (avvikelsen, observationen), annars planens. */
function platsAv(p: EgenkontrollPunkt, platser: Record<string, LatLng | null>): LatLng | null {
  if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  return platser[p.id] ?? null;
}

function stycken(text: string | null): string[] | null {
  const delar = (text ?? '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '');
  return delar.length === 0 ? null : delar;
}

/** Filnamn utan tecken en delningsdialog eller ett filsystem stravar emot. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/å|ä/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'objekt';
}

/** "Hogstubbar (5)" - samma rubrik flera ganger blir en rad med antal. */
function medAntal(rubriker: string[]): string[] {
  const antal = new Map<string, number>();
  for (const r of rubriker) antal.set(r, (antal.get(r) ?? 0) + 1);
  return [...antal.entries()].map(([r, n]) => (n > 1 ? `${r} (${n})` : r));
}

// ---------------------------------------------------------------------------
// Modellen
// ---------------------------------------------------------------------------

export function byggRapport(i: RapportIndata): RapportModell {
  const { runda } = i;

  // 1. Talen: ANTAL over alla punkter med svar. Observationer ar inte med (de ar inte punkter).
  const tal: Tal = { bra: 0, battre: 0, avvikelse: 0, godkant: 0, obesvarade: 0 };
  for (const p of i.punkter) {
    const o = omdomeAv(p.status);
    if (o === null) tal.obesvarade += 1;
    else tal[o] += 1;
  }

  // 2. Fynd ur punkterna.
  const fotonPer = new Map<string, EgenkontrollFoto[]>();
  for (const f of i.foton) {
    if (!f.punkt_id) continue;
    fotonPer.set(f.punkt_id, [...(fotonPer.get(f.punkt_id) ?? []), f]);
  }

  const punktFynd = (p: EgenkontrollPunkt, omdome: Omdome): Fynd => ({
    nr: null,
    id: p.id,
    omdome,
    observation: false,
    rubrik: rubrikAv(p),
    typ: typAv(p),
    text: tomtEllerNull(p.kommentar),
    planText: tomtEllerNull(p.plan_kommentar),
    plats: platsAv(p, i.platser),
    antalBilder: (fotonPer.get(p.id) ?? []).length,
  });

  const fran = [...i.punkter].sort(ordnad);
  const avvikelser: Fynd[] = [];
  const battre: Fynd[] = [];
  const godkantAlla: Fynd[] = [];
  const braAlla: Fynd[] = [];
  for (const p of fran) {
    const o = omdomeAv(p.status);
    if (o === null) continue;
    const f = punktFynd(p, o);
    if (o === 'avvikelse') avvikelser.push(f);
    else if (o === 'battre') battre.push(f);
    else if (o === 'godkant') godkantAlla.push(f);
    else braAlla.push(f);
  }

  // Observationer: alltid listade och alltid numrerade - besiktaren valde att notera dem.
  const observationer: Fynd[] = [...i.observationer].sort(tidsordnad).map((p) => {
    const ton: ObservationTon = arObservationTon(p.status) ? p.status : 'battre';
    const typ = arObservationTyp(p.avvikelse_typ) ? OBSERVATION_TYP_ETIKETT[p.avvikelse_typ] : null;
    return {
      nr: null,
      id: p.id,
      omdome: ton,
      observation: true,
      // Observationen har ingen rubrik av sig sjalv (punkt.rubrik ar "Observation"): typen bar den.
      rubrik: typ ?? 'Observation',
      typ: null,
      text: tomtEllerNull(p.kommentar),
      planText: null,
      plats: platsAv(p, i.platser),
      antalBilder: (fotonPer.get(p.id) ?? []).length,
    };
  });

  // 3. Godkant/bra: bara de med en EGEN kommentar far ett eget kort och ett nummer; resten blir en rad.
  // Ett foto ensamt racker inte - en bild utan text bevisar ingenting (se punkt 5).
  const harInnehall = (f: Fynd) => f.text !== null;
  const delaUpp = (alla: Fynd[]) => ({
    fynd: alla.filter(harInnehall),
    ovriga: medAntal(alla.filter((f) => !harInnehall(f)).map((f) => f.rubrik)),
  });
  const godkant = delaUpp(godkantAlla);
  const bra = delaUpp(braAlla);

  // 4. Lopnummer i LASORDNING: avvikelser, kan bli battre, godkant, bra, observationer.
  let nr = 0;
  for (const grupp of [avvikelser, battre, godkant.fynd, bra.fynd, observationer]) {
    for (const f of grupp) f.nr = ++nr;
  }
  const allaNumrerade = [...avvikelser, ...battre, ...godkant.fynd, ...bra.fynd, ...observationer];
  const fyndPerId = new Map(allaNumrerade.map((f) => [f.id, f]));

  // 5. Bilagans foton. Bildtext: besiktarens kommentar, annars matningens varde, annars - bara for
  // avvikelse/kan bli battre/observation - rubrik och typ ur datan. Ett foto utan nagot av det pa en
  // punkt som inte ar ett problem tas inte med (counter): en bild utan text i en rapport till Vida ar
  // samre an ingen bild.
  const punktPer = new Map([...i.punkter, ...i.observationer].map((p) => [p.id, p]));
  const ytaPer = new Map(i.provytor.map((y) => [y.id, y]));
  const bilder: Bild[] = [];
  let utanText = 0;
  const fotoOrdning = [...i.foton].sort((a, b) => (a.skapad < b.skapad ? -1 : a.skapad > b.skapad ? 1 : a.id.localeCompare(b.id)));

  const fotonPerFynd = new Map<string, EgenkontrollFoto[]>();
  const ytefoton: EgenkontrollFoto[] = [];
  for (const f of fotoOrdning) {
    if (f.punkt_id && fyndPerId.has(f.punkt_id)) {
      fotonPerFynd.set(f.punkt_id, [...(fotonPerFynd.get(f.punkt_id) ?? []), f]);
    } else if (f.punkt_id) {
      // Foto pa en punkt som inte blev ett numrerat fynd: bra/godkant utan kommentar, eller en punkt
      // som inte finns i indata. Utan text och utan problem - raknas, tas inte med.
      const p = punktPer.get(f.punkt_id);
      if (f.tackningsgrad != null && p) {
        // En stubbematning ar sin egen text: tackningsgraden ar vardet bilden bevisar.
        bilder.push({
          fotoId: f.id, sokvag: f.sokvag, nr: null, del: { i: 1, av: 1 },
          text: `${rubrikAv(p)} · täckning ${TAL_FORMAT(Number(f.tackningsgrad))} %`,
          textKalla: 'matning', plats: f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : platsAv(p, i.platser),
        });
      } else {
        utanText += 1;
      }
    } else if (f.provyta_id) {
      ytefoton.push(f);
    }
  }

  for (const f of allaNumrerade) {
    const lista = fotonPerFynd.get(f.id) ?? [];
    lista.forEach((foto, idx) => {
      let text: string;
      let kalla: Bild['textKalla'];
      if (f.text) { text = f.text; kalla = 'kommentar'; }
      else if (foto.tackningsgrad != null) {
        text = `${f.rubrik} · täckning ${TAL_FORMAT(Number(foto.tackningsgrad))} %`; kalla = 'matning';
      } else {
        // Numrerade fynd utan kommentar ar avvikelse, kan bli battre eller observation (bra/godkant
        // numreras bara med kommentar): rubrik och typ ur datan, sa fotot aldrig saknar text.
        text = f.typ ? `${f.rubrik} · ${f.typ}` : f.rubrik; kalla = 'rubrik';
      }
      bilder.push({
        fotoId: foto.id, sokvag: foto.sokvag, nr: f.nr,
        del: { i: idx + 1, av: lista.length }, text, textKalla: kalla,
        plats: foto.lat != null && foto.lng != null ? { lat: foto.lat, lng: foto.lng } : f.plats,
      });
    });
  }
  for (const foto of ytefoton) {
    const y = ytaPer.get(foto.provyta_id ?? '');
    bilder.push({
      fotoId: foto.id, sokvag: foto.sokvag, nr: null, del: { i: 1, av: 1 },
      text: y ? `Provyta ${y.nummer}` : 'Provyta', textKalla: 'provyta',
      plats: foto.lat != null && foto.lng != null ? { lat: foto.lat, lng: foto.lng } : y && y.lat != null && y.lng != null ? { lat: y.lat, lng: y.lng } : null,
    });
  }
  // Numrerade foton i nummerordning (inom nummer: i den ordning de togs), sedan matning och provyta.
  bilder.sort((a, b) => (a.nr ?? 1e9) - (b.nr ?? 1e9) || a.del.i - b.del.i);

  // 6. Vektorkartan: en pin per numrerat fynd som har en plats; de utan plats listas, de tas aldrig bort.
  const pinnar = allaNumrerade
    .filter((f): f is Fynd & { plats: LatLng; nr: number } => f.plats !== null && f.nr !== null)
    .map((f) => ({ nr: f.nr, rubrik: f.rubrik, plats: f.plats }));
  const utanPlats = allaNumrerade
    .filter((f) => f.plats === null && f.nr !== null)
    .map((f) => ({ nr: f.nr as number, rubrik: f.rubrik }));

  // 7. Provytorna: samma funktion som rundvyn - aldrig en egen berakning.
  let provytor: string[] | null = null;
  if (runda.objekt_typ === 'gallring' && i.provytor.length > 0) {
    const s = sammanstallProvytor(i.provytor);
    const rader: string[] = [];
    const delar = [`${s.antalMatta} av ${s.antalYtor} ytor mätta`];
    if (s.antalOverhoppade > 0) delar.push(`${s.antalOverhoppade} överhoppade`);
    if (s.antalOmatta > 0) delar.push(`${s.antalOmatta} ej mätta`);
    rader.push(`Provytor: ${delar.join(', ')}`);
    if (s.skadeandel.procent !== null) {
      rader.push(`Skadeandel ${s.skadeandel.procent} % (${s.skadeandel.skadade} av ${s.skadeandel.trad} träd, ${s.skadeandel.ytor} ytor)`);
    }
    const medel = (etikett: string, enhet: string, m: { medel: number | null; n: number }) => {
      if (m.medel !== null) rader.push(`${etikett} ${TAL_FORMAT(m.medel)} ${enhet} (${m.n} av ${s.antalMatta} ytor)`);
    };
    medel('Stickvägsbredd', 'm', s.stickvagsbredd);
    medel('Stickvägsavstånd', 'm', s.stickvagsavstand);
    medel('Grundyta', 'm²/ha', s.grundyta);
    provytor = rader;
  }

  // 8. Kartan pa sida 1: lagren och teckenforklaringen. Teckenforklaringen har en rad per lager som FINNS.
  const markeringar = (i.markeringar ?? []).filter((m) => markeringsStil(m.slag, m.typ) !== null);
  const anmarkningar: string[] = [];
  if (i.stammar === null) anmarkningar.push('Stammolnet kunde inte läsas.');
  else if (i.stammar.length === 0) anmarkningar.push('Inga avverkade stammar hittades för objektet.');
  if (i.hyttspar === null) anmarkningar.push('Hyttsparet kunde inte läsas.');
  if (i.markeringar === null) anmarkningar.push('Planeringens markeringar kunde inte läsas.');
  if (i.noteringar === null) anmarkningar.push('Noteringarna kunde inte läsas.');
  const noteringar: KartNotering[] = (i.noteringar ?? [])
    .filter((n) => arMedIRapport(n) && n.underlag === 'karta' && n.koordinater.length > 0)
    .map((n): KartNotering => ({
      id: n.id, typ: n.typ, pil: n.pil, etikett: n.etikett, avsikt: 'blev',
      punkter: n.koordinater.map(([lng, lat]) => ({ lat, lng })),
    }));
  anmarkningar.push(...(i.extraAnmarkningar ?? []));
  const forklaring: Teckenforklaring[] = [];
  const lagg = (nyckel: string, etikett: string) => { if (!forklaring.some((f) => f.nyckel === nyckel)) forklaring.push({ nyckel, etikett }); };
  if (i.traktgrans.length > 0) lagg('traktgrans', 'Traktgräns');
  if ((i.stammar?.length ?? 0) > 0) lagg('stammar', 'Avverkad stam');
  for (const h of i.hyttspar ?? []) if (h.linjer.length > 0) lagg(`hyttspar:${h.roll}`, HYTTSPAR_ETIKETT[h.roll]);
  for (const m of markeringar) { const st = markeringsStil(m.slag, m.typ); if (st) lagg(st.nyckel, st.etikett); }
  if (markeringar.some((m) => m.slag === 'linje' && m.backvag)) lagg('backvag', 'Backväg (dubbla tvärstreck i änden)');
  if (noteringar.length > 0) lagg('notering:blev', 'Notering: så här blev det');
  if (pinnar.length > 0) lagg('kontrollpunkt', 'Kontrollpunkt (numret står i rapporten)');

  const maskingrupp = [
    runda.maskiner?.skordare_maskin ? `Skördare ${runda.maskiner.skordare_maskin}` : null,
    runda.maskiner?.skotare_maskin ? `Skotare ${runda.maskiner.skotare_maskin}` : null,
  ].filter(Boolean).join(' · ');

  const dag = svDag(runda.klar ?? runda.startad);
  const datumDel = dag ? `${dag.ar}-${String(dag.manad).padStart(2, '0')}-${String(dag.dag).padStart(2, '0')}` : 'utan-datum';

  return {
    utkast: runda.status !== 'klar',
    titel: 'Egenkontroll',
    huvud: {
      objektNamn: i.objektNamn,
      voNummer: i.voNummer,
      typ: runda.objekt_typ === 'gallring' ? 'Gallring' : 'Slutavverkning',
      besok: besokText(runda.startad, runda.klar),
      utfordAv: tomtEllerNull(runda.utford_av),
      maskingrupp: maskingrupp === '' ? null : maskingrupp,
    },
    tal,
    avvikelser,
    battre,
    godkant,
    bra,
    observationer,
    provytor,
    forutsattningar: forutsattningsRader(runda.vader, runda.maskiner),
    kommentar: stycken(runda.kommentar),
    karta: {
      granser: i.traktgrans,
      stammar: i.stammar ?? [],
      hyttspar: (i.hyttspar ?? []).filter((h) => h.linjer.length > 0),
      markeringar,
      noteringar,
      pinnar,
      utanPlats,
      fakta: faktaRad(i.stammar, i.antalStammar, i.areal),
      anmarkningar,
      teckenforklaring: forklaring,
    },
    jamforelse: i.jamforelse && i.jamforelse.length > 0 ? i.jamforelse : null,
    bilaga: { bilder, utanText, karta: { granser: i.traktgrans, stammar: i.stammar ?? [], pinnar, utanPlats } },
    filnamn: `egenkontroll-${slug(i.objektNamn)}-${datumDel}`,
  };
}

/** Tonens ord och tecken for en observation - samma som rundvyn (OBSERVATION_TON). */
export function tonText(ton: ObservationTon): string {
  return `${OBSERVATION_TON[ton].tecken} ${OBSERVATION_TON[ton].etikett}`;
}
